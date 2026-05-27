import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };

test('renovation-budget rooms render host/player controls and settle over budget', async ({
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
      address: '77 Permit UI Court',
      asking_price: 900000,
      market_draft: {
        source_type: 'manual',
        address: '77 Permit UI Court',
        asking_price: 900000,
        market_format: 'renovation_budget_over_under',
        budget_threshold: 125000,
        market_question: 'Will verified renovation cost exceed $125,000?',
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
    await expect(host.getByTestId('host-property-summary')).toContainText('Renovation budget over/under');
    await expect(host.getByTestId('host-property-summary')).toContainText('Budget $125,000');

    await player.goto(`/play/${roomCode}`);
    await player.getByLabel('Player nickname').fill('Reno Player');
    await player.getByRole('button', { name: 'Join Room' }).click();
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('Renovation-budget prices');
    await expect(player.getByRole('progressbar', { name: /going over renovation budget/ })).toBeVisible();

    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      player.getByRole('button', { name: 'Bet $25 on OVER' }).click(),
    ]);
    await expect(player.getByTestId('player-positions')).toContainText('OVER');
    await expect(host.getByTestId('activity-feed')).toContainText('OVER', { timeout: 15_000 });

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('$125,000 budget');
    await host.getByLabel('Verified cost').fill('140000');
    await expect(host.getByText('OVER wins vs $125,000 budget')).toBeVisible();
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('host-settlement-result')).toContainText('Verified cost: $140,000');
    await expect(player.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-result')).toContainText('Budget: $125,000');
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});
