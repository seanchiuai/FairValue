const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  server,
  rooms,
  createRoom,
  generateRoomCode,
  normalizeRoomCode,
} = require('../index');

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

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
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

test('generated and normalized room codes use one alphanumeric schema', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(generateRoomCode(), /^[A-Z0-9]{4}$/);
  }

  assert.equal(normalizeRoomCode('a1b2'), 'A1B2');
  assert.equal(normalizeRoomCode(' z9x8 '), 'Z9X8');
  assert.equal(normalizeRoomCode('ABCD'), 'ABCD');
  assert.equal(normalizeRoomCode('1234'), '1234');
  assert.equal(normalizeRoomCode('ABC'), null);
  assert.equal(normalizeRoomCode('ABCDE'), null);
  assert.equal(normalizeRoomCode('AB!2'), null);
});

test('join accepts lowercase alphanumeric input for existing rooms', async () => {
  await createRoom({ address: 'Alphanumeric House', asking_price: 700000 }, 'A1B2');

  const join = await request('/api/rooms/a1b2/join', {
    method: 'POST',
    body: { session_id: 'lowercase-player', nickname: 'Lowercase Player' },
  });

  assert.equal(join.status, 200);
  assert.equal(join.data.house.address, 'Alphanumeric House');
  assert.equal(join.data.player.nickname, 'Lowercase Player');
});

test('invalid and nonexistent room codes return distinct API errors', async () => {
  const invalid = await request('/api/rooms/AB!2/join', {
    method: 'POST',
    body: { session_id: 'bad-code-player', nickname: 'Bad Code Player' },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.error, /4 letters or numbers/);

  const nonexistent = await request('/api/rooms/Z9X8/join', {
    method: 'POST',
    body: { session_id: 'missing-room-player', nickname: 'Missing Room Player' },
  });
  assert.equal(nonexistent.status, 404);
  assert.equal(nonexistent.data.error, 'Room not found');
});
