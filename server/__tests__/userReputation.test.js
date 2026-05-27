const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  server,
  rooms,
  configureRoomPersistence,
  configureUserReputationPersistence,
  roomEventStore,
} = require('../index');

let baseUrl;
let tempRoot;

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

async function request(pathname, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function createIdentity() {
  const identity = await request('/api/identity', { method: 'POST' });
  assert.equal(identity.status, 200);
  return identity.data;
}

async function createRoom(address, askingPrice) {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address, asking_price: askingPrice },
  });
  assert.equal(created.status, 200);
  return created.data;
}

async function joinAndBet(room, identity, { outcome, wager, key, nickname = 'Durable Player' }) {
  const userHeaders = { 'X-FairValue-User-Token': identity.user_token };
  const joined = await request(`/api/rooms/${room.room_code}/join`, {
    method: 'POST',
    headers: userHeaders,
    body: { session_id: identity.user_id, user_id: identity.user_id, nickname },
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.player.user_id, undefined);

  const bet = await request(`/api/rooms/${room.room_code}/bet`, {
    method: 'POST',
    headers: {
      ...userHeaders,
      'Idempotency-Key': key,
    },
    body: {
      session_id: identity.user_id,
      user_id: identity.user_id,
      outcome,
      wager,
      reason: `Identity-backed ${outcome} thesis`,
    },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.player.user_id, undefined);
}

before(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), 'fairvalue-user-reputation-test-'));
  return listen();
});

afterEach(() => {
  configureRoomPersistence(null);
  configureUserReputationPersistence(null);
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) {
    delete rooms[code];
  }
});

after(async () => {
  await close();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('signed-in users accumulate durable cross-room reputation without public session leakage', async () => {
  const reputationPath = path.join(tempRoot, 'user-reputation.json');
  configureUserReputationPersistence({ filePath: reputationPath });
  const player = await createIdentity();
  const userHeaders = { 'X-FairValue-User-Token': player.user_token };

  const unauthenticated = await request('/api/me/reputation');
  assert.equal(unauthenticated.status, 403);
  assert.match(unauthenticated.data.error, /User token/);

  const firstRoom = await createRoom('100 Durable Reputation Way', 500000);
  await joinAndBet(firstRoom, player, {
    outcome: 'over',
    wager: 50,
    key: 'durable-user-reputation-001',
  });
  const firstSettlement = await request(`/api/rooms/${firstRoom.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': firstRoom.host_token },
    body: { actual_price: 525000 },
  });
  assert.equal(firstSettlement.status, 200);
  assert.equal(firstSettlement.data.winning_outcome, 'over');

  const secondRoom = await createRoom('200 Durable Reputation Way', 500000);
  await joinAndBet(secondRoom, player, {
    outcome: 'under',
    wager: 50,
    key: 'durable-user-reputation-002',
  });
  const secondSettlement = await request(`/api/rooms/${secondRoom.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': secondRoom.host_token },
    body: { actual_price: 530000 },
  });
  assert.equal(secondSettlement.status, 200);
  assert.equal(secondSettlement.data.winning_outcome, 'over');

  const state = await request(`/api/rooms/${secondRoom.room_code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.players[0].user_id, undefined);

  const reputation = await request('/api/me/reputation', { headers: userHeaders });
  assert.equal(reputation.status, 200);
  assert.equal(reputation.data.schema_version, 'fairvalue.userReputation.v1');
  assert.equal(reputation.data.user_id, player.user_id);
  assert.equal(reputation.data.rooms_played, 2);
  assert.equal(reputation.data.total_bets, 2);
  assert.equal(reputation.data.correct_bets, 1);
  assert.equal(reputation.data.accuracy, 0.5);
  assert.equal(reputation.data.market_formats.binary_over_under, 2);
  assert.equal(reputation.data.recent_rooms.length, 2);
  assert.equal(JSON.stringify(reputation.data).includes(player.user_token), false);
  assert.equal(JSON.stringify(reputation.data.recent_rooms).includes(player.user_id), false);
  assert.equal(JSON.stringify(reputation.data).includes('session_id'), false);

  configureUserReputationPersistence({ filePath: reputationPath });
  const restored = await request('/api/me/reputation', { headers: userHeaders });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.rooms_played, 2);
  assert.equal(restored.data.total_bets, 2);
  assert.equal(restored.data.correct_bets, 1);
});
