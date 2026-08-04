import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const backendPort = process.env.E2E_BACKEND_PORT || '8000';
const apiBaseUrl = `http://127.0.0.1:${backendPort}`;

const property = {
  address: '404 Negative Path Blvd',
  askingPrice: 680000,
};

type RoomResponse = {
  room_code: string;
  host_token: string;
};

async function createRoom(request: APIRequestContext): Promise<RoomResponse> {
  const response = await request.post(`${apiBaseUrl}/api/rooms`, {
    data: {
      address: property.address,
      asking_price: property.askingPrice,
      session_id: `negative-room-factory-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.room_code).toMatch(/^[A-Z0-9]{4}$/);
  return body;
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });
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

test('join flow reports malformed and nonexistent room codes', async ({ page }) => {
  await page.goto('/join');
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill('Negative Player');
  await page.getByLabel('Room code').fill('AB!');
  await expect(page.getByLabel('Room code')).toHaveValue('AB');
  await page.getByRole('button', { name: /^Join Room$/ }).click();
  await expect(page.getByText('Room code must be 4 letters or numbers')).toBeVisible();

  await page.getByLabel('Room code').fill('ZZZZ');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/rooms/ZZZZ/join') && response.status() === 404
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);
  await expect(page.locator('#join-room-error')).toContainText('Room not found');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Room not found' })).toBeVisible();
});

test('create room identity outage is announced before room mutation', async ({ page }) => {
  let identityRequests = 0;
  let createRoomRequests = 0;
  await page.route('**/api/identity', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    identityRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'identity service unavailable',
    });
  });
  page.on('request', (sentRequest) => {
    if (sentRequest.url().endsWith('/api/rooms') && sentRequest.method() === 'POST') {
      createRoomRequests += 1;
    }
  });

  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Identity Failure Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await expect(page.getByRole('button', { name: /^Create Room$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page.locator('#create-room-error')).toContainText('Identity unavailable');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Identity unavailable' })).toBeVisible();
  await expect(page.getByLabel('Host nickname')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Property address')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Asking price')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Host nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Property address')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Asking price')).not.toHaveAttribute('aria-invalid', 'true');
  expect(identityRequests).toBeGreaterThan(0);
  expect(createRoomRequests).toBe(0);
  await expectNoSeriousAxeViolations(page, 'create-room identity outage notification state');
});

test('direct player join announces missing nickname before submitting', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  let joinRequestCount = 0;
  page.on('request', (sentRequest) => {
    if (sentRequest.url().includes(`/api/rooms/${roomCode}/join`)) joinRequestCount += 1;
  });

  await page.goto(`/play/${roomCode}`);
  await expect(page.getByLabel('Player nickname')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Join Room$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Join Room$/ }).click();
  await expect(page.locator('#player-join-error')).toContainText('Enter your name');
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'player-join-error');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Enter your name' })).toBeVisible();
  expect(joinRequestCount).toBe(0);
});

test('malformed identity success is announced before direct player join', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  let identityRequests = 0;
  let joinRequestCount = 0;
  await page.route('**/api/identity', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    identityRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user_id: 'missing-token' }),
    });
  });
  page.on('request', (sentRequest) => {
    if (sentRequest.url().includes(`/api/rooms/${roomCode}/join`)) joinRequestCount += 1;
  });

  await page.goto(`/play/${roomCode}`);
  await page.getByLabel('Player nickname').fill('Malformed Identity Player');
  await expect(page.getByRole('button', { name: /^Join Room$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Join Room$/ }).click();

  await expect(page.locator('#player-join-error')).toContainText('Identity response was invalid');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Identity response was invalid' })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'player-join-error');
  await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
  expect(identityRequests).toBeGreaterThan(0);
  expect(joinRequestCount).toBe(0);
  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'malformed identity direct player join notification state');
});

test('host room state outage shows a retryable room load error', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.route(`**/api/rooms/${roomCode}/state`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'state store unavailable',
    });
  });

  await page.goto(`/host/${roomCode}`);

  await expect(page.getByTestId('room-load-error')).toContainText('Room temporarily unavailable');
  await expect(page.getByTestId('room-load-error')).toContainText(roomCode);
  await expect(page.getByTestId('room-load-error')).toContainText('Room state unavailable');
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  await expect(page.getByText('Room not found')).not.toBeVisible();
  await expectNoSeriousAxeViolations(page, 'host room state outage error state');
});

test('player malformed room state response shows a non-mutating load error', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.route(`**/api/rooms/${roomCode}/state`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ players: [] }),
    });
  });

  await page.goto(`/play/${roomCode}`);

  await expect(page.getByTestId('room-load-error')).toContainText('Room temporarily unavailable');
  await expect(page.getByTestId('room-load-error')).toContainText(roomCode);
  await expect(page.getByTestId('room-load-error')).toContainText('Room state response was invalid');
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).not.toBeVisible();

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'player malformed room state load error state');
});

test('direct player join API failure is announced without blaming the nickname', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.route(`**/api/rooms/${roomCode}/join`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'temporary join outage',
    });
  });

  await page.goto(`/play/${roomCode}`);
  await page.getByLabel('Player nickname').fill('Join Failure Player');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);

  await expect(page.locator('#player-join-error')).toContainText('Failed to join room');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Failed to join room' })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'player-join-error');
  await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: /^Join Room$/ })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/play/${roomCode}$`));

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'direct player join API failure notification state');
});

test('direct player join malformed success is announced without mutating the room', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.route(`**/api/rooms/${roomCode}/join`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(`/play/${roomCode}`);
  await page.getByLabel('Player nickname').fill('Malformed Join Player');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);

  await expect(page.locator('#player-join-error')).toContainText('Join response was invalid');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Join response was invalid' })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'player-join-error');
  await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: /^Join Room$/ })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`/play/${roomCode}$`));

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'direct player malformed join response notification state');
});

test('create room API failure is visible on the join page', async ({ page }) => {
  await page.route('**/api/rooms', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Room persistence failed' }),
    });
  });

  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Create Failure Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/rooms') &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: /^Create Room$/ }).click(),
  ]);

  await expect(page.locator('#create-room-error')).toContainText('Room persistence failed');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Room persistence failed' })).toBeVisible();
  await expect(page).toHaveURL(/\/join$/);
  await expectNoSeriousAxeViolations(page, 'create-room API failure notification state');
});

test('create room host auto-join failure is visible on the join page', async ({ page, request }) => {
  let createdRoomCode = '';
  await page.route(/\/api\/rooms\/[A-Z0-9]{4}\/join$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    createdRoomCode = route.request().url().match(/\/api\/rooms\/([A-Z0-9]{4})\/join$/)?.[1] || '';
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'temporary host join outage',
    });
  });

  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Host Join Failure');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/rooms') &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.waitForResponse((response) =>
      /\/api\/rooms\/[A-Z0-9]{4}\/join$/.test(response.url()) &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: /^Create Room$/ }).click(),
  ]);

  expect(createdRoomCode).toMatch(/^[A-Z0-9]{4}$/);
  await expect(page.locator('#create-room-error')).toContainText('Failed to join room as host');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Failed to join room as host' })).toBeVisible();
  await expect(page.getByLabel('Host nickname')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Property address')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Asking price')).toHaveAttribute('aria-describedby', 'create-room-error');
  await expect(page.getByLabel('Host nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Property address')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Asking price')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/join$/);

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${createdRoomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'create-room host auto-join failure notification state');
});

test('join page room-code API failure is announced without blaming input', async ({ page }) => {
  await page.route('**/api/rooms/FAIL/join', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'temporary join outage',
    });
  });

  await page.goto('/join');
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill('Join Page Failure');
  await page.getByLabel('Room code').fill('FAIL');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/rooms/FAIL/join') &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);

  await expect(page.locator('#join-room-error')).toContainText('Failed to join room');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Failed to join room' })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'join-room-error');
  await expect(page.getByLabel('Room code')).toHaveAttribute('aria-describedby', 'join-room-error');
  await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Room code')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/join$/);
  await expectNoSeriousAxeViolations(page, 'join page room-code API failure notification state');
});

test('join page malformed join success is announced without navigating', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.route(`**/api/rooms/${roomCode}/join`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/join');
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill('Malformed Join Page');
  await page.getByLabel('Room code').fill(roomCode.toLowerCase());
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);

  await expect(page.locator('#join-room-error')).toContainText('Join response was invalid');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Join response was invalid' })).toBeVisible();
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('aria-describedby', 'join-room-error');
  await expect(page.getByLabel('Room code')).toHaveAttribute('aria-describedby', 'join-room-error');
  await expect(page.getByLabel('Player nickname')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Room code')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/join$/);

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'join page malformed join response notification state');
});

test('player bet API failure rolls back and is announced', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.goto(`/play/${roomCode}`);
  await page.getByLabel('Player nickname').fill('Bet Failure Player');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
    ),
    page.getByRole('button', { name: /^Join Room$/ }).click(),
  ]);
  await expectConnected(page);
  await expect(page.getByTestId('player-balance')).toHaveText('1,000');

  await page.route(`**/api/rooms/${roomCode}/bet`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'temporary persistence outage',
    });
  });

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/bet`) &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: /Bet \$25 on OVER/ }).click(),
  ]);

  await expect(page.getByTestId('bet-error')).toContainText('Bet failed');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Bet failed' })).toBeVisible();
  await expect(page.getByLabel('Custom wager')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Custom wager')).toHaveAttribute('aria-describedby', 'player-bet-error');
  await expect(page.getByTestId('player-balance')).toHaveText('1,000');
  await expect(page.getByTestId('player-positions')).toHaveCount(0);

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.market.total_trades).toBe(0);
  expect(state.players).toHaveLength(1);
  expect(state.players[0].balance).toBe(1000);
  await expectNoSeriousAxeViolations(page, 'player bet API failure notification state');
});

test('market detail room creation failure is visible to the host', async ({ page }) => {
  await page.route('**/api/rooms', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Room persistence failed' }),
    });
  });

  await page.goto('/market/440298192');
  await expect(page.getByText('Multiplayer Mode')).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/rooms') &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: 'Start a Bid' }).click(),
  ]);

  await expect(page.locator('#market-start-room-error')).toContainText('Room persistence failed');
  await expect(page.getByRole('button', { name: 'Start a Bid' })).toHaveAttribute(
    'aria-describedby',
    'market-start-room-error'
  );
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Room persistence failed' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'market start room failure notification state');
  await expect(page).toHaveURL(/\/market\/440298192$/);
});

test('market detail host auto-join failure is visible to the host', async ({ page, request }) => {
  let createdRoomCode = '';
  await page.route(/\/api\/rooms\/[A-Z0-9]{4}\/join$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    createdRoomCode = route.request().url().match(/\/api\/rooms\/([A-Z0-9]{4})\/join$/)?.[1] || '';
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'temporary host join outage',
    });
  });

  await page.goto('/market/440298192');
  await expect(page.getByText('Multiplayer Mode')).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/rooms') &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.waitForResponse((response) =>
      /\/api\/rooms\/[A-Z0-9]{4}\/join$/.test(response.url()) &&
      response.request().method() === 'POST' &&
      response.status() === 503
    ),
    page.getByRole('button', { name: 'Start a Bid' }).click(),
  ]);

  expect(createdRoomCode).toMatch(/^[A-Z0-9]{4}$/);
  await expect(page.locator('#market-start-room-error')).toContainText('Failed to join room as host');
  await expect(page.getByRole('button', { name: 'Start a Bid' })).toHaveAttribute(
    'aria-describedby',
    'market-start-room-error'
  );
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Failed to join room as host' })).toBeVisible();
  await expect(page).toHaveURL(/\/market\/440298192$/);

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${createdRoomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'market detail host auto-join failure notification state');
});

test('market detail malformed host auto-join success is visible to the host', async ({ page, request }) => {
  let createdRoomCode = '';
  await page.route(/\/api\/rooms\/[A-Z0-9]{4}\/join$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    createdRoomCode = route.request().url().match(/\/api\/rooms\/([A-Z0-9]{4})\/join$/)?.[1] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/market/440298192');
  await expect(page.getByText('Multiplayer Mode')).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/rooms') &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.waitForResponse((response) =>
      /\/api\/rooms\/[A-Z0-9]{4}\/join$/.test(response.url()) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.getByRole('button', { name: 'Start a Bid' }).click(),
  ]);

  expect(createdRoomCode).toMatch(/^[A-Z0-9]{4}$/);
  await expect(page.locator('#market-start-room-error')).toContainText('Host join response was invalid');
  await expect(page.getByRole('button', { name: 'Start a Bid' })).toHaveAttribute(
    'aria-describedby',
    'market-start-room-error'
  );
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Host join response was invalid' })).toBeVisible();
  await expect(page).toHaveURL(/\/market\/440298192$/);

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${createdRoomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.players).toHaveLength(0);
  await expectNoSeriousAxeViolations(page, 'market detail malformed host auto-join notification state');
});

test('host page without authority explains disabled controls', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);

  await page.goto(`/host/${roomCode}`);
  await expectConnected(page);

  await expect(page.getByTestId('host-authority-warning')).toContainText('Host controls unavailable');
  await expect(page.getByTestId('host-authority-warning')).toContainText('AI and settlement controls require host authority');

  const aiButton = page.getByRole('button', { name: /AI bot disabled/i });
  const settleButton = page.getByRole('button', { name: /Settle/ });
  await expect(aiButton).toBeDisabled();
  await expect(settleButton).toBeDisabled();
  await expect(aiButton).toHaveAttribute('aria-describedby', 'host-authority-warning');
  await expect(settleButton).toHaveAttribute('aria-describedby', 'host-authority-warning');

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.ai_enabled).toBe(false);
  expect(state.settled).toBe(false);
  await expectNoSeriousAxeViolations(page, 'missing host authority disabled controls state');
});

test('operator review keeps public evidence visible without requesting private event history', async ({ page, request }) => {
  const { room_code: roomCode, host_token: hostToken } = await createRoom(request);
  let eventRequests = 0;
  page.on('request', (sentRequest) => {
    if (sentRequest.url().includes(`/api/rooms/${roomCode}/events`)) eventRequests += 1;
  });

  await page.goto(`/review/${roomCode}`);

  await expect(page.getByTestId('room-review-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('room-review-summary')).toContainText('host-only event log');
  await expect(page.getByTestId('room-review-event-lock')).toContainText('Host authority required to load event history.');
  await expect(page.getByTestId('room-review-event-lock')).toContainText('Public room state is still shown below.');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Market question');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Required settlement evidence');
  await expect(page.getByTestId('room-review-evidence')).toContainText('Event history');
  await expect(page.getByTestId('room-review-timeline')).toContainText('No room events are available');
  expect(eventRequests).toBe(0);
  await expect(page.getByTestId('room-review-page')).not.toContainText(hostToken);
  await expectNoSeriousAxeViolations(page, 'operator review without host authority');
});

test('fake host token cannot settle a room from the host UI', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.addInitScript((code) => {
    window.sessionStorage.setItem(`fv_host_token_${code}`, 'fake-host-token');
  }, roomCode);

  await page.goto(`/host/${roomCode}`);
  await expectConnected(page);
  await expect(page.getByRole('button', { name: /Settle/ })).toBeEnabled();
  await page.getByRole('button', { name: /Settle/ }).click();
  await expect(page.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
  await page.getByLabel('Actual price').fill('700000');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 403
    ),
    page.getByRole('button', { name: /Confirm Settlement/ }).click(),
  ]);
  await expect(page.locator('#settle-error')).toContainText('Invalid host token');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Invalid host token' })).toBeVisible();

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.settled).toBe(false);
});

test('malformed settlement success stays visible and is announced', async ({ page, request }) => {
  const { room_code: roomCode, host_token: hostToken } = await createRoom(request);
  await page.addInitScript(({ code, token }) => {
    window.sessionStorage.setItem(`fv_host_token_${code}`, token);
  }, { code: roomCode, token: hostToken });
  await page.route(`**/api/rooms/${roomCode}/settle`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(`/host/${roomCode}`);
  await expectConnected(page);
  await page.getByRole('button', { name: /Settle/ }).click();
  await expect(page.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
  await page.getByLabel('Actual price').fill('700000');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/settle`) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.getByRole('button', { name: /Confirm Settlement/ }).click(),
  ]);

  await expect(page.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
  await expect(page.locator('#settle-error')).toContainText('Settlement response was invalid');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Settlement response was invalid' })).toBeVisible();

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.settled).toBe(false);
  await expectNoSeriousAxeViolations(page, 'malformed settlement success notification state');
});

test('fake host token cannot toggle AI and announces the host action failure', async ({ page, request }) => {
  const { room_code: roomCode } = await createRoom(request);
  await page.addInitScript((code) => {
    window.sessionStorage.setItem(`fv_host_token_${code}`, 'fake-host-token');
  }, roomCode);

  await page.goto(`/host/${roomCode}`);
  await expectConnected(page);
  const toggleButton = page.getByRole('button', { name: /AI bot disabled/i });
  await expect(toggleButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/toggle-ai`) && response.status() === 403
    ),
    toggleButton.click(),
  ]);
  await expect(page.getByRole('alert')).toContainText('Invalid host token');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: Invalid host token' })).toBeVisible();
  await expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.ai_enabled).toBe(false);
});

test('malformed AI toggle success is announced without changing state', async ({ page, request }) => {
  const { room_code: roomCode, host_token: hostToken } = await createRoom(request);
  await page.addInitScript(({ code, token }) => {
    window.sessionStorage.setItem(`fv_host_token_${code}`, token);
  }, { code: roomCode, token: hostToken });
  await page.route(`**/api/rooms/${roomCode}/toggle-ai`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(`/host/${roomCode}`);
  await expectConnected(page);
  const toggleButton = page.getByRole('button', { name: /AI bot disabled/i });
  await expect(toggleButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/toggle-ai`) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    toggleButton.click(),
  ]);

  await expect(page.getByRole('alert')).toContainText('AI toggle response was invalid');
  await expect(page.getByRole('button', { name: 'Dismiss error notification: AI toggle response was invalid' })).toBeVisible();
  await expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.ai_enabled).toBe(false);
  await expectNoSeriousAxeViolations(page, 'malformed AI toggle success notification state');
});

test('join route exposes retry metadata when server rate limit is hit', async ({ request }) => {
  const { room_code: roomCode } = await createRoom(request);
  const attempts = await Promise.all(
    Array.from({ length: 31 }, (_, index) =>
      request.post(`${apiBaseUrl}/api/rooms/${roomCode}/join`, {
        data: {
          session_id: 'e2e-rate-limited-session',
          nickname: `Rate ${index}`,
        },
      })
    )
  );
  const limited = attempts.find((response) => response.status() === 429);
  expect(limited, 'expected one join request to be rate limited').toBeTruthy();
  expect(limited?.headers()['retry-after']).toBeTruthy();
  const body = await limited?.json();
  expect(body.error).toBe('Too many requests');
  expect(body.retry_after).toBeGreaterThan(0);
});

test('AI analyst shows cited local analysis when Cognee is not configured', async ({ page }) => {
  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('AI Negative Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await page.getByRole('button', { name: /^Create Room$/ }).click();
  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  await expectConnected(page);

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/ai/cognee/markets/') &&
      response.url().includes('/search') &&
      response.status() === 200
    ),
    page.getByRole('button', { name: 'Market summary' }).click(),
  ]);
  await expect(page.getByText(/Local AI analyst/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Evidence used:')).toBeVisible();
  await expect(page.getByText(/Room market snapshot/)).toBeVisible();
  await expect(page.getByText('Limits:')).toBeVisible();
  await expect(page.getByText(/no external comps/i)).toBeVisible();
});
