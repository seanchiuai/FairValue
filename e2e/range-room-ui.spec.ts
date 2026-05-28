import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };

test('range price-band rooms render host/player outcome controls and settle inside the band', async ({
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
      address: '88 Range UI Way',
      asking_price: 800000,
      market_draft: {
        source_type: 'manual',
        address: '88 Range UI Way',
        asking_price: 800000,
        market_format: 'range_price_band',
        band_low: 760000,
        band_high: 840000,
        market_question: 'Where will 88 Range UI Way settle relative to the band?',
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
    await expect(host.getByTestId('host-property-summary')).toContainText('Range price band');
    await expect(host.getByTestId('host-range-outcomes')).toContainText('Inside band');

    await player.goto(`/play/${roomCode}`);
    await player.getByLabel('Player nickname').fill('Range Player');
    await player.getByRole('button', { name: 'Join Room' }).click();
    await expect(player.getByTestId('player-range-read')).toContainText('Range market');
    await expect(player.getByTestId('player-range-market')).toContainText('Inside band');
    await expect(player.getByRole('button', { name: 'Bet $25 on Inside band' })).toBeVisible();

    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      player.getByRole('button', { name: 'Bet $25 on Inside band' }).click(),
    ]);
    await expect(player.getByTestId('player-positions')).toContainText('Inside band');
    await expect(host.getByTestId('activity-feed')).toContainText('Inside band', { timeout: 15_000 });

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toContainText('$760,000-$840,000');
    await host.getByLabel('Actual price').fill('800000');
    await expect(host.getByText('Inside band wins')).toBeVisible();
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('Inside band WINS', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-result')).toContainText('Inside band wins!', { timeout: 15_000 });
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});
