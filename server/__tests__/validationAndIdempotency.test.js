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
  return { status: res.status, data, headers: res.headers };
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '456 Validation Loop', asking_price: 600000 },
  });
  assert.equal(created.status, 200);
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

test('room, join, bet, and settlement payloads are validated before mutation', async () => {
  const requestId = 'validation-test-request-001';
  const invalidCreate = await request('/api/rooms', {
    method: 'POST',
    headers: { 'X-Request-Id': requestId },
    body: { address: '   ', asking_price: 600000 },
  });
  assert.equal(invalidCreate.status, 400);
  assert.equal(invalidCreate.headers.get('x-request-id'), requestId);
  assert.match(invalidCreate.data.error, /Address/);
  assert.equal(Object.keys(rooms).length, 0);

  const invalidPrice = await request('/api/rooms', {
    method: 'POST',
    body: { address: 'Bad Price House', asking_price: -1 },
  });
  assert.equal(invalidPrice.status, 400);
  assert.match(invalidPrice.data.error, /Asking price/);

  const room = await createHostedRoom();
  const code = room.room_code;

  const invalidJoin = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: ' ', nickname: ' ' },
  });
  assert.equal(invalidJoin.status, 400);
  assert.equal(Object.keys(rooms[code].players).length, 0);

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: '<b>Ada</b>' },
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.player.nickname, 'Ada');

  const missingIdempotency = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    body: { session_id: 'player-1', outcome: 'over', wager: 25 },
  });
  assert.equal(missingIdempotency.status, 400);
  assert.match(missingIdempotency.data.error, /Idempotency-Key/);

  const invalidOutcome = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-bad-outcome-001' },
    body: { session_id: 'player-1', outcome: 'sideways', wager: 25 },
  });
  assert.equal(invalidOutcome.status, 400);
  assert.match(invalidOutcome.data.error, /Outcome/);

  const invalidWager = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-bad-wager-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 1001 },
  });
  assert.equal(invalidWager.status, 400);
  assert.match(invalidWager.data.error, /Wager/);

  const unknownPlayer = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-missing-player-001' },
    body: { session_id: 'missing-player', outcome: 'over', wager: 25 },
  });
  assert.equal(unknownPlayer.status, 404);
  assert.equal(rooms[code].market.total_trades, 0);

  const invalidSettle = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 'not-a-price' },
  });
  assert.equal(invalidSettle.status, 400);
  assert.equal(rooms[code].settled, false);
});

test('bet idempotency replays duplicates without mutating the room twice', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });

  const firstBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 50 },
  });
  assert.equal(firstBet.status, 200);
  assert.equal(firstBet.data.market.total_trades, 1);
  assert.equal(firstBet.data.player.balance, 950);

  const replay = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 50 },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  assert.equal(replay.data.idempotent_replay, true);
  assert.equal(replay.data.market.total_trades, 1);
  assert.equal(replay.data.player.balance, 950);
  assert.equal(rooms[code].activity.filter((entry) => entry.type === 'bet').length, 1);
  assert.equal(rooms[code].players['player-1'].bets.length, 1);

  const conflict = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'under', wager: 50 },
  });
  assert.equal(conflict.status, 409);
  assert.equal(rooms[code].market.total_trades, 1);

  const secondBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-002' },
    body: { session_id: 'player-1', outcome: 'under', wager: 25 },
  });
  assert.equal(secondBet.status, 200);
  assert.equal(secondBet.data.market.total_trades, 2);
});

test('concurrent bet requests reconcile through the authoritative server market', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });
  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-2', nickname: 'Player Two' },
  });

  const [overBet, underBet] = await Promise.all([
    request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'concurrent-over-bet-001' },
      body: { session_id: 'player-1', outcome: 'over', wager: 25 },
    }),
    request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'concurrent-under-bet-001' },
      body: { session_id: 'player-2', outcome: 'under', wager: 40 },
    }),
  ]);

  assert.equal(overBet.status, 200);
  assert.equal(underBet.status, 200);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.market.total_trades, 2);
  assert.equal(state.data.players.find((player) => player.session_id === 'player-1').balance, 975);
  assert.equal(state.data.players.find((player) => player.session_id === 'player-2').balance, 960);
  assert.equal(rooms[code].activity.filter((entry) => entry.type === 'bet').length, 2);
});

test('join route rate limits repeated submissions', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;
  let limited;

  for (let i = 0; i < 35; i += 1) {
    const response = await request(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { session_id: 'rate-limited-player', nickname: `Player ${i}` },
    });
    if (response.status === 429) {
      limited = response;
      break;
    }
  }

  assert.ok(limited, 'expected join submissions to hit the rate limit');
  const retryAfter = Number(limited.headers.get('retry-after'));
  assert.ok(retryAfter >= 1 && retryAfter <= 60);
  assert.match(limited.data.error, /Too many/);
});
