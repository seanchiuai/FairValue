import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';

const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };
const backendPort = process.env.E2E_BACKEND_PORT || '8000';
const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
const wsBaseUrl = `ws://127.0.0.1:${backendPort}`;

const property = {
  address: '88 Resilience Way',
  askingPrice: 720000,
  actualPrice: 735000,
};

type RoomResponse = {
  room_code: string;
  host_token: string;
};

type RoomSocket = {
  messages: Array<Record<string, unknown>>;
  socket: WebSocket;
};

async function createRoom(request: APIRequestContext): Promise<RoomResponse> {
  const response = await request.post(`${apiBaseUrl}/api/rooms`, {
    data: { address: property.address, asking_price: property.askingPrice },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.room_code).toMatch(/^[A-Z0-9]{4}$/);
  expect(body.host_token).toBeTruthy();
  return body;
}

async function connectRoomSocket(roomCode: string): Promise<RoomSocket> {
  const socket = new WebSocket(`${wsBaseUrl}/ws/${roomCode}`);
  const messages: Array<Record<string, unknown>> = [];
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out opening room socket ${roomCode}`)), 10_000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return { socket, messages };
}

async function joinByApi(request: APIRequestContext, roomCode: string, sessionId: string, nickname: string) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/join`, {
    data: { session_id: sessionId, nickname },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function betByApi(
  request: APIRequestContext,
  roomCode: string,
  sessionId: string,
  idempotencyKey: string,
  outcome: 'over' | 'under',
  wager: number
) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/bet`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { session_id: sessionId, outcome, wager },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

function countMessages(messages: Array<Record<string, unknown>>, type: string) {
  return messages.filter((message) => message.type === type).length;
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });
}

async function createRoomThroughUi(page: Page) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('A11y Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  const roomCode = new URL(page.url()).pathname.split('/').pop();
  if (!roomCode) throw new Error('Room code was not present in host URL');
  await expectConnected(page);
  return roomCode;
}

async function joinRoomThroughUi(page: Page, roomCode: string) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill('A11y Player');
  await page.getByLabel('Room code').fill(roomCode.toLowerCase());
  await page.getByRole('button', { name: /^Join Room$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${roomCode}$`));
  await expectConnected(page);
}

function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `    - ${node.target.join(' ')}: ${node.failureSummary || 'no failure summary'}`)
        .join('\n');
      return `  ${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
    })
    .join('\n\n');
}

async function expectNoSeriousAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((violation) =>
    violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(violations, `${label} accessibility violations:\n${formatViolations(violations)}`).toEqual([]);
}

test('room API and WebSocket loop handles a burst of joins and bets', async ({ request }) => {
  const { room_code: roomCode } = await createRoom(request);
  const { socket, messages } = await connectRoomSocket(roomCode);
  const players = Array.from({ length: 12 }, (_, index) => ({
    sessionId: `load-player-${Date.now()}-${index}`,
    nickname: `Load ${index + 1}`,
    outcome: index % 2 === 0 ? 'over' as const : 'under' as const,
    wager: 10 + (index % 4) * 5,
  }));

  try {
    const joins = await Promise.all(
      players.map((player) => joinByApi(request, roomCode, player.sessionId, player.nickname))
    );
    expect(joins).toHaveLength(players.length);
    await expect.poll(() => countMessages(messages, 'join'), { timeout: 10_000 }).toBe(players.length);

    const bets = await Promise.all(
      players.map((player, index) =>
        betByApi(
          request,
          roomCode,
          player.sessionId,
          `load-bet-${player.sessionId}`,
          player.outcome,
          player.wager + index
        )
      )
    );
    expect(bets).toHaveLength(players.length);
    await expect.poll(() => countMessages(messages, 'bet'), { timeout: 10_000 }).toBe(players.length);

    const duplicate = await betByApi(
      request,
      roomCode,
      players[0].sessionId,
      `load-bet-${players[0].sessionId}`,
      players[0].outcome,
      players[0].wager
    );
    expect(duplicate.idempotent_replay).toBe(true);

    const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
    expect(stateResponse.status()).toBe(200);
    const state = await stateResponse.json();
    expect(state.players).toHaveLength(players.length);
    expect(state.market.total_trades).toBe(players.length);
    expect(state.market.total_wagered).toBeGreaterThan(0);
    expect(state.event_sequence).toBeGreaterThanOrEqual(players.length * 2);
  } finally {
    socket.close();
  }
});

test('core room surfaces pass serious accessibility checks without console errors', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const consoleIssues: string[] = [];
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const playerContext = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();

  for (const [label, page] of [['host', host], ['player', player]] as const) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }

  try {
    await host.goto('/join');
    await expect(host.getByRole('heading', { name: 'FairValue' })).toBeVisible();
    await expectNoSeriousAxeViolations(host, 'join pick screen');

    const roomCode = await createRoomThroughUi(host);
    await expect(host.getByText(property.address)).toBeVisible();
    await expectNoSeriousAxeViolations(host, 'host room screen');

    await joinRoomThroughUi(player, roomCode);
    await expect(player.getByText(property.address)).toBeVisible();
    await expectNoSeriousAxeViolations(player, 'player room screen');

    expect(consoleIssues).toEqual([]);
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});

test('expanded routes, forms, and modal states pass serious accessibility checks', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const consoleIssues: string[] = [];
  const desktopContext = await browser.newContext({ viewport: hostViewport });
  const mobileContext = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  const cognee503Endpoints = new Set<string>();

  for (const [label, page] of [['desktop', desktop], ['mobile', mobile]] as const) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }
  desktop.on('response', (response) => {
    if (response.status() !== 503) return;
    const endpoint = new URL(response.url()).pathname.match(/\/api\/ai\/cognee\/markets\/[^/]+\/([^/]+)$/)?.[1];
    if (endpoint) cognee503Endpoints.add(endpoint);
  });

  try {
    await desktop.goto('/');
    await expect(desktop.getByText('FairValue').first()).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousAxeViolations(desktop, 'desktop market browse route');

    await desktop.getByRole('button', { name: /Price: High to Low/ }).click();
    await expect(desktop.getByRole('button', { name: /Price: Low to High/ })).toBeVisible();
    await expectNoSeriousAxeViolations(desktop, 'desktop market sort menu state');

    await desktop.goto('/market/440298192');
    await expect(desktop.getByText('Multiplayer Mode')).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousAxeViolations(desktop, 'desktop property market route');

    await mobile.goto('/join');
    await mobile.getByRole('button', { name: /Create Room/ }).click();
    await expect(mobile.getByLabel('Host nickname')).toBeVisible();
    await expectNoSeriousAxeViolations(mobile, 'mobile create-room form');
    await mobile.getByRole('button', { name: /Back/ }).click();
    await mobile.getByRole('button', { name: /Join Room/ }).click();
    await expect(mobile.getByLabel('Room code')).toBeVisible();
    await expectNoSeriousAxeViolations(mobile, 'mobile join-room form');

    const roomCode = await createRoomThroughUi(desktop);
    await expect(desktop.getByText(property.address)).toBeVisible();

    await desktop.getByRole('button', { name: /Settle/ }).click();
    await expect(desktop.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await expectNoSeriousAxeViolations(desktop, 'desktop settle modal');
    await desktop.getByRole('button', { name: /Cancel/ }).click();

    await Promise.all([
      desktop.waitForResponse((response) =>
        response.url().includes('/api/ai/cognee/markets/') &&
        response.url().includes('/search') &&
        response.status() === 503
      ),
      desktop.getByRole('button', { name: 'Market summary' }).click(),
    ]);
    await expect(desktop.getByText('Set COGNEE_API_KEY on the server to enable Cognee analysis.')).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxeViolations(desktop, 'desktop AI degraded response state');

    await joinRoomThroughUi(mobile, roomCode);
    await mobile.getByRole('button', { name: 'Set wager to $100' }).click();
    await expect(mobile.getByLabel('Custom wager')).toHaveValue('100');
    await expectNoSeriousAxeViolations(mobile, 'mobile player custom wager state');

    const expectedCogneeResourceError =
      'desktop: Failed to load resource: the server responded with a status of 503 (Service Unavailable)';
    const expectedResourceErrorCount = consoleIssues.filter((issue) => issue === expectedCogneeResourceError).length;
    const unexpectedConsoleIssues = consoleIssues.filter((issue) => issue !== expectedCogneeResourceError);
    expect(unexpectedConsoleIssues).toEqual([]);
    expect([...cognee503Endpoints].sort()).toEqual(['initialize', 'search', 'state']);
    expect(expectedResourceErrorCount).toBe(cognee503Endpoints.size);
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
});
