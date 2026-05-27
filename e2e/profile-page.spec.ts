import { expect, test, type APIRequestContext } from '@playwright/test';

type Identity = {
  user_id: string;
  user_token: string;
};

type Room = {
  room_code: string;
  host_token: string;
};

type RawProperty = {
  zpid?: number;
  streetAddress?: string;
  address?: {
    streetAddress?: string;
  };
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function mintIdentity(request: APIRequestContext): Promise<Identity> {
  const response = await request.post('/api/identity');
  expect(response.ok()).toBeTruthy();
  const identity = await response.json();
  expect(identity.user_id).toBeTruthy();
  expect(identity.user_token).toBeTruthy();
  return identity;
}

async function createRoom(request: APIRequestContext): Promise<Room> {
  const response = await request.post('/api/rooms', {
    data: {
      address: '44 Profile History Ln',
      asking_price: 720000,
    },
  });
  expect(response.ok()).toBeTruthy();
  const room = await response.json();
  expect(room.room_code).toMatch(/^[A-Z0-9]{4}$/);
  expect(room.host_token).toBeTruthy();
  return room;
}

async function firstBrowsableProperty(request: APIRequestContext) {
  const response = await request.get('/data/properties.json');
  expect(response.ok()).toBeTruthy();
  const properties = await response.json() as RawProperty[];
  const property = properties.find((item) => item.zpid);
  expect(property?.zpid).toBeTruthy();
  const address = property?.streetAddress || property?.address?.streetAddress || String(property?.zpid);
  return {
    id: String(property?.zpid),
    address,
  };
}

test('signed-in profile route renders private prediction history from settled rooms', async ({ page, request }) => {
  const identity = await mintIdentity(request);
  const room = await createRoom(request);
  const watchProperty = await firstBrowsableProperty(request);
  const userHeaders = { 'X-FairValue-User-Token': identity.user_token };

  const joined = await request.post(`/api/rooms/${room.room_code}/join`, {
    headers: userHeaders,
    data: {
      session_id: identity.user_id,
      user_id: identity.user_id,
      nickname: 'Profile Player',
    },
  });
  expect(joined.ok()).toBeTruthy();

  const bet = await request.post(`/api/rooms/${room.room_code}/bet`, {
    headers: {
      ...userHeaders,
      'Idempotency-Key': `profile-history-${room.room_code}`,
    },
    data: {
      session_id: identity.user_id,
      user_id: identity.user_id,
      outcome: 'over',
      wager: 25,
      reason: 'Profile route should preserve my public rationale.',
    },
  });
  expect(bet.ok()).toBeTruthy();

  const settled = await request.post(`/api/rooms/${room.room_code}/settle`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
    data: {
      actual_price: 735000,
    },
  });
  expect(settled.ok()).toBeTruthy();

  await page.addInitScript(
    ({ storedIdentity }) => {
      localStorage.setItem('fv_identity_v1', JSON.stringify(storedIdentity));
      sessionStorage.setItem('fv_nickname', storedIdentity.nickname);
    },
    {
      storedIdentity: {
        user_id: identity.user_id,
        user_token: identity.user_token,
        nickname: 'Profile Player',
      },
    }
  );

  await page.goto(`/market/${watchProperty.id}`);
  await page.getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Remove from watchlist' })).toBeVisible();

  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'My prediction profile' })).toBeVisible();
  await expect(page.getByTestId('profile-identity-status')).toContainText('Private signed profile');
  await expect(page.getByText('Profile Player').first()).toBeVisible();
  await expect(page.getByTestId('profile-history')).toContainText(room.room_code);
  await expect(page.getByTestId('profile-history')).toContainText('OVER');
  await expect(page.getByTestId('profile-history')).toContainText('1/1 correct');
  await expect(page.getByTestId('profile-history')).toContainText('$25');
  await expect(page.getByTestId('profile-watchlist')).toContainText(watchProperty.address);
  await page.getByRole('button', {
    name: new RegExp(`Remove ${escapeRegExp(watchProperty.address)} from watchlist`),
  }).click();
  await expect(page.getByTestId('profile-watchlist')).not.toContainText(watchProperty.address);
  await expect(page.getByText(identity.user_id)).toHaveCount(0);
  await expect(page.getByText(identity.user_token)).toHaveCount(0);
});
