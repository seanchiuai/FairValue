#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const distRoot = path.join(repoRoot, 'dist');

const DEFAULT_BUDGETS = {
  build_ms: 30_000,
  join_route_cold_ready_ms: 4_000,
  create_room_to_connected_ms: 5_000,
  player_route_cold_ready_ms: 4_000,
  player_join_to_connected_ms: 5_000,
  bet_to_host_sync_ms: 3_000,
  settle_broadcast_ms: 3_000,
};

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const budgets = {
  build_ms: envNumber('FAIRVALUE_COLD_BUILD_MS', DEFAULT_BUDGETS.build_ms),
  join_route_cold_ready_ms: envNumber('FAIRVALUE_COLD_JOIN_ROUTE_READY_MS', DEFAULT_BUDGETS.join_route_cold_ready_ms),
  create_room_to_connected_ms: envNumber('FAIRVALUE_COLD_CREATE_ROOM_MS', DEFAULT_BUDGETS.create_room_to_connected_ms),
  player_route_cold_ready_ms: envNumber('FAIRVALUE_COLD_PLAYER_ROUTE_READY_MS', DEFAULT_BUDGETS.player_route_cold_ready_ms),
  player_join_to_connected_ms: envNumber('FAIRVALUE_COLD_PLAYER_JOIN_MS', DEFAULT_BUDGETS.player_join_to_connected_ms),
  bet_to_host_sync_ms: envNumber('FAIRVALUE_COLD_BET_SYNC_MS', DEFAULT_BUDGETS.bet_to_host_sync_ms),
  settle_broadcast_ms: envNumber('FAIRVALUE_COLD_SETTLE_BROADCAST_MS', DEFAULT_BUDGETS.settle_broadcast_ms),
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

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

function startProcess(label, command, args, env) {
  const logs = [];
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => logs.push(`[${label}] ${chunk.toString()}`));
  child.stderr.on('data', (chunk) => logs.push(`[${label}] ${chunk.toString()}`));
  return { child, label, logs };
}

async function stopProcess(proc) {
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

async function runCommand(label, command, args, env) {
  const proc = startProcess(label, command, args, env);
  const started = performance.now();
  const exitCode = await new Promise((resolve) => proc.child.once('exit', resolve));
  const elapsed = performance.now() - started;
  if (exitCode !== 0) {
    throw new Error(`${label} exited with ${exitCode}.\n${proc.logs.join('')}`);
  }
  return elapsed;
}

async function waitForHttp(url, proc, timeoutMs, isReady = (response) => response.ok) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (proc && proc.child.exitCode !== null) {
      throw new Error(`${proc.label} exited early while waiting for ${url}.\n${proc.logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (isReady(response, body)) return;
    } catch {
      // keep polling while processes boot
    }
    await delay(150);
  }

  throw new Error(`Timed out waiting for ${url}.\n${proc?.logs.join('') || ''}`);
}

function startBackend(port, storePath) {
  return startProcess('backend', process.execPath, ['server/index.js'], {
    PORT: String(port),
    DATABASE_URL: '',
    FAIRVALUE_ROOM_STORE_PATH: storePath,
    FAIRVALUE_ROOM_PERSISTENCE: 'on',
  });
}

function proxyApi(req, res, backendPort) {
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: backendPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${backendPort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `API proxy failed: ${error.message}` }));
  });

  req.pipe(proxyReq);
}

function resolveStaticFile(requestUrl) {
  const url = new URL(requestUrl || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(distRoot, relativePath);
  const isInsideDist = filePath === distRoot || filePath.startsWith(`${distRoot}${path.sep}`);

  if (!isInsideDist) return path.join(distRoot, 'index.html');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  if (pathname.startsWith('/assets/')) return null;
  return path.join(distRoot, 'index.html');
}

async function startProductionStaticServer(frontendPort, backendPort) {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/')) {
      proxyApi(req, res, backendPort);
      return;
    }

    const filePath = resolveStaticFile(req.url);
    if (!filePath) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(frontendPort, '127.0.0.1', resolve);
  });

  return server;
}

async function stopServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function timed(timings, label, action) {
  const started = performance.now();
  const result = await action();
  timings[label] = Math.round(performance.now() - started);
  return result;
}

function expectBudget(actual, budget, label) {
  assert.ok(
    actual <= budget,
    `${label} exceeded budget: actual ${actual}ms > budget ${budget}ms`
  );
}

async function expectConnected(page) {
  await page.getByText('Connected').first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function collectNavigationTiming(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((entry) => entry.name === 'first-contentful-paint');
    return {
      dom_content_loaded_ms: Math.round(navigation.domContentLoadedEventEnd - navigation.startTime),
      load_event_ms: Math.round(navigation.loadEventEnd - navigation.startTime),
      response_end_ms: Math.round(navigation.responseEnd - navigation.startTime),
      first_contentful_paint_ms: fcp ? Math.round(fcp.startTime) : null,
    };
  });
}

async function main() {
  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-cold-production-'));
  const storePath = path.join(tempDir, 'rooms.json');
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const timings = {};
  const navigation = {};
  let backend = null;
  let staticServer = null;
  let browser = null;

  try {
    timings.build_ms = Math.round(await runCommand('build', 'npm', ['run', 'build'], {
      VITE_BACKEND_PORT: String(backendPort),
    }));
    backend = startBackend(backendPort, storePath);
    await waitForHttp(`http://127.0.0.1:${backendPort}/api/markets/charts`, backend, 30_000);
    staticServer = await startProductionStaticServer(frontendPort, backendPort);
    await waitForHttp(
      frontendBaseUrl,
      null,
      10_000,
      (response, body) => response.ok && body.includes('<title>FairValue</title>')
    );

    browser = await chromium.launch({ headless: true });
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const host = await hostContext.newPage();
    const player = await playerContext.newPage();
    const consoleIssues = [];

    for (const [label, page] of [['host', host], ['player', player]]) {
      page.on('console', (message) => {
        if (message.type() === 'error') consoleIssues.push(`${label}: ${message.text()}`);
      });
      page.on('pageerror', (error) => consoleIssues.push(`${label}: ${error.message}`));
    }

    await timed(timings, 'join_route_cold_ready_ms', async () => {
      await host.goto(`${frontendBaseUrl}/join`, { waitUntil: 'load' });
      await host.getByRole('button', { name: /Create Room/ }).waitFor({ state: 'visible', timeout: 20_000 });
    });
    navigation.join_route = await collectNavigationTiming(host);

    await host.getByRole('button', { name: /Create Room/ }).click();
    await host.getByLabel('Host nickname').fill('Cold Host');
    await host.getByLabel('Property address').fill('909 Cold Production Court');
    await host.getByLabel('Asking price').fill('810000');
    await timed(timings, 'create_room_to_connected_ms', async () => {
      await Promise.all([
        host.waitForURL(/\/host\/[A-Z0-9]{4}$/),
        host.getByRole('button', { name: /^Create Room$/ }).click(),
      ]);
      await expectConnected(host);
      await host.getByText('909 Cold Production Court').waitFor({ state: 'visible', timeout: 20_000 });
    });
    const roomCode = new URL(host.url()).pathname.split('/').pop();
    assert.match(roomCode, /^[A-Z0-9]{4}$/);

    await timed(timings, 'player_route_cold_ready_ms', async () => {
      await player.goto(`${frontendBaseUrl}/play/${roomCode}`, { waitUntil: 'load' });
      await player.getByLabel('Player nickname').waitFor({ state: 'visible', timeout: 20_000 });
    });
    navigation.player_route = await collectNavigationTiming(player);

    await player.getByLabel('Player nickname').fill('Cold Player');
    await timed(timings, 'player_join_to_connected_ms', async () => {
      await Promise.all([
        player.waitForResponse((response) =>
          response.url().includes(`/api/rooms/${roomCode}/join`) && response.status() === 200
        ),
        player.getByRole('button', { name: /^Join Room$/ }).click(),
      ]);
      await expectConnected(player);
      await host.getByTestId('host-player-count').waitFor({ state: 'visible', timeout: 20_000 });
      await host.getByTestId('leaderboard').getByText('Cold Player').waitFor({
        state: 'visible',
        timeout: 20_000,
      });
    });

    await timed(timings, 'bet_to_host_sync_ms', async () => {
      await Promise.all([
        player.waitForResponse((response) =>
          response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
        ),
        player.getByRole('button', { name: 'Bet $25 on OVER', exact: true }).click(),
      ]);
      await host.getByTestId('total-trades').waitFor({ state: 'visible', timeout: 20_000 });
      await host.getByTestId('activity-feed').getByText(/bet \$25 on\s+OVER/).waitFor({
        state: 'visible',
        timeout: 20_000,
      });
    });

    await host.getByRole('button', { name: /Settle/ }).click();
    await host.getByLabel('Actual price').fill('825000');
    await timed(timings, 'settle_broadcast_ms', async () => {
      await Promise.all([
        host.waitForResponse((response) =>
          response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
        ),
        host.getByRole('button', { name: /Confirm Settlement/ }).click(),
      ]);
      await host.getByTestId('host-settlement-result').getByText('OVER WINS').waitFor({
        state: 'visible',
        timeout: 20_000,
      });
      await player.getByTestId('player-settlement-result').getByText('OVER wins!').waitFor({
        state: 'visible',
        timeout: 20_000,
      });
    });

    assert.deepEqual(consoleIssues, []);

    for (const [label, budget] of Object.entries(budgets)) {
      expectBudget(timings[label], budget, label);
    }

    const snapshot = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const snapshotRoom = snapshot.rooms[roomCode];
    assert.ok(snapshotRoom);
    assert.equal(Object.keys(snapshotRoom.players).length, 2);
    assert.equal(snapshotRoom.market.total_trades, 1);
    assert.equal(snapshotRoom.settled, true);

    console.log(JSON.stringify({
      ok: true,
      roomCode,
      frontendPort,
      backendPort,
      budgets_ms: budgets,
      timings_ms: timings,
      navigation,
      snapshot: {
        players: Object.keys(snapshotRoom.players).length,
        trades: snapshotRoom.market.total_trades,
        events: snapshotRoom.events.length,
        settled: snapshotRoom.settled,
      },
    }, null, 2));

    await hostContext.close();
    await playerContext.close();
  } finally {
    if (browser) await browser.close();
    await stopServer(staticServer);
    await stopProcess(backend);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
