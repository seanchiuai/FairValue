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
    data: { address: property.address, asking_price: property.askingPrice },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.room_code).toMatch(/^[A-Z0-9]{4}$/);
  return body;
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByText('Room not found')).toBeVisible();
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
  await expect(page.getByText('Invalid host token')).toBeVisible();

  const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
  expect(stateResponse.status()).toBe(200);
  const state = await stateResponse.json();
  expect(state.settled).toBe(false);
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

test('AI analyst shows degraded missing-key response instead of failing silently', async ({ page }) => {
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
      response.status() === 503
    ),
    page.getByRole('button', { name: 'Market summary' }).click(),
  ]);
  await expect(page.getByText('Set COGNEE_API_KEY on the server to enable Cognee analysis.')).toBeVisible({
    timeout: 15_000,
  });
});
