const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error('Could not allocate a free port'));
        else resolve(port);
      });
    });
  });
}

function startBackend({ port, storePath }) {
  const logs = [];
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: '',
      FAIRVALUE_ROOM_STORE_PATH: storePath,
      FAIRVALUE_ROOM_PERSISTENCE: 'on',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  return { child, logs };
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2500);
    child.once('exit', () => {
      clearTimeout(forceKill);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function waitForBackend({ port, child, logs }) {
  const deadline = Date.now() + 15_000;
  const url = `http://127.0.0.1:${port}/api/markets/charts`;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early. Logs:\n${logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling until the server listens
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for backend on ${url}. Logs:\n${logs.join('')}`);
}

async function api(baseUrl, pathName, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, headers: response.headers };
}

test('backend restart restores rooms from the local snapshot file', { timeout: 45_000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-restart-store-'));
  const storePath = path.join(tempDir, 'rooms.json');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let activeBackend = null;

  t.after(async () => {
    if (activeBackend) await stopBackend(activeBackend.child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  activeBackend = startBackend({ port, storePath });
  await waitForBackend({ port, ...activeBackend });

  const created = await api(baseUrl, '/api/rooms', {
    method: 'POST',
    body: { address: '909 Restart Proof Rd', asking_price: 640000 },
  });
  assert.equal(created.status, 200);
  const roomCode = created.data.room_code;
  const hostToken = created.data.host_token;
  assert.match(roomCode, /^[A-Z0-9]{4}$/);
  assert.ok(hostToken);

  const joined = await api(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: 'POST',
    body: { session_id: 'restart-player-1', nickname: 'Restart Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await api(baseUrl, `/api/rooms/${roomCode}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'restart-bet-001' },
    body: { session_id: 'restart-player-1', outcome: 'over', wager: 40 },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.market.total_trades, 1);
  assert.equal(fs.existsSync(storePath), true);

  const firstSnapshot = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(firstSnapshot.rooms[roomCode].betReceipts.length, 1);
  assert.equal(firstSnapshot.rooms[roomCode].events.at(-1).type, 'bet_placed');

  await stopBackend(activeBackend.child);
  activeBackend = startBackend({ port, storePath });
  await waitForBackend({ port, ...activeBackend });
  assert.match(activeBackend.logs.join(''), /Restored 1 room/);

  const restoredState = await api(baseUrl, `/api/rooms/${roomCode}/state`);
  assert.equal(restoredState.status, 200);
  assert.equal(restoredState.data.house.address, '909 Restart Proof Rd');
  assert.equal(restoredState.data.market.total_trades, 1);
  assert.equal(restoredState.data.players[0].nickname, 'Restart Player');
  assert.equal(restoredState.data.ai_enabled, false);

  const duplicate = await api(baseUrl, `/api/rooms/${roomCode}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'restart-bet-001' },
    body: { session_id: 'restart-player-1', outcome: 'over', wager: 40 },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.idempotent_replay, true);
  assert.equal(duplicate.data.market.total_trades, 1);

  const settlement = await api(baseUrl, `/api/rooms/${roomCode}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': hostToken },
    body: { actual_price: 655000 },
  });
  assert.equal(settlement.status, 200);
  assert.equal(settlement.data.winning_outcome, 'over');

  await stopBackend(activeBackend.child);
  activeBackend = startBackend({ port, storePath });
  await waitForBackend({ port, ...activeBackend });

  const settledState = await api(baseUrl, `/api/rooms/${roomCode}/state`);
  assert.equal(settledState.status, 200);
  assert.equal(settledState.data.settled, true);
  assert.equal(settledState.data.settlement.winning_outcome, 'over');
  assert.deepEqual(
    settledState.data.activity.map((entry) => entry.type),
    ['join', 'bet', 'settle']
  );
});
