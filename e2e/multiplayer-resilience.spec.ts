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

async function settleByApi(
  request: APIRequestContext,
  roomCode: string,
  hostToken: string,
  actualPrice: number
) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/settle`, {
    headers: { 'X-FairValue-Host-Token': hostToken },
    data: { actual_price: actualPrice },
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

test('public recap route summarizes settled rooms without host-only audit data', async ({ request, page }) => {
  const { room_code: roomCode, host_token: hostToken } = await createRoom(request);
  const recapPlayer = `recap-player-${Date.now()}`;
  await joinByApi(request, roomCode, recapPlayer, 'Recap Player');
  await betByApi(request, roomCode, recapPlayer, `recap-bet-${roomCode}`, 'over', 50);
  await settleByApi(request, roomCode, hostToken, property.actualPrice);

  await page.goto(`/recap/${roomCode}`);
  await expect(page.getByTestId('room-public-recap-summary')).toContainText('Share-safe recap', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('room-public-recap-evidence')).toContainText('Settlement result');
  await expect(page.getByTestId('room-public-recap-evidence')).toContainText('$735,000');
  await expect(page.getByTestId('room-public-recap-guardrails')).toContainText('Host-only event log is not included');
  await expect(page.getByTestId('room-public-recap-guardrails')).toContainText('host tokens/user tokens are never shown');
  await expect(page.getByTestId('room-public-recap-page')).not.toContainText(hostToken);
  await expectNoSeriousAxeViolations(page, 'public room recap');
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

test('market studio generates a draft and creates a host room from pasted listing text', async ({ page }) => {
  const listing = `
    3004 26th St
    San Francisco, CA 94110
    Listed at $800,000
    3 beds, 2 baths, 1,200 sqft single-family home with garden and updated kitchen.
  `;

  await page.goto('/join');
  await page.getByRole('button', { name: /Market Studio/ }).click();
  await page.getByLabel('Host nickname').fill('Studio Host');
  await page.getByLabel('Listing text').fill(listing);
  await page.getByRole('button', { name: /Generate Market Draft/ }).click();

  await expect(page.getByTestId('market-studio-draft')).toContainText('Will 3004 26th St appraise above $800,000?');
  await expect(page.getByTestId('market-studio-matches')).toContainText('Existing property match', { timeout: 15_000 });
  await expect(page.getByTestId('market-studio-matches')).toContainText('3004 26th St');
  await page.getByRole('button', { name: /Use local property 3004 26th St/ }).first().click();
  await expect(page.getByTestId('market-studio-draft')).toContainText('Linked to local property 440298192');
  await expect(page.getByLabel('Generated property address')).toHaveValue('3004 26th St');
  await expect(page.getByLabel('Generated asking price')).toHaveValue('800000');
  await expect(page.getByTestId('market-studio-draft')).toContainText('Final sale price, appraisal report');
  await page.getByRole('button', { name: /Save Draft/ }).click();
  await expect(page.getByTestId('market-studio-saved-drafts')).toContainText('3004 26th St');
  await expectNoSeriousAxeViolations(page, 'market studio generated draft');

  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/rooms') && response.status() === 200),
    page.getByRole('button', { name: /Create Room From Draft/ }).click(),
  ]);

  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  await expect(page.getByTestId('host-player-count')).toContainText('1 player');
  await expect(page.getByText(/^3004 26th St$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('host-draft-audit-note')).toContainText('Market Studio draft audit');
  await expect(page.getByTestId('host-draft-audit-note')).toContainText('Local property dataset match');
  await expect(page.getByTestId('host-draft-audit-note')).toContainText('Linked property: 440298192');
  await expect(page.getByTestId('host-draft-audit-note')).toContainText('Server-validated draft metadata');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('Live Room Intelligence');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('linked local property 440298192');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('Draft audit');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('Accepted');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('Movement read');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('No player bets have landed yet');
  await expect(page.getByTestId('host-room-intelligence-panel')).toContainText('No provider-backed comps were queried');
  await expectNoSeriousAxeViolations(page, 'market studio host draft audit');
  await expectConnected(page);

  const roomCode = new URL(page.url()).pathname.split('/').pop();
  if (!roomCode) throw new Error('Room code was not present in host URL');
  await page.getByTestId('host-review-link').click();
  await expect(page).toHaveURL(new RegExp(`/review/${roomCode}$`));
  await expect(page.getByTestId('room-review-summary')).toContainText('compare the accepted market draft');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Required settlement evidence');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Final sale price, appraisal report');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Event history');
  await expect(page.getByTestId('room-review-integrity')).toContainText('raw pasted listing text is not stored');
  await expect(page.getByTestId('room-review-timeline')).toContainText('Room created');
  await expect(page.getByTestId('room-review-recap')).toContainText('Settlement recap is pending');
  await expectNoSeriousAxeViolations(page, 'market studio operator review');
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

  for (const [label, page] of [['desktop', desktop], ['mobile', mobile]] as const) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }

  try {
    await desktop.goto('/');
    await expect(desktop.getByText('FairValue').first()).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousAxeViolations(desktop, 'desktop market browse route');

    await desktop.getByRole('button', { name: /Price: High to Low/ }).click();
    await expect(desktop.getByRole('menuitemradio', { name: /Price: Low to High/ })).toBeVisible();
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
        response.status() === 200
      ),
      desktop.getByRole('button', { name: 'Market summary' }).click(),
    ]);
    await expect(desktop.getByText(/Local AI analyst/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(desktop.getByText('Evidence used:')).toBeVisible();
    await expect(desktop.getByText(/Room market snapshot/)).toBeVisible();
    await expect(desktop.getByText('Limits:')).toBeVisible();
    await expectNoSeriousAxeViolations(desktop, 'desktop AI degraded response state');

    await joinRoomThroughUi(mobile, roomCode);
    await mobile.getByRole('button', { name: 'Set wager to $100' }).click();
    await expect(mobile.getByLabel('Custom wager')).toHaveValue('100');
    await expectNoSeriousAxeViolations(mobile, 'mobile player custom wager state');

    expect(consoleIssues).toEqual([]);
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
});

test('market detail explains simulated market mechanics and data provenance', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const desktopContext = await browser.newContext({ viewport: hostViewport });
  const mobileContext = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();

  try {
    await desktop.goto('/market/440298192');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('Market Trust', { timeout: 15_000 });
    await expect(desktop.getByTestId('market-trust-section')).toContainText('play-money credits');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('LMSR market probability');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('not an appraisal');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('MLSListings Inc');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('Checked Feb');
    await expect(desktop.getByTestId('market-trust-section')).toContainText('room events preserve joins, bets, and settlement');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Market Intelligence');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Local market brief');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Gross rent yield');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Bull case');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Bear case');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Scenario prompts');
    await expect(desktop.getByTestId('market-intelligence-section')).toContainText('Settlement checklist');
    await expectNoSeriousAxeViolations(desktop, 'desktop market trust explainer');

    await mobile.goto('/market/440298192');
    await expect(mobile.getByTestId('market-trust-section')).toContainText('Simulation market', { timeout: 15_000 });
    await expect(mobile.getByTestId('market-trust-section')).toContainText('play-money credits');
    await expect(mobile.getByTestId('market-trust-section')).toContainText('LMSR market probability');
    await expect(mobile.getByTestId('market-intelligence-section')).toContainText('Market Intelligence', { timeout: 15_000 });
    await expect(mobile.getByTestId('market-intelligence-section')).toContainText('Uncertainty map');
    await expect(mobile.getByTestId('market-intelligence-section')).toContainText('Settlement checklist');
    await expectNoSeriousAxeViolations(mobile, 'mobile market trust explainer');
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
});

test('multiplayer room entry and settlement recaps carry trust language', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const playerContext = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();

  try {
    const roomCode = await createRoomThroughUi(host);
    await expect(host.getByTestId('host-room-trust-notice')).toContainText('Simulation credits only');
    await expect(host.getByTestId('host-room-trust-notice')).toContainText('not an appraisal');
    await expect(host.getByTestId('host-room-trust-notice')).toContainText('room event history');
    await expectNoSeriousAxeViolations(host, 'host room trust notice');

    await player.goto(`/play/${roomCode}`);
    await expect(player.getByTestId('player-entry-trust-notice')).toContainText('Before you join', {
      timeout: 15_000,
    });
    await expect(player.getByTestId('player-entry-trust-notice')).toContainText('Simulation credits only');
    await expect(player.getByTestId('player-entry-trust-notice')).toContainText('not an appraisal');
    await expectNoSeriousAxeViolations(player, 'player entry trust notice');

    await player.getByLabel('Player nickname').fill('Trust Player');
    await Promise.all([
      player.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
      ),
      player.getByRole('button', { name: /^Join Room$/ }).click(),
    ]);
    await expectConnected(player);
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('simulation credits only');
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('LMSR probability');
    await expect(player.getByTestId('player-room-trust-notice')).toContainText('host settles');
    await expect(player.getByTestId('player-prebet-intelligence')).toContainText('Pre-bet read');
    await expect(player.getByTestId('player-prebet-believe')).toContainText('Reason to believe');
    await expect(player.getByTestId('player-prebet-doubt')).toContainText('Reason to doubt');
    await expect(player.getByTestId('player-prebet-over')).toContainText('OVER');
    await expect(player.getByTestId('player-prebet-under')).toContainText('UNDER');
    await expect(player.getByTestId('player-prebet-intelligence')).toContainText('No external comps were queried');

    await host.getByRole('button', { name: /Settle/ }).click();
    await expect(host.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await expect(host.getByTestId('settle-modal-trust-notice')).toContainText('Before settlement');
    await expect(host.getByTestId('settle-modal-trust-notice')).toContainText('simulation-credit payouts only');
    await expect(host.getByTestId('settle-modal-trust-notice')).toContainText('room event history');
    await expectNoSeriousAxeViolations(host, 'settle modal trust notice');
    await host.getByLabel('Actual price').fill(String(property.actualPrice));
    await Promise.all([
      host.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
      ),
      host.getByRole('button', { name: /^Confirm Settlement$/ }).click(),
    ]);

    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(host.getByTestId('host-settlement-trust-notice')).toContainText('simulation credits only');
    await expect(host.getByTestId('host-settlement-trust-notice')).toContainText('not a FairValue appraisal');
    await expect(host.getByTestId('host-settlement-trust-notice')).toContainText('Room events preserve joins');

    await host.getByTestId('host-review-link').click();
    await expect(host).toHaveURL(new RegExp(`/review/${roomCode}$`));
    await expect(host.getByTestId('room-review-evidence')).toContainText('Settlement evidence');
    await expect(host.getByTestId('room-review-evidence')).toContainText('$735,000');
    await expect(host.getByTestId('room-review-integrity')).toContainText('Settlement outcome OVER matches');
    await expect(host.getByTestId('room-review-timeline')).toContainText('Settlement completed');
    await expectNoSeriousAxeViolations(host, 'settled operator review');

    await expect(player.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(player.getByTestId('player-settlement-trust-notice')).toContainText('simulation credits only');
    await expect(player.getByTestId('player-settlement-trust-notice')).toContainText('not a FairValue appraisal');
    await expect(player.getByTestId('player-settlement-trust-notice')).toContainText('event history preserves this outcome');
    await expectNoSeriousAxeViolations(player, 'player settlement trust notice');
  } finally {
    await hostContext.close();
    await playerContext.close();
  }
});

test('player pre-bet preview caps wagers against remaining balance', async ({
  request,
  browser,
}: {
  request: APIRequestContext;
  browser: Browser;
}) => {
  const { room_code: roomCode } = await createRoom(request);
  const context = await browser.newContext({
    viewport: playerViewport,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(`/play/${roomCode}`);
    await expect(page.getByTestId('player-entry-trust-notice')).toContainText('Before you join', {
      timeout: 15_000,
    });
    await page.getByLabel('Player nickname').fill('Cap Player');
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
      ),
      page.getByRole('button', { name: /^Join Room$/ }).click(),
    ]);
    await expectConnected(page);
    await expect(page.getByTestId('player-prebet-intelligence')).toContainText('Pre-bet read');
    await expect(page.getByTestId('player-prebet-intelligence')).not.toContainText('Preview capped');

    await page.getByLabel('Custom wager').fill('950');
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
      ),
      page.getByRole('button', { name: 'Bet $950 on OVER' }).click(),
    ]);

    await expect(page.getByTestId('player-balance')).toHaveText('50');
    await expect(page.getByTestId('player-prebet-balance-warning')).toContainText(
      'Preview capped at your current $50 balance.'
    );
    await expect(page.getByTestId('player-prebet-over')).toContainText('OVER');
    await expect(page.getByTestId('player-prebet-under')).toContainText('UNDER');
    await expectNoSeriousAxeViolations(page, 'player balance-capped pre-bet preview');
  } finally {
    await context.close();
  }
});

test('validation, settlement error, and map popup states expose accessible semantics', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const context = await browser.newContext({ viewport: hostViewport });
  const page = await context.newPage();

  try {
    await page.goto('/join');
    await page.getByRole('button', { name: /Create Room/ }).click();
    await page.getByRole('button', { name: /^Create Room$/ }).click();
    await expect(page.getByRole('alert')).toContainText('All fields are required');
    await expect(page.getByLabel('Host nickname')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Host nickname')).toHaveAttribute('aria-describedby', 'create-room-error');
    await expect(page.getByLabel('Property address')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Asking price')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Host nickname').fill('Edge Host');
    await page.getByLabel('Property address').fill('1 Edge Case Way');
    await page.getByLabel('Asking price').fill('0');
    await page.getByRole('button', { name: /^Create Room$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid asking price');
    await expect(page.getByLabel('Asking price')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Host nickname')).not.toHaveAttribute('aria-invalid', 'true');
    await expectNoSeriousAxeViolations(page, 'create-room validation alert state');

    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: /Join Room/ }).click();
    await page.getByRole('button', { name: /^Join Room$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Nickname and room code are required');
    await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Room code')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Room code')).toHaveAttribute('aria-describedby', 'join-room-error');

    await page.getByLabel('Player nickname').fill('Edge Player');
    await page.getByLabel('Room code').fill('AB');
    await page.getByRole('button', { name: /^Join Room$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Room code must be 4 letters or numbers');
    await expect(page.getByLabel('Room code')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
    await expectNoSeriousAxeViolations(page, 'join-room validation alert state');

    const roomCode = await createRoomThroughUi(page);
    await page.goto(`/play/${roomCode}`);
    await expectConnected(page);
    await page.getByLabel('Custom wager').fill('0');
    await page.getByRole('button', { name: /Bet \$0 on OVER/ }).click();
    await expect(page.getByTestId('bet-error')).toContainText('Enter a wager greater than $0');
    await expect(page.getByLabel('Custom wager')).toHaveValue('0');
    await expect(page.getByLabel('Custom wager')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Custom wager')).toHaveAttribute('aria-describedby', 'player-bet-error');
    await expect(
      page.getByRole('button', { name: 'Dismiss error notification: Enter a wager greater than $0' })
    ).toBeVisible();
    await expectNoSeriousAxeViolations(page, 'player wager validation toast state');
    await page.getByRole('button', { name: 'Dismiss error notification: Enter a wager greater than $0' }).click();

    await page.goto(`/host/${roomCode}`);
    await expectConnected(page);
    await page.getByRole('button', { name: /Settle/ }).click();
    await expect(page.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await page.getByRole('button', { name: /^Confirm Settlement$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Actual price is required');
    await expect(page.getByLabel('Actual price')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Actual price')).toHaveAttribute('aria-describedby', 'settle-error');

    await page.getByLabel('Actual price').fill('0');
    await page.getByRole('button', { name: /^Confirm Settlement$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid actual price');
    await expectNoSeriousAxeViolations(page, 'settle validation alert state');
    await page.getByRole('button', { name: /Cancel/ }).click();

    await page.goto('/');
    await expect(page.getByLabel('Search properties')).toBeVisible({ timeout: 15_000 });
    const mapMarker = page.locator('.leaflet-marker-icon [role="button"]').first();
    await expect(mapMarker).toHaveAttribute('aria-label', /^Open details for .+ priced \$/);
    await mapMarker.click({ force: true });
    await expect(page.getByRole('link', { name: /View Details/ }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await expectNoSeriousAxeViolations(page, 'map popup detail state');

    expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);
  } finally {
    await context.close();
  }
});

test('keyboard and screen-reader-adjacent flows stay operable', async ({
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

  for (const [label, page] of [['desktop', desktop], ['mobile', mobile]] as const) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
  }

  try {
    await desktop.goto('/');
    const search = desktop.getByLabel('Search properties');
    await search.focus();
    await desktop.keyboard.type('resilience');
    await expect(search).toHaveValue('resilience');
    const clearSearch = desktop.getByRole('button', { name: 'Clear search' });
    await clearSearch.focus();
    await desktop.keyboard.press('Enter');
    await expect(search).toHaveValue('');

    const sortTrigger = desktop.getByRole('button', { name: /Sort markets by Price: High to Low/ });
    await sortTrigger.focus();
    await expect(sortTrigger).toBeFocused();
    await desktop.keyboard.press('Enter');
    await expect(sortTrigger).toHaveAttribute('aria-expanded', 'true');
    const lowToHigh = desktop.getByRole('menuitemradio', { name: /Price: Low to High/ });
    await lowToHigh.focus();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByRole('button', { name: /Sort markets by Price: Low to High/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByRole('menu')).toBeVisible();
    await desktop.keyboard.press('Escape');
    await expect(desktop.getByRole('menu')).toBeHidden();
    await expect(desktop.getByRole('button', { name: /Sort markets by Price: Low to High/ })).toBeFocused();

    await desktop.goto('/join');
    await desktop.keyboard.press('Tab');
    await expect(desktop.getByRole('button', { name: /Create Room/ })).toBeFocused();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByLabel('Host nickname')).toBeFocused();
    await desktop.getByRole('button', { name: /Back/ }).focus();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByRole('button', { name: /Create Room/ })).toBeVisible();

    await desktop.getByRole('button', { name: /Join Room/ }).focus();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByLabel('Player nickname')).toBeFocused();
    await desktop.getByRole('button', { name: /^Join Room$/ }).focus();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByRole('alert')).toContainText('Nickname and room code are required');

    const roomCode = await createRoomThroughUi(desktop);
    const settleButton = desktop.getByRole('button', { name: /Settle/ });
    await settleButton.focus();
    await desktop.keyboard.press('Enter');
    await expect(desktop.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
    await expect(desktop.getByLabel('Actual price')).toBeFocused();
    await desktop.keyboard.press('Escape');
    await expect(desktop.getByRole('dialog', { name: 'Settle Market' })).toBeHidden();
    await expect(settleButton).toBeFocused();

    const marketSummary = desktop.getByRole('button', { name: 'Market summary' });
    await marketSummary.focus();
    await Promise.all([
      desktop.waitForResponse((response) =>
        response.url().includes('/api/ai/cognee/markets/') &&
        response.url().includes('/search') &&
        response.status() === 200
      ),
      desktop.keyboard.press('Enter'),
    ]);
    await expect(
      desktop.getByText(/Local AI analyst/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(desktop.getByText('Evidence used:')).toBeVisible();
    await expect(desktop.getByText(/Room market snapshot/)).toBeVisible();
    await expect(desktop.getByText('Limits:')).toBeVisible();

    await joinRoomThroughUi(mobile, roomCode);
    const wager100 = mobile.getByRole('button', { name: 'Set wager to $100' });
    await wager100.focus();
    await mobile.keyboard.press('Enter');
    await expect(mobile.getByLabel('Custom wager')).toHaveValue('100');
    await expect(mobile.getByRole('button', { name: /Bet \$100 on OVER/ })).toBeEnabled();

    expect(consoleIssues).toEqual([]);
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
});
