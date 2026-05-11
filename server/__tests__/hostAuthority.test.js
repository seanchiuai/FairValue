const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms } = require('../index');

let baseUrl;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '123 Host Authority Way', asking_price: 500000 },
  });
  assert.equal(created.status, 200);
  assert.match(created.data.room_code, /^[A-Z0-9]{4}$/);
  assert.equal(typeof created.data.host_token, 'string');
  assert.ok(created.data.host_token.length > 20);
  return created.data;
}

before(listen);

afterEach(() => {
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) {
    delete rooms[code];
  }
});

after(close);

test('room creation returns host token only to the creator', async () => {
  const room = await createHostedRoom();

  const join = await request(`/api/rooms/${room.room_code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.host_token, undefined);
  assert.equal(join.data.hostToken, undefined);

  const state = await request(`/api/rooms/${room.room_code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.host_token, undefined);
  assert.equal(state.data.hostToken, undefined);
});

test('settlement rejects missing or invalid host tokens and accepts creator token', async () => {
  const room = await createHostedRoom();
  await request(`/api/rooms/${room.room_code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });

  const missing = await request(`/api/rooms/${room.room_code}/settle`, {
    method: 'POST',
    body: { actual_price: 510000 },
  });
  assert.equal(missing.status, 403);
  assert.match(missing.data.error, /Host token/);

  const invalid = await request(`/api/rooms/${room.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': 'player-token' },
    body: { actual_price: 510000 },
  });
  assert.equal(invalid.status, 403);

  const settled = await request(`/api/rooms/${room.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 510000 },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.winning_outcome, 'over');

  const state = await request(`/api/rooms/${room.room_code}/state`);
  assert.equal(state.data.settlement.winning_outcome, 'over');
});

test('AI toggle rejects players and accepts only the host token', async () => {
  const room = await createHostedRoom();

  const missing = await request(`/api/rooms/${room.room_code}/toggle-ai`, {
    method: 'POST',
  });
  assert.equal(missing.status, 403);

  const invalid = await request(`/api/rooms/${room.room_code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': 'player-token' },
  });
  assert.equal(invalid.status, 403);

  const enabled = await request(`/api/rooms/${room.room_code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.ai_enabled, true);

  const disabled = await request(`/api/rooms/${room.room_code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.ai_enabled, false);
});
