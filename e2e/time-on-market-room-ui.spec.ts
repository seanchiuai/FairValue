import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };

test('time-on-market rooms render host/player controls and settle over the days threshold', async ({
  browser,
  browserName,
  request,
}: {
  browser: Browser;
  browserName: string;
  request: APIRequestContext;
}) => {
  const created = await request.post('/api/rooms', {
    data: {
      address: '88 Listing UI Lane',
      asking_price: 700000,
      market_draft: {
        source_type: 'manual',
        address: '88 Listing UI Lane',
        asking_price: 700000,
        market_format: 'time_on_market_over_under',
        days_threshold: 45,
        market_question: 'Will 88 Listing UI Lane take at least 45 days to go under contract?',
      },
    },
  });
  expect(created.ok()).toBeTruthy();
  const room = await created.json();
  const roomCode = room.room_code as string;
  const hostToken = room.host_token as string;

  const hostContext = await browser.newContext({ viewport: hostViewport });
  await hostContext.addInitScript(
    ({ code, token }) => {
      localStorage.setItem(`fv_host_token_${code}`, token);
      sessionStorage.setItem(`fv_host_token_${code}`, token);
    },
    { code: roomCode, token: hostToken }
  );
  const playerContext = await browser.newContext(
    browserName === 'firefox'
      ? { viewport: playerViewport, hasTouch: true }
      : { viewport: playerViewport, isMobile: true, hasTouch: true }
  );

  const host = await hostContext.newPage();
  const player = await playerContext.newPage();

  try {
    await host.goto(`/host/${roomCode}`);
    await expect(host.getByTestId('host-property-summary')).toContainText('Time on market over/under');
    await expect(host.getByTestId('host-property-summary')).toContainText('Threshold 45 days');

    await player.goto(`/play/${roomCode}`);
    await player.getByLabel('Player nickname').fill('Clock Player');
    await player.getByRole('button', { name: 'Join Room' }).click();
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('Time-on-market prices');
    await expect(player.getByRole('progressbar', { name: /going over days threshold/ })).toBeVisible();

    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      player.getByRole('button', { name: 'Bet $25 on OVER' }).click(),
    ]);
    await expect(player.getByTestId('player-positions')).toContainText('OVER');
    await expect(host.getByTestId('activity-feed')).toContainText('OVER', { timeout: 15_000 });

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('45 days threshold');
    await host.getByLabel('Days on market').fill('52');
    await expect(host.getByText('OVER wins vs 45 days threshold')).toBeVisible();
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('host-settlement-result')).toContainText('Days on market: 52');
    await expect(player.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-result')).toContainText('Threshold: 45 days');
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});
