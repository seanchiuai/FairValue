#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const repoRoot = path.resolve(__dirname, '..');
const OPS_TOKEN = 'local-boot-smoke-ops-token';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
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
      FAIRVALUE_OPS_TOKEN: OPS_TOKEN,
      FAIRVALUE_ROOM_STORE_PATH: storePath,
      FAIRVALUE_ROOM_PERSISTENCE: 'on',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  return { child, logs };
}

async function stopBackend(proc) {
  if (!proc || proc.child.exitCode !== null) return;

  await new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      if (proc.child.exitCode === null) proc.child.kill('SIGKILL');
    }, 2500);

    proc.child.once('exit', () => {
      clearTimeout(forceKill);
      proc.child.stdout.destroy();
      proc.child.stderr.destroy();
      resolve();
    });
    proc.child.kill('SIGTERM');
  });
}

async function waitForHealth({ baseUrl, proc, timeoutMs = 12_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`Backend exited early. Logs:\n${proc.logs.join('')}`);
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Keep polling until the child has finished listening.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for backend ${baseUrl}. Logs:\n${proc.logs.join('')}`);
}

async function requestJson(baseUrl, pathname, { method = 'GET', body, headers = {}, expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, expectedStatus, `${method} ${pathname} returned ${response.status}: ${JSON.stringify(data)}`);
  return { response, data };
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-powered-by'), null);
}

function openRoomSocket(wsBaseUrl, roomCode) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsBaseUrl}/ws/${roomCode}`);
    const timer = setTimeout(() => reject(new Error(`Timed out opening room socket ${roomCode}`)), 5000);

    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForSocketMessage(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${label}`));
    }, 5000);

    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }

    socket.on('message', onMessage);
  });
}

function closeSocket(socket) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', resolve);
    socket.close();
    setTimeout(resolve, 100);
  });
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-local-boot-'));
  const storePath = path.join(tempDir, 'rooms.json');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;
  let backend = null;
  let socket = null;

  try {
    backend = startBackend({ port, storePath });
    await waitForHealth({ baseUrl, proc: backend });

    const health = await requestJson(baseUrl, '/healthz');
    assert.equal(health.data.service, 'fairvalue');
    assert.equal(health.data.status, 'ok');
    assert.ok(health.response.headers.get('x-request-id'));
    assertSecurityHeaders(health.response);

    const ready = await requestJson(baseUrl, '/readyz');
    assert.equal(ready.data.ready, true);
    assert.equal(ready.data.checks.database.configured, false);

    await requestJson(baseUrl, '/api/ops/metrics', { expectedStatus: 403 });

    const created = await requestJson(baseUrl, '/api/rooms', {
      method: 'POST',
      body: { address: 'Local Boot Smoke House', asking_price: 650000 },
    });
    const roomCode = created.data.room_code;
    const hostToken = created.data.host_token;
    assert.match(roomCode, /^[A-Z0-9]{4}$/);
    assert.ok(hostToken.length > 20);

    socket = await openRoomSocket(wsBaseUrl, roomCode);
    const joinBroadcast = waitForSocketMessage(
      socket,
      (message) => message.type === 'join' && message.player?.session_id === 'boot-smoke-player',
      'join broadcast'
    );

    const joined = await requestJson(baseUrl, `/api/rooms/${roomCode}/join`, {
      method: 'POST',
      body: { session_id: 'boot-smoke-player', nickname: 'Boot Smoke' },
    });
    assert.equal(joined.data.players.length, 1);
    await joinBroadcast;

    const bet = await requestJson(baseUrl, `/api/rooms/${roomCode}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'boot-smoke-bet-001' },
      body: { session_id: 'boot-smoke-player', outcome: 'over', wager: 10 },
    });
    assert.equal(bet.data.player.bets.length, 1);

    await requestJson(baseUrl, `/api/rooms/${roomCode}/settle`, {
      method: 'POST',
      headers: { 'X-FairValue-Host-Token': hostToken },
      body: { actual_price: 675000 },
    });

    const state = await requestJson(baseUrl, `/api/rooms/${roomCode}/state`);
    assert.equal(state.data.settled, true);
    assert.equal(JSON.stringify(state.data).includes(hostToken), false);

    const metrics = await requestJson(baseUrl, '/api/ops/metrics', {
      headers: { Authorization: `Bearer ${OPS_TOKEN}` },
    });
    assert.equal(metrics.data.room_lifecycle.created, 1);
    assert.equal(metrics.data.room_lifecycle.joined, 1);
    assert.equal(metrics.data.room_lifecycle.bets, 1);
    assert.equal(metrics.data.room_lifecycle.settlements, 1);
    assert.equal(JSON.stringify(metrics.data).includes(hostToken), false);

    assert.ok(fs.existsSync(storePath), 'expected local room snapshot file to be written');

    console.log(JSON.stringify({
      ok: true,
      check: 'local-backend-boot',
      baseUrl,
      roomCode,
      snapshot: storePath,
    }, null, 2));
  } catch (error) {
    if (backend) {
      console.error(`Local backend boot smoke failed. Logs:\n${backend.logs.join('')}`);
    }
    throw error;
  } finally {
    await closeSocket(socket);
    await stopBackend(backend);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
