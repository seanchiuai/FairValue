import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };
const backendPort = process.env.E2E_BACKEND_PORT || '8033';
const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
const storePath = process.env.FAIRVALUE_ROOM_STORE_PATH || '';
const slowRenderedPlayers = Number(process.env.FAIRVALUE_MIXED_SLOW_PLAYERS || 4);
const apiChurnPlayers = Number(process.env.FAIRVALUE_MIXED_API_PLAYERS || 12);
const property = {
  address: '616 Mixed Traffic Terrace',
  askingPrice: '790000',
  actualPrice: '812000',
};

type SlowPlayer = {
  context: BrowserContext;
  page: Page;
  nickname: string;
  outcome: 'OVER' | 'UNDER';
  wager: number;
};

type ApiChurnResult = {
  players: number;
  trades: number;
  wagered: number;
  stateReads: number;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectSupportedProfile() {
  expect(Number.isInteger(slowRenderedPlayers)).toBe(true);
  expect(Number.isInteger(apiChurnPlayers)).toBe(true);
  expect(slowRenderedPlayers).toBeGreaterThanOrEqual(2);
  expect(slowRenderedPlayers).toBeLessThanOrEqual(8);
  expect(apiChurnPlayers).toBeGreaterThanOrEqual(4);
  expect(apiChurnPlayers).toBeLessThanOrEqual(20);
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 30_000 });
}

async function createRoomThroughUi(page: Page) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Mixed Traffic Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(property.askingPrice);
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  const roomCode = new URL(page.url()).pathname.split('/').pop();
  expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);
  if (!roomCode) throw new Error('Room code was not present in host URL');
  await expect(page.getByText(property.address)).toBeVisible({ timeout: 30_000 });
  await expectConnected(page);
  return roomCode;
}

async function createSlowMobileContext(browser: Browser, index: number) {
  const context = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });

  await context.route('**/*', async (route) => {
    const resourceType = route.request().resourceType();
    if (['document', 'script', 'stylesheet', 'fetch', 'xhr'].includes(resourceType)) {
      await delay(120 + (index % 3) * 60);
    }
    await route.continue();
  });

  return context;
}

async function applyChromiumNetworkThrottle(context: BrowserContext, page: Page) {
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 250,
    downloadThroughput: (220 * 1024) / 8,
    uploadThroughput: (140 * 1024) / 8,
  });
}

async function makeSlowPlayer(browser: Browser, index: number): Promise<SlowPlayer> {
  const context = await createSlowMobileContext(browser, index);
  const page = await context.newPage();
  await applyChromiumNetworkThrottle(context, page);
  return {
    context,
    page,
    nickname: `Slow Rendered ${index + 1}`,
    outcome: index % 2 === 0 ? 'OVER' : 'UNDER',
    wager: [10, 25, 50, 100][index % 4],
  };
}

async function joinSlowPlayer(player: SlowPlayer, roomCode: string) {
  await player.page.goto(`/play/${roomCode}`);
  await expect(player.page.getByText(property.address)).toBeVisible({ timeout: 60_000 });
  await player.page.getByLabel('Player nickname').fill(player.nickname);
  await Promise.all([
    player.page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
    ),
    player.page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);
  await expectConnected(player.page);
}

async function betSlowPlayer(player: SlowPlayer, roomCode: string) {
  await player.page.getByRole('button', { name: `Set wager to $${player.wager}`, exact: true }).click();
  await Promise.all([
    player.page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
    ),
    player.page.getByRole('button', { name: `Bet $${player.wager} on ${player.outcome}`, exact: true }).click(),
  ]);
  await expect(player.page.getByTestId('player-positions')).toContainText(player.outcome, { timeout: 60_000 });
}

async function postJson(
  request: APIRequestContext,
  pathname: string,
  data: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const response = await request.post(`${apiBaseUrl}${pathname}`, {
    headers,
    data,
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function runApiChurn(request: APIRequestContext, roomCode: string): Promise<ApiChurnResult> {
  const players = Array.from({ length: apiChurnPlayers }, (_, index) => ({
    sessionId: `mixed-api-${Date.now()}-${index}`,
    nickname: `API Churn ${index + 1}`,
    outcome: index % 2 === 0 ? 'over' : 'under',
    wager: 12 + (index % 6) * 3,
    key: `mixed-api-bet-${Date.now()}-${index}`,
  }));
  let stateReads = 0;

  const poller = (async () => {
    for (let index = 0; index < 18; index += 1) {
      const response = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
      expect([200, 404]).toContain(response.status());
      stateReads += 1;
      await delay(70);
    }
  })();

  await Promise.all(players.map(async (player, index) => {
    await delay((index % 4) * 35);
    await postJson(request, `/api/rooms/${roomCode}/join`, {
      session_id: player.sessionId,
      nickname: player.nickname,
    });
    await delay((index % 3) * 40);
    await postJson(
      request,
      `/api/rooms/${roomCode}/bet`,
      {
        session_id: player.sessionId,
        outcome: player.outcome,
        wager: player.wager,
      },
      { 'Idempotency-Key': player.key }
    );
  }));
  await poller;

  return {
    players: players.length,
    trades: players.length,
    wagered: players.reduce((sum, player) => sum + player.wager, 0),
    stateReads,
  };
}

async function closeSlowPlayers(players: SlowPlayer[]) {
  await Promise.all(players.map((player) => player.context.close().catch(() => undefined)));
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test('host stays coherent with slow rendered clients and concurrent API churn', async ({
  browser,
  request,
}: {
  browser: Browser;
  request: APIRequestContext;
}) => {
  expectSupportedProfile();

  const timings: Record<string, number> = {};
  const startedAt = Date.now();
  const consoleIssues: string[] = [];
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const host = await hostContext.newPage();
  const slowPlayers: SlowPlayer[] = [];

  function capturePageIssues(label: string, page: Page) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }

  capturePageIssues('host', host);

  try {
    const roomCode = await createRoomThroughUi(host);
    for (let index = 0; index < slowRenderedPlayers; index += 1) {
      const player = await makeSlowPlayer(browser, index);
      capturePageIssues(player.nickname, player.page);
      slowPlayers.push(player);
    }

    const joinStartedAt = Date.now();
    const slowJoin = Promise.all(slowPlayers.map((player) => joinSlowPlayer(player, roomCode)));
    const apiChurn = runApiChurn(request, roomCode);
    const [apiResult] = await Promise.all([apiChurn, slowJoin]);
    timings.join_and_api_churn_ms = Date.now() - joinStartedAt;

    const expectedPlayers = 1 + slowRenderedPlayers + apiResult.players;
    await expect(host.getByTestId('host-player-count')).toContainText(`${expectedPlayers} players`, {
      timeout: 60_000,
    });
    await expect(host.getByTestId('leaderboard')).toContainText(slowPlayers[0].nickname);
    await expect(host.getByTestId('leaderboard')).toContainText(`API Churn ${apiChurnPlayers}`);

    const renderedBetStartedAt = Date.now();
    await Promise.all(slowPlayers.map((player) => betSlowPlayer(player, roomCode)));
    timings.slow_rendered_bet_ms = Date.now() - renderedBetStartedAt;

    const slowWagered = slowPlayers.reduce((sum, player) => sum + player.wager, 0);
    const expectedTrades = slowRenderedPlayers + apiResult.trades;
    const expectedWagered = slowWagered + apiResult.wagered;
    await expect(host.getByTestId('total-trades')).toHaveText(String(expectedTrades), { timeout: 60_000 });
    await expect(host.getByTestId('total-volume')).toHaveText(`$${expectedWagered}`);
    await expect(host.getByTestId('activity-feed')).toContainText(slowPlayers[slowPlayers.length - 1].nickname);

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
    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 60_000 });
    await Promise.all(
      slowPlayers.map((player) =>
        expect(player.page.getByTestId('player-settlement-result')).toContainText('OVER wins!', {
          timeout: 60_000,
        })
      )
    );
    timings.settlement_broadcast_ms = Date.now() - settleStartedAt;

    expect(consoleIssues).toEqual([]);

    if (storePath) {
      const snapshot = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      const snapshotRoom = snapshot.rooms[roomCode];
      expect(snapshotRoom).toBeTruthy();
      expect(Object.keys(snapshotRoom.players)).toHaveLength(expectedPlayers);
      expect(snapshotRoom.market.total_trades).toBe(expectedTrades);
      expect(snapshotRoom.market.total_wagered).toBeCloseTo(expectedWagered, 2);
      expect(snapshotRoom.settled).toBe(true);
    }

    console.log(
      `Mixed traffic profile: room=${roomCode} slow_players=${slowRenderedPlayers} api_players=${apiResult.players} state_reads=${apiResult.stateReads} joins_churn_ms=${timings.join_and_api_churn_ms} slow_bets_ms=${timings.slow_rendered_bet_ms} settle_ms=${timings.settlement_broadcast_ms} total_ms=${Date.now() - startedAt} trades=${expectedTrades} wagered=${expectedWagered}`
    );
  } finally {
    await closeSlowPlayers(slowPlayers);
    await hostContext.close();
  }
});
