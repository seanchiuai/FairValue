import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };
const storePath = process.env.FAIRVALUE_ROOM_STORE_PATH || '';
const renderedPlayerCount = Number(process.env.FAIRVALUE_BROWSER_LOAD_PLAYERS || 10);
const property = {
  address: '242 Browser Load Boulevard',
  askingPrice: '760000',
  actualPrice: '781000',
};

type RenderedPlayer = {
  page: Page;
  nickname: string;
  outcome: 'OVER' | 'UNDER';
  wager: number;
};

function expectSupportedPlayerCount() {
  expect(Number.isInteger(renderedPlayerCount)).toBe(true);
  expect(renderedPlayerCount).toBeGreaterThanOrEqual(4);
  expect(renderedPlayerCount).toBeLessThanOrEqual(16);
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 20_000 });
}

async function createRoomThroughUi(page: Page) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Browser Load Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(property.askingPrice);
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  const roomCode = new URL(page.url()).pathname.split('/').pop();
  expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);
  if (!roomCode) throw new Error('Room code was not present in host URL');
  await expect(page.getByText(property.address)).toBeVisible({ timeout: 20_000 });
  await expectConnected(page);
  return roomCode;
}

async function joinRenderedPlayer(player: RenderedPlayer, roomCode: string) {
  await player.page.goto(`/play/${roomCode}`);
  await expect(player.page.getByText(property.address)).toBeVisible({ timeout: 20_000 });
  await player.page.getByLabel('Player nickname').fill(player.nickname);
  await Promise.all([
    player.page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
    ),
    player.page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);
  await expectConnected(player.page);
}

async function placeRenderedBet(player: RenderedPlayer, roomCode: string) {
  await player.page.getByRole('button', { name: `Set wager to $${player.wager}`, exact: true }).click();
  await Promise.all([
    player.page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
    ),
    player.page.getByRole('button', { name: `Bet $${player.wager} on ${player.outcome}`, exact: true }).click(),
  ]);
  await expect(player.page.getByTestId('player-positions')).toContainText(player.outcome, { timeout: 20_000 });
  await expect(player.page.getByTestId('player-positions')).toContainText(`$${player.wager}`);
}

async function closeContexts(contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('rendered host plus many mobile players survive concurrent joins, bets, and settlement', async ({
  browser,
}: {
  browser: Browser;
}) => {
  expectSupportedPlayerCount();

  const consoleIssues: string[] = [];
  const startedAt = Date.now();
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const host = await hostContext.newPage();
  const playerContexts: BrowserContext[] = [];
  const players: RenderedPlayer[] = [];

  function capturePageIssues(label: string, page: Page) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }

  capturePageIssues('host', host);

  try {
    const roomCode = await createRoomThroughUi(host);
    const wagers = [10, 25, 50, 100];

    for (let index = 0; index < renderedPlayerCount; index += 1) {
      const context = await browser.newContext({
        viewport: playerViewport,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const nickname = `Rendered Load ${String(index + 1).padStart(2, '0')}`;
      capturePageIssues(nickname, page);
      playerContexts.push(context);
      players.push({
        page,
        nickname,
        outcome: index % 2 === 0 ? 'OVER' : 'UNDER',
        wager: wagers[index % wagers.length],
      });
    }

    const joinStartedAt = Date.now();
    await Promise.all(players.map((player) => joinRenderedPlayer(player, roomCode)));
    const joinMs = Date.now() - joinStartedAt;
    await expect(host.getByTestId('host-player-count')).toContainText(`${renderedPlayerCount + 1} players`, {
      timeout: 30_000,
    });
    await expect(host.getByTestId('leaderboard')).toContainText(players[0].nickname);
    await expect(host.getByTestId('leaderboard')).toContainText(players[players.length - 1].nickname);

    const betStartedAt = Date.now();
    await Promise.all(players.map((player) => placeRenderedBet(player, roomCode)));
    const betMs = Date.now() - betStartedAt;
    const expectedWagered = players.reduce((sum, player) => sum + player.wager, 0);
    await expect(host.getByTestId('total-trades')).toHaveText(String(renderedPlayerCount), { timeout: 30_000 });
    await expect(host.getByTestId('total-volume')).toHaveText(`$${expectedWagered}`);
    await expect(host.getByTestId('activity-feed')).toContainText(players[players.length - 1].nickname);

    const settleStartedAt = Date.now();
    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await host.getByLabel('Actual price').fill(property.actualPrice);
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /Confirm Settlement/ }).click(),
    ]);
    const settleMs = Date.now() - settleStartedAt;
    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 30_000 });
    await Promise.all(
      players.map((player) =>
        expect(player.page.getByTestId('player-settlement-result')).toContainText('OVER wins!', {
          timeout: 30_000,
        })
      )
    );

    expect(consoleIssues).toEqual([]);

    if (storePath) {
      const snapshot = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      const snapshotRoom = snapshot.rooms[roomCode];
      expect(snapshotRoom).toBeTruthy();
      expect(Object.keys(snapshotRoom.players)).toHaveLength(renderedPlayerCount + 1);
      expect(snapshotRoom.market.total_trades).toBe(renderedPlayerCount);
      expect(snapshotRoom.market.total_wagered).toBeCloseTo(expectedWagered, 2);
      expect(snapshotRoom.settled).toBe(true);
    }

    const totalMs = Date.now() - startedAt;
    console.log(
      `Rendered browser load profile: room=${roomCode} players=${renderedPlayerCount} join_ms=${joinMs} bet_ms=${betMs} settle_ms=${settleMs} total_ms=${totalMs} wagered=${expectedWagered}`
    );
  } finally {
    await closeContexts(playerContexts);
    await hostContext.close();
  }
});
