import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };

test('rent-yield rooms render host/player controls and settle over the yield threshold', async ({
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
      address: '404 Yield UI Way',
      asking_price: 800000,
      market_draft: {
        source_type: 'manual',
        address: '404 Yield UI Way',
        asking_price: 800000,
        market_format: 'rent_yield_over_under',
        yield_threshold: 0.05,
        market_question: 'Will 404 Yield UI Way clear a 5% annual rent yield?',
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
    await expect(host.getByTestId('host-property-summary')).toContainText('Rent yield over/under');
    await expect(host.getByTestId('host-property-summary')).toContainText('Threshold 5%');

    await player.goto(`/play/${roomCode}`);
    await player.getByLabel('Player nickname').fill('Yield Player');
    await player.getByRole('button', { name: 'Join Room' }).click();
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('Rent-yield prices');
    await expect(player.getByRole('progressbar', { name: /going over yield threshold/ })).toBeVisible();

    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      player.getByRole('button', { name: 'Bet $25 on OVER' }).click(),
    ]);
    await expect(player.getByTestId('player-positions')).toContainText('OVER');
    await expect(host.getByTestId('activity-feed')).toContainText('OVER', { timeout: 15_000 });

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('5% yield');
    await host.getByLabel('Settlement price').fill('800000');
    await host.getByLabel('Annual rent').fill('48000');
    await expect(host.getByText('OVER wins at 6% yield')).toBeVisible();
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('host-settlement-result')).toContainText('Yield: 6%');
    await expect(player.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-result')).toContainText('Yield: 6%');
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});
