import { expect, test, type Browser, type Page } from '@playwright/test';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };
const property = {
  address: '123 E2E Test Ave',
  askingPrice: '700000',
  actualPrice: '710000',
};

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });
}

async function joinRoomByCode(page: Page, roomCode: string, nickname: string) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill(nickname);
  await page.getByLabel('Room code').fill(roomCode.toLowerCase());
  await expect(page.getByLabel('Room code')).toHaveValue(roomCode);
  await page.getByRole('button', { name: /^Join Room$/ }).click();

  await expect(page).toHaveURL(new RegExp(`/play/${roomCode}$`));
  await expect(page.getByText(property.address)).toBeVisible({ timeout: 15_000 });
  await expectConnected(page);
}

async function clickBetAndWait(page: Page, roomCode: string, buttonName: RegExp) {
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
    ),
    page.getByRole('button', { name: buttonName }).click(),
  ]);
}

test('host and two players can bet, reconnect, toggle AI, and settle a room', async ({
  browser,
  browserName,
}: {
  browser: Browser;
  browserName: string;
}) => {
  const playerContextOptions =
    browserName === 'firefox'
      ? { viewport: playerViewport, hasTouch: true }
      : { viewport: playerViewport, isMobile: true, hasTouch: true };
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const playerOneContext = await browser.newContext(playerContextOptions);
  const playerTwoContext = await browser.newContext(playerContextOptions);

  const host = await hostContext.newPage();
  const playerOne = await playerOneContext.newPage();
  const playerTwo = await playerTwoContext.newPage();

  try {
    expect(host.viewportSize()).toEqual(hostViewport);
    expect(playerOne.viewportSize()).toEqual(playerViewport);
    expect(playerTwo.viewportSize()).toEqual(playerViewport);

    await host.goto('/join');
    await host.getByRole('button', { name: /Create Room/ }).click();
    await host.getByLabel('Host nickname').fill('QA Host');
    await host.getByLabel('Property address').fill(property.address);
    await host.getByLabel('Asking price').fill(property.askingPrice);
    await host.getByRole('button', { name: /^Create Room$/ }).click();

    await expect(host).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
    const roomCode = new URL(host.url()).pathname.split('/').pop();
    expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);
    if (!roomCode) throw new Error('Room code was not present in host URL');

    await expect(host.getByText(property.address)).toBeVisible({ timeout: 15_000 });
    await expect(host.getByTestId('host-player-count')).toContainText('1 player');
    await expectConnected(host);

    await joinRoomByCode(playerOne, roomCode, 'Player One');
    await joinRoomByCode(playerTwo, roomCode, 'Player Two');

    await expect(host.getByTestId('host-player-count')).toContainText('3 players', { timeout: 15_000 });
    await expect(host.getByTestId('leaderboard')).toContainText('Player One');
    await expect(host.getByTestId('leaderboard')).toContainText('Player Two');

    await host.getByRole('button', { name: 'Start 5 min discussion' }).click();
    await expect(host.getByTestId('host-phase-status')).toContainText('Discussion timer');
    await expect(host.getByTestId('host-phase-timer')).toContainText('Ends in');
    await host.getByRole('button', { name: 'Lock betting' }).click();
    await expect(host.getByTestId('host-phase-status')).toContainText('Betting locked');
    await playerOne.getByRole('button', { name: /Bet \$25 on OVER/ }).click();
    await expect(playerOne.getByTestId('bet-error')).toContainText('Betting is locked by the host');
    await host.getByRole('button', { name: 'Open betting' }).click();
    await expect(host.getByTestId('host-phase-status')).toContainText('Betting open');

    await clickBetAndWait(playerOne, roomCode, /Bet \$25 on OVER/);
    await playerTwo.getByRole('button', { name: 'Set wager to $50' }).click();
    await clickBetAndWait(playerTwo, roomCode, /Bet \$50 on UNDER/);

    await expect(host.getByTestId('total-trades')).toHaveText('2', { timeout: 15_000 });
    await expect(host.getByTestId('total-volume')).toHaveText('$75');
    await expect(host.getByTestId('avg-bet')).toHaveText('$38');
    await expect(host.getByTestId('activity-feed')).toContainText('Player One');
    await expect(host.getByTestId('activity-feed')).toContainText('Player Two');
    await expect(host.getByTestId('activity-feed')).toContainText('OVER');
    await expect(host.getByTestId('activity-feed')).toContainText('UNDER');

    await host.getByRole('button', { name: 'AI bot disabled', exact: true }).click();
    await expect(host.getByRole('button', { name: 'AI bot enabled', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await host.getByRole('button', { name: 'AI bot enabled', exact: true }).click();
    await expect(host.getByRole('button', { name: 'AI bot disabled', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await playerOne.reload();
    await expectConnected(playerOne);
    await expect(playerOne.getByText(property.address)).toBeVisible();
    await expect(playerOne.getByTestId('player-positions')).toContainText('OVER');
    await expect(playerOne.getByTestId('player-positions')).toContainText('$25');

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await host.getByLabel('Actual price').fill(property.actualPrice);
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('activity-feed')).toContainText('Market settled');
    await expect(playerOne.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(playerOne.getByTestId('player-settlement-result')).toContainText('Player One');
    await expect(playerTwo.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(playerTwo.getByTestId('player-settlement-result')).toContainText('Player Two');
  } finally {
    await hostContext.close();
    await playerOneContext.close();
    await playerTwoContext.close();
  }
});
