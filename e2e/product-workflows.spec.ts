import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const backendPort = process.env.E2E_BACKEND_PORT || '8000';
const apiBaseUrl = `http://127.0.0.1:${backendPort}`;

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
}

async function createIdentity(request: APIRequestContext) {
  const response = await request.post(`${apiBaseUrl}/api/identity`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ user_id: string; user_token: string }>;
}

test('browse, compare, host, settle, export, and return through the room library', async ({ page, request }) => {
  const identity = await createIdentity(request);
  await page.goto('/');
  await page.evaluate((stored) => localStorage.setItem('fv_identity_v1', JSON.stringify(stored)), identity);
  await page.reload({ waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Make the call. See the market move.' })).toBeVisible();
  await expect(page.locator('.market-card-wrapper')).toHaveCount(50);
  await page.locator('.card-compare-button').nth(0).click();
  await page.locator('.card-compare-button').nth(1).click();
  await expect(page.getByRole('link', { name: /Open comparison/ })).toBeVisible();
  await page.getByRole('link', { name: /Open comparison/ }).click();
  await expect(page).toHaveURL(/\/compare\?ids=/);
  await expect(page.getByRole('heading', { name: 'See the trade-offs before you host the room.' })).toBeVisible();
  await expect(page.locator('.compare-page__property')).toHaveCount(2);

  await page.locator('.compare-page__property-actions a').filter({ hasText: 'Host room' }).first().click();
  await expect(page).toHaveURL(/\/join\?propertyId=/);
  await expect(page.getByRole('heading', { name: 'Create a Room' })).toBeVisible();
  await expect(page.getByLabel('Property address')).not.toHaveValue('');
  await page.getByLabel('Host nickname').fill('Workflow Host');
  await page.getByRole('button', { name: /^Create Room$/ }).click();
  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  const roomCode = new URL(page.url()).pathname.split('/').pop();
  if (!roomCode) throw new Error('Expected a room code after hosting');
  const hostToken = await page.evaluate((code) => localStorage.getItem(`fv_host_token_${code}`), roomCode);
  expect(hostToken).toBeTruthy();

  const settle = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/settle`, {
    headers: { 'X-FairValue-Host-Token': hostToken || '' },
    data: { actual_price: 1_200_000 },
  });
  expect(settle.status()).toBe(200);

  await page.goto(`/recap/${roomCode}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('room-public-recap-page')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('public-recap-csv-download').click();
  expect((await downloadPromise).suggestedFilename()).toBe(`fairvalue-${roomCode.toLowerCase()}-recap.csv`);

  await page.goto('/me', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('profile-room-library')).toContainText(roomCode);
  await expect(page.getByTestId('profile-room-library')).toContainText('Settled');
  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.innerWidth);
  await expectNoSeriousAxeViolations(page);
});
