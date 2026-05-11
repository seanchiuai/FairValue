import { expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { loadRoomSnapshot } from './snapshot';

const repoRoot = path.resolve(__dirname, '..');
const hostViewport = { width: 1440, height: 900 };
const playerViewport = { width: 390, height: 844 };
const restartLoadPlayersPerCycle = 4;
const storePath =
  process.env.FAIRVALUE_ROOM_STORE_PATH ||
  path.join(os.tmpdir(), `fairvalue-browser-restart-${process.pid}.json`);

type ManagedProcess = {
  child: ChildProcess;
  label: string;
  logs: string[];
};

type RestartLoadPlayer = {
  sessionId: string;
  nickname: string;
  outcome: 'over' | 'under';
  wager: number;
  idempotencyKey: string;
};

type RestartLoadWave = {
  promise: Promise<RestartLoadWaveResult>;
  getFailedAttempts: () => number;
};

type RestartLoadWaveResult = {
  players: number;
  trades: number;
  wagered: number;
  failedAttempts: number;
  lastNickname: string;
};

let backendPort = Number(process.env.E2E_RESTART_BACKEND_PORT || 0);
let frontendPort = Number(process.env.E2E_RESTART_FRONTEND_PORT || 0);
let backend: ManagedProcess | null = null;
let frontend: ManagedProcess | null = null;
let frontendBaseUrl = '';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
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

function startProcess(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): ManagedProcess {
  const logs: string[] = [];
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => logs.push(`[${label}] ${chunk.toString()}`));
  child.stderr?.on('data', (chunk) => logs.push(`[${label}] ${chunk.toString()}`));
  return { child, label, logs };
}

async function assertPortAvailable(port: number, label: string) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`${label} port ${port} is already in use`)));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve());
    });
  });
}

async function stopProcess(proc: ManagedProcess | null) {
  if (!proc || proc.child.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      if (proc.child.exitCode === null && proc.child.pid) {
        try {
          process.kill(-proc.child.pid, 'SIGKILL');
        } catch {
          proc.child.kill('SIGKILL');
        }
      }
    }, 5000);

    proc.child.once('exit', () => {
      clearTimeout(forceKill);
      proc.child.stdout?.destroy();
      proc.child.stderr?.destroy();
      resolve();
    });

    if (proc.child.pid) {
      try {
        process.kill(-proc.child.pid, 'SIGTERM');
      } catch {
        proc.child.kill('SIGTERM');
      }
    }
  });
}

async function waitForHttp(
  url: string,
  proc: ManagedProcess | null,
  timeoutMs: number,
  isReady: (response: Response, body: string) => boolean = (response) => response.ok
) {
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
      // keep polling while the dev server boots
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}.\n${proc?.logs.join('') || ''}`);
}

async function startBackend() {
  backend = startProcess('backend', process.execPath, ['server/index.js'], {
    PORT: String(backendPort),
    DATABASE_URL: '',
    FAIRVALUE_ROOM_STORE_PATH: storePath,
    FAIRVALUE_ROOM_PERSISTENCE: 'on',
  });
  await waitForHttp(`http://127.0.0.1:${backendPort}/api/markets/charts`, backend, 30_000);
  return backend;
}

async function restartBackend() {
  await stopProcess(backend);
  backend = null;
  await startBackend();
}

async function startFrontend() {
  frontend = startProcess('frontend', 'npm', ['start', '--', '--host', '127.0.0.1', '--port', String(frontendPort)], {
    VITE_BACKEND_PORT: String(backendPort),
    BACKEND_PORT: String(backendPort),
  });
  await waitForHttp(
    frontendBaseUrl,
    frontend,
    120_000,
    (response, body) => response.ok && body.includes('<title>FairValue</title>') && body.includes('<div id="root"></div>')
  );
}

async function expectConnected(page: Page) {
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 20_000 });
}

async function expectReconnecting(page: Page) {
  await expect(page.getByText('Reconnecting...').first()).toBeVisible({ timeout: 15_000 });
}

async function createRoomThroughUi(page: Page) {
  await page.goto(`${frontendBaseUrl}/join`);
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('Restart Host');
  await page.getByLabel('Property address').fill('707 Browser Restart Lane');
  await page.getByLabel('Asking price').fill('705000');
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4}$/);
  const roomCode = new URL(page.url()).pathname.split('/').pop();
  expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);
  if (!roomCode) throw new Error('Room code was not present in host URL');
  await expectConnected(page);
  return roomCode;
}

async function joinRoomThroughUi(page: Page, roomCode: string, nickname = 'Restart Player') {
  await page.goto(`${frontendBaseUrl}/join`);
  await page.getByRole('button', { name: /Join Room/ }).click();
  await page.getByLabel('Player nickname').fill(nickname);
  await page.getByLabel('Room code').fill(roomCode.toLowerCase());
  await page.getByRole('button', { name: /^Join Room$/ }).click();

  await expect(page).toHaveURL(new RegExp(`/play/${roomCode}$`));
  await expect(page.getByText('707 Browser Restart Lane')).toBeVisible({ timeout: 15_000 });
  await expectConnected(page);
}

async function clickBetAndWait(page: Page, roomCode: string, buttonName: RegExp) {
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/bet`) && response.status() === 200
    ),
    page.getByRole('button', { name: buttonName }).click(),
  ]);
}

async function postJson(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`http://127.0.0.1:${backendPort}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function buildRestartLoadPlayers(cycle: number): RestartLoadPlayer[] {
  return Array.from({ length: restartLoadPlayersPerCycle }, (_, index) => {
    const absoluteIndex = (cycle - 1) * restartLoadPlayersPerCycle + index;
    return {
      sessionId: `restart-load-${Date.now()}-${cycle}-${index}`,
      nickname: `Restart Load ${cycle}.${index + 1}`,
      outcome: absoluteIndex % 2 === 0 ? 'over' : 'under',
      wager: 10 + (index * 5),
      idempotencyKey: `restart-load-bet-${cycle}-${index}-${Date.now()}`,
    };
  });
}

function startRestartLoadWave(roomCode: string, cycle: number): RestartLoadWave {
  const players = buildRestartLoadPlayers(cycle);
  let failedAttempts = 0;

  async function retryUntilAccepted<T>(operation: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 30_000;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      try {
        return await operation();
      } catch (error) {
        failedAttempts += 1;
        lastError = error;
        await delay(250);
      }
    }

    throw lastError || new Error(`Timed out running restart load wave ${cycle}`);
  }

  const promise = (async (): Promise<RestartLoadWaveResult> => {
    await Promise.all(
      players.map((player) =>
        retryUntilAccepted(async () => {
          const { response, data } = await postJson(`/api/rooms/${roomCode}/join`, {
            session_id: player.sessionId,
            nickname: player.nickname,
          });
          if (response.status !== 200) throw new Error(`join ${player.nickname} returned ${response.status}`);
          return data;
        })
      )
    );

    await Promise.all(
      players.map((player) =>
        retryUntilAccepted(async () => {
          const { response, data } = await postJson(
            `/api/rooms/${roomCode}/bet`,
            {
              session_id: player.sessionId,
              outcome: player.outcome,
              wager: player.wager,
            },
            { 'Idempotency-Key': player.idempotencyKey }
          );
          if (response.status !== 200) throw new Error(`bet ${player.nickname} returned ${response.status}`);
          return data;
        })
      )
    );

    return {
      players: players.length,
      trades: players.length,
      wagered: players.reduce((sum, player) => sum + player.wager, 0),
      failedAttempts,
      lastNickname: players[players.length - 1].nickname,
    };
  })();

  return { promise, getFailedAttempts: () => failedAttempts };
}

async function settleRoom(page: Page, roomCode: string) {
  await page.getByRole('button', { name: /Settle/ }).click();
  await expect(page.getByRole('dialog', { name: 'Settle Market' })).toBeVisible();
  await page.getByLabel('Actual price').fill('730000');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomCode}/settle`) && response.status() === 200
    ),
    page.getByRole('button', { name: /Confirm Settlement/ }).click(),
  ]);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (backendPort) await assertPortAvailable(backendPort, 'Backend');
  else backendPort = await getFreePort();

  if (frontendPort) await assertPortAvailable(frontendPort, 'Frontend');
  else frontendPort = await getFreePort();

  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  fs.rmSync(storePath, { force: true });

  await startBackend();
  await startFrontend();
});

test.afterAll(async () => {
  await stopProcess(frontend);
  await stopProcess(backend);
});

test.setTimeout(180_000);

test('rendered multi-player room sustains repeated real backend restarts', async ({
  browser,
  browserName,
}: {
  browser: Browser;
  browserName: string;
}) => {
  const playerContextOptions =
    browserName === 'firefox'
      ? { viewport: playerViewport, hasTouch: true }
      : { viewport: playerViewport, isMobile: true, hasTouch: true };
  const hostContext = await browser.newContext({ viewport: hostViewport });
  const playerOneContext = await browser.newContext(playerContextOptions);
  const playerTwoContext = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const host = await hostContext.newPage();
  const playerOne = await playerOneContext.newPage();
  const playerTwo = await playerTwoContext.newPage();
  const pageErrors: string[] = [];

  for (const page of [host, playerOne, playerTwo]) {
    page.on('pageerror', (error) => pageErrors.push(error.message));
  }

  try {
    const roomCode = await createRoomThroughUi(host);
    await joinRoomThroughUi(playerOne, roomCode, 'Restart Player One');
    await joinRoomThroughUi(playerTwo, roomCode, 'Restart Player Two');

    await expect(host.getByTestId('host-player-count')).toContainText('3 players', { timeout: 15_000 });
    await clickBetAndWait(playerOne, roomCode, /Bet \$25 on OVER/);
    await playerTwo.getByRole('button', { name: 'Set wager to $50' }).click();
    await clickBetAndWait(playerTwo, roomCode, /Bet \$50 on UNDER/);
    await expect(host.getByTestId('total-trades')).toHaveText('2', { timeout: 15_000 });
    await expect(host.getByTestId('total-volume')).toHaveText('$75');
    await expect(playerOne.getByTestId('player-positions')).toContainText('OVER');
    await expect(playerTwo.getByTestId('player-positions')).toContainText('UNDER');
    let expectedPlayers = 3;
    let expectedTrades = 2;
    let expectedWagered = 75;
    let lastLoadNickname = '';

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await stopProcess(backend);
      backend = null;
      const loadWave = startRestartLoadWave(roomCode, cycle);
      await expect.poll(loadWave.getFailedAttempts, { timeout: 5000 }).toBeGreaterThan(0);
      await expectReconnecting(host);
      await expectReconnecting(playerOne);
      await expectReconnecting(playerTwo);

      await startBackend();
      const loadResult = await loadWave.promise;
      expect(loadResult.failedAttempts).toBeGreaterThan(0);
      expectedPlayers += loadResult.players;
      expectedTrades += loadResult.trades;
      expectedWagered += loadResult.wagered;
      lastLoadNickname = loadResult.lastNickname;

      await expectConnected(host);
      await expectConnected(playerOne);
      await expectConnected(playerTwo);
      await expect(host.getByTestId('host-player-count')).toContainText(`${expectedPlayers} players`, {
        timeout: 20_000,
      });
      await expect(host.getByTestId('total-trades')).toHaveText(String(expectedTrades), { timeout: 20_000 });
      await expect(host.getByTestId('total-volume')).toHaveText(`$${expectedWagered.toFixed(0)}`, {
        timeout: 20_000,
      });
      await expect(host.getByTestId('leaderboard')).toContainText('Restart Player One');
      await expect(host.getByTestId('leaderboard')).toContainText('Restart Player Two');
      await expect(host.getByTestId('leaderboard')).toContainText(lastLoadNickname);
      await expect(playerOne.getByTestId('player-positions')).toContainText('OVER');
      await expect(playerTwo.getByTestId('player-positions')).toContainText('UNDER');
    }

    await expect(host.getByTestId('host-player-count')).toContainText(`${expectedPlayers} players`, {
      timeout: 20_000,
    });
    await expect(host.getByTestId('total-trades')).toHaveText(String(expectedTrades), { timeout: 20_000 });
    await expect(host.getByTestId('total-volume')).toHaveText(`$${expectedWagered.toFixed(0)}`, {
      timeout: 20_000,
    });
    await expect(host.getByTestId('leaderboard')).toContainText('Restart Player');
    await expect(host.getByTestId('leaderboard')).toContainText(lastLoadNickname);
    await expect(playerOne.getByTestId('player-positions')).toContainText('OVER');
    await expect(playerTwo.getByTestId('player-positions')).toContainText('UNDER');

    await clickBetAndWait(playerOne, roomCode, /Bet \$25 on OVER/);
    expectedTrades += 1;
    expectedWagered += 25;
    await expect(host.getByTestId('total-trades')).toHaveText(String(expectedTrades), { timeout: 15_000 });
    await expect(host.getByTestId('total-volume')).toHaveText(`$${expectedWagered.toFixed(0)}`);

    await settleRoom(host, roomCode);
    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(playerOne.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(playerTwo.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });

    await restartBackend();
    await host.reload();
    await playerOne.reload();
    await playerTwo.reload();
    await expectConnected(host);
    await expectConnected(playerOne);
    await expectConnected(playerTwo);
    await expect(host.getByTestId('host-settlement-result')).toContainText('OVER WINS', { timeout: 15_000 });
    await expect(playerOne.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(playerTwo.getByTestId('player-settlement-result')).toContainText('OVER wins!', { timeout: 15_000 });
    await expect(host.getByTestId('activity-feed')).toContainText('Market settled');

    expect(pageErrors).toEqual([]);
    const snapshotRoom = loadRoomSnapshot(storePath).rooms[roomCode];
    expect(snapshotRoom).toBeTruthy();
    expect(Object.keys(snapshotRoom.players)).toHaveLength(expectedPlayers);
    expect(snapshotRoom.market.total_trades).toBe(expectedTrades);
    expect(snapshotRoom.settled).toBe(true);
  } finally {
    await hostContext.close();
    await playerOneContext.close();
    await playerTwoContext.close();
  }
});
