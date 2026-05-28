import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };

test('neighborhood price-momentum rooms render host/player controls and settle over the ZIP median threshold', async ({
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
      address: '94607 Momentum UI House',
      asking_price: 950000,
      market_draft: {
        source_type: 'manual',
        address: '94607 Momentum UI House',
        asking_price: 950000,
        market_format: 'neighborhood_price_momentum_over_under',
        baseline_median_price: 950000,
        price_momentum_threshold: 978500,
        zip: '94607',
        comparison_window: 'next_provider_snapshot_90_days',
        market_question: 'Will 94607 median home price clear $978,500?',
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
    await expect(host.getByTestId('host-property-summary')).toContainText('Neighborhood price momentum');
    await expect(host.getByTestId('host-property-summary')).toContainText('Threshold $978,500');

    await player.goto(`/play/${roomCode}`);
    await player.getByLabel('Player nickname').fill('Momentum Player');
    await player.getByRole('button', { name: 'Join Room' }).click();
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('Neighborhood price-momentum prices');
    await expect(player.getByRole('progressbar', { name: /going over ZIP median threshold/ })).toBeVisible();

    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      player.getByRole('button', { name: 'Bet $25 on OVER' }).click(),
    ]);
    await expect(player.getByTestId('player-positions')).toContainText('OVER');
    await expect(host.getByTestId('activity-feed')).toContainText('OVER', { timeout: 15_000 });

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('$978,500 threshold');
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('future ZIP aggregate snapshot metadata');
    await host.getByLabel('Future ZIP median price').fill('990000');
    await expect(host.getByText('OVER wins vs $978,500 threshold')).toBeVisible();
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('host-settlement-result')).toContainText('Future ZIP median: $990,000');
    await expect(player.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-result')).toContainText('Future ZIP median: $990,000');
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});
