const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  server,
  rooms,
  configureRoomPersistence,
  roomEventStore,
} = require('../index');

let baseUrl;
let tempRoot;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(pathname, { method = 'GET', body, headers } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

async function createIdentity() {
  const result = await request('/api/identity', { method: 'POST' });
  assert.equal(result.response.status, 200);
  return result.data;
}

async function createHostedRoom(identity) {
  const headers = { 'X-FairValue-User-Token': identity.user_token };
  const result = await request('/api/rooms', {
    method: 'POST',
    headers,
    body: {
      address: '100 Room Library Way',
      asking_price: 825000,
      host_user_id: identity.user_id,
    },
  });
  assert.equal(result.response.status, 200);
  const room = result.data;
  const joined = await request(`/api/rooms/${room.room_code}/join`, {
    method: 'POST',
    headers,
    body: { session_id: identity.user_id, user_id: identity.user_id, nickname: 'Library Host' },
  });
  assert.equal(joined.response.status, 200);
  return { room, headers };
}

before(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), 'fairvalue-room-library-test-'));
  return listen();
});

afterEach(() => {
  configureRoomPersistence(null);
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) delete rooms[code];
});

after(async () => {
  await close();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('room library is identity-scoped, restart-safe, and excludes private tokens', async () => {
  const persistencePath = path.join(tempRoot, 'rooms.json');
  configureRoomPersistence({ mode: 'json', filePath: persistencePath });
  const identity = await createIdentity();
  const { room, headers } = await createHostedRoom(identity);

  const unauthenticated = await request('/api/me/rooms');
  assert.equal(unauthenticated.response.status, 403);

  const live = await request('/api/me/rooms?status=live', { headers });
  assert.equal(live.response.status, 200);
  assert.equal(live.data.schema_version, 'fairvalue.roomLibrary.v1');
  assert.equal(live.data.rooms.length, 1);
  assert.equal(live.data.rooms[0].room_code, room.room_code);
  assert.equal(live.data.rooms[0].is_host, true);
  assert.equal(live.data.rooms[0].settled, false);
  assert.equal(JSON.stringify(live.data).includes(room.host_token), false);
  assert.equal(JSON.stringify(live.data).includes(identity.user_token), false);
  assert.equal(JSON.stringify(live.data).includes(identity.user_id), false);

  const unsettledExport = await request(`/api/rooms/${room.room_code}/export?format=csv`);
  assert.equal(unsettledExport.response.status, 409);

  const settled = await request(`/api/rooms/${room.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 850000 },
  });
  assert.equal(settled.response.status, 200);

  const settledLibrary = await request('/api/me/rooms?status=settled', { headers });
  assert.equal(settledLibrary.response.status, 200);
  assert.equal(settledLibrary.data.rooms[0].settled, true);
  assert.equal(settledLibrary.data.rooms[0].actual_price, 850000);

  const csv = await request(`/api/rooms/${room.room_code}/export?format=csv`);
  assert.equal(csv.response.status, 200);
  assert.match(csv.response.headers.get('content-disposition'), /fairvalue-.*-recap\.csv/);
  assert.match(csv.data, /winning_outcome/);
  assert.match(csv.data, /actual_price/);

  roomEventStore.clearAll();
  for (const code of Object.keys(rooms)) delete rooms[code];
  await configureRoomPersistence({ mode: 'json', filePath: persistencePath });

  const restored = await request('/api/me/rooms', { headers });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.data.rooms.length, 1);
  assert.equal(restored.data.rooms[0].room_code, room.room_code);
  assert.equal(restored.data.rooms[0].settled, true);
});

test('room library search and invalid export formats are validated', async () => {
  const identity = await createIdentity();
  const { room, headers } = await createHostedRoom(identity);

  const searchHit = await request('/api/me/rooms?q=Library%20Way', { headers });
  assert.equal(searchHit.response.status, 200);
  assert.equal(searchHit.data.count, 1);

  const searchMiss = await request('/api/me/rooms?q=does-not-exist', { headers });
  assert.equal(searchMiss.response.status, 200);
  assert.equal(searchMiss.data.count, 0);

  const invalidFormat = await request(`/api/rooms/${room.room_code}/export?format=xml`);
  assert.equal(invalidFormat.response.status, 400);
  assert.match(invalidFormat.data.error, /format must be csv or json/);
});
