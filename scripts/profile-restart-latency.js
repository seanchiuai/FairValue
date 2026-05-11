#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_BUDGETS = {
  create_p95_ms: 600,
  join_p95_ms: 650,
  bet_p95_ms: 650,
  state_p95_ms: 300,
  settle_p95_ms: 650,
  restart_ready_ms: 5000,
  recovery_first_state_ms: 8000,
  recovery_wave_ms: 12000,
};

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const budgets = {
  create_p95_ms: envNumber('FAIRVALUE_PROFILE_CREATE_P95_MS', DEFAULT_BUDGETS.create_p95_ms),
  join_p95_ms: envNumber('FAIRVALUE_PROFILE_JOIN_P95_MS', DEFAULT_BUDGETS.join_p95_ms),
  bet_p95_ms: envNumber('FAIRVALUE_PROFILE_BET_P95_MS', DEFAULT_BUDGETS.bet_p95_ms),
  state_p95_ms: envNumber('FAIRVALUE_PROFILE_STATE_P95_MS', DEFAULT_BUDGETS.state_p95_ms),
  settle_p95_ms: envNumber('FAIRVALUE_PROFILE_SETTLE_P95_MS', DEFAULT_BUDGETS.settle_p95_ms),
  restart_ready_ms: envNumber('FAIRVALUE_PROFILE_RESTART_READY_MS', DEFAULT_BUDGETS.restart_ready_ms),
  recovery_first_state_ms: envNumber('FAIRVALUE_PROFILE_RECOVERY_FIRST_STATE_MS', DEFAULT_BUDGETS.recovery_first_state_ms),
  recovery_wave_ms: envNumber('FAIRVALUE_PROFILE_RECOVERY_WAVE_MS', DEFAULT_BUDGETS.recovery_wave_ms),
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(values) {
  return {
    count: values.length,
    min_ms: Math.round(Math.min(...values)),
    p50_ms: Math.round(percentile(values, 50)),
    p95_ms: Math.round(percentile(values, 95)),
    max_ms: Math.round(Math.max(...values)),
  };
}

class Metrics {
  constructor() {
    this.samples = new Map();
    this.counters = new Map();
    this.timings = {};
  }

  record(label, ms) {
    if (!this.samples.has(label)) this.samples.set(label, []);
    this.samples.get(label).push(ms);
  }

  increment(label) {
    this.counters.set(label, (this.counters.get(label) || 0) + 1);
  }

  setTiming(label, ms) {
    this.timings[label] = Math.round(ms);
  }

  toJSON() {
    return {
      samples: Object.fromEntries(
        [...this.samples.entries()].map(([label, values]) => [label, summarize(values)])
      ),
      counters: Object.fromEntries(this.counters.entries()),
      timings_ms: this.timings,
    };
  }
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

async function waitForBackend({ port, proc, timeoutMs = 15_000 }) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/api/markets/charts`;

  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`Backend exited early. Logs:\n${proc.logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for backend ${url}. Logs:\n${proc.logs.join('')}`);
}

async function timedJson({ baseUrl, pathname, label, metrics, expectedStatus = 200, method = 'GET', headers = {}, body }) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const elapsed = performance.now() - started;
  metrics.record(label, elapsed);
  const data = await response.json().catch(() => null);
  if (response.status !== expectedStatus) {
    throw new Error(`${label} ${pathname} returned ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function retryUntilAccepted({ operation, metrics, counterLabel, timeoutMs = 30_000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      metrics.increment(counterLabel);
      lastError = error;
      await delay(125);
    }
  }

  throw lastError || new Error(`Timed out waiting for ${counterLabel}`);
}

function expectBudget(actual, budget, label) {
  assert.ok(
    actual <= budget,
    `${label} exceeded budget: actual ${actual}ms > budget ${budget}ms`
  );
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-restart-latency-'));
  const storePath = path.join(tempDir, 'rooms.json');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const metrics = new Metrics();
  let backend = null;

  try {
    backend = startBackend({ port, storePath });
    const bootStarted = performance.now();
    await waitForBackend({ port, proc: backend });
    metrics.setTiming('initial_ready_ms', performance.now() - bootStarted);

    const created = await timedJson({
      baseUrl,
      pathname: '/api/rooms',
      label: 'create',
      metrics,
      method: 'POST',
      body: { address: '404 Latency Profile Rd', asking_price: 710000 },
    });
    const roomCode = created.room_code;
    const hostToken = created.host_token;
    assert.match(roomCode, /^[A-Z0-9]{4}$/);
    assert.ok(hostToken);

    const initialPlayers = Array.from({ length: 8 }, (_, index) => ({
      sessionId: `latency-initial-${index}`,
      nickname: `Latency Initial ${index + 1}`,
      outcome: index % 2 === 0 ? 'over' : 'under',
      wager: 10 + index,
      key: `latency-initial-bet-${index}`,
    }));

    await Promise.all(initialPlayers.map((player) =>
      timedJson({
        baseUrl,
        pathname: `/api/rooms/${roomCode}/join`,
        label: 'join',
        metrics,
        method: 'POST',
        body: { session_id: player.sessionId, nickname: player.nickname },
      })
    ));

    await Promise.all(initialPlayers.map((player) =>
      timedJson({
        baseUrl,
        pathname: `/api/rooms/${roomCode}/bet`,
        label: 'bet',
        metrics,
        method: 'POST',
        headers: { 'Idempotency-Key': player.key },
        body: { session_id: player.sessionId, outcome: player.outcome, wager: player.wager },
      })
    ));

    for (let index = 0; index < 6; index += 1) {
      await timedJson({
        baseUrl,
        pathname: `/api/rooms/${roomCode}/state`,
        label: 'state',
        metrics,
      });
    }

    await stopBackend(backend);
    backend = null;

    const recoveryPlayers = Array.from({ length: 8 }, (_, index) => ({
      sessionId: `latency-recovery-${index}`,
      nickname: `Latency Recovery ${index + 1}`,
      outcome: index % 2 === 0 ? 'over' : 'under',
      wager: 15 + index,
      key: `latency-recovery-bet-${index}`,
    }));

    const outageStarted = performance.now();
    const firstStateRecovery = retryUntilAccepted({
      metrics,
      counterLabel: 'state_retry_failures_during_restart',
      operation: async () =>
        timedJson({
          baseUrl,
          pathname: `/api/rooms/${roomCode}/state`,
          label: 'state',
          metrics,
        }),
    }).then((state) => {
      metrics.setTiming('recovery_first_state_ms', performance.now() - outageStarted);
      return state;
    });

    const recoveryWaveStarted = performance.now();
    const recoveryWave = Promise.all(recoveryPlayers.map(async (player) => {
      await retryUntilAccepted({
        metrics,
        counterLabel: 'join_retry_failures_during_restart',
        operation: async () =>
          timedJson({
            baseUrl,
            pathname: `/api/rooms/${roomCode}/join`,
            label: 'join',
            metrics,
            method: 'POST',
            body: { session_id: player.sessionId, nickname: player.nickname },
          }),
      });
      return retryUntilAccepted({
        metrics,
        counterLabel: 'bet_retry_failures_during_restart',
        operation: async () =>
          timedJson({
            baseUrl,
            pathname: `/api/rooms/${roomCode}/bet`,
            label: 'bet',
            metrics,
            method: 'POST',
            headers: { 'Idempotency-Key': player.key },
            body: { session_id: player.sessionId, outcome: player.outcome, wager: player.wager },
          }),
      });
    })).then((results) => {
      metrics.setTiming('recovery_wave_ms', performance.now() - recoveryWaveStarted);
      return results;
    });

    await expectRetryCounter(metrics, 'state_retry_failures_during_restart');
    await expectRetryCounter(metrics, 'join_retry_failures_during_restart');

    backend = startBackend({ port, storePath });
    const restartStarted = performance.now();
    await waitForBackend({ port, proc: backend });
    metrics.setTiming('restart_ready_ms', performance.now() - restartStarted);

    const [stateAfterRestart] = await Promise.all([firstStateRecovery, recoveryWave]);
    assert.equal(stateAfterRestart.house.address, '404 Latency Profile Rd');

    const settled = await timedJson({
      baseUrl,
      pathname: `/api/rooms/${roomCode}/settle`,
      label: 'settle',
      metrics,
      method: 'POST',
      headers: { 'X-FairValue-Host-Token': hostToken },
      body: { actual_price: 725000 },
    });
    assert.equal(settled.winning_outcome, 'over');

    const finalState = await timedJson({
      baseUrl,
      pathname: `/api/rooms/${roomCode}/state`,
      label: 'state',
      metrics,
    });
    assert.equal(finalState.players.length, initialPlayers.length + recoveryPlayers.length);
    assert.equal(finalState.market.total_trades, initialPlayers.length + recoveryPlayers.length);
    assert.equal(finalState.settled, true);

    const report = metrics.toJSON();
    expectBudget(report.samples.create.p95_ms, budgets.create_p95_ms, 'create p95');
    expectBudget(report.samples.join.p95_ms, budgets.join_p95_ms, 'join p95');
    expectBudget(report.samples.bet.p95_ms, budgets.bet_p95_ms, 'bet p95');
    expectBudget(report.samples.state.p95_ms, budgets.state_p95_ms, 'state p95');
    expectBudget(report.samples.settle.p95_ms, budgets.settle_p95_ms, 'settle p95');
    expectBudget(report.timings_ms.restart_ready_ms, budgets.restart_ready_ms, 'restart readiness');
    expectBudget(report.timings_ms.recovery_first_state_ms, budgets.recovery_first_state_ms, 'first state recovery');
    expectBudget(report.timings_ms.recovery_wave_ms, budgets.recovery_wave_ms, 'recovery wave');

    console.log(JSON.stringify({
      ok: true,
      roomCode,
      budgets_ms: budgets,
      ...report,
    }, null, 2));
  } finally {
    if (backend) await stopBackend(backend);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function expectRetryCounter(metrics, label) {
  await retryUntilAccepted({
    metrics,
    counterLabel: `${label}_probe_failures`,
    timeoutMs: 5000,
    operation: async () => {
      const value = metrics.counters.get(label) || 0;
      if (value <= 0) throw new Error(`${label} did not observe outage failures yet`);
      return value;
    },
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
