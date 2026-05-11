#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const notesPath = path.join(repoRoot, 'docs', 'accessibility-assistive-tech-notes.md');
const property = {
  address: '88 Assistive Tech Way',
  askingPrice: 720000,
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
    detached: true,
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
      proc.child.stdout.destroy();
      proc.child.stderr.destroy();
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

async function waitForHttp(url, proc, timeoutMs, isReady = (response) => response.ok) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`${proc.label} exited early while waiting for ${url}.\n${proc.logs.join('')}`);
    }

    try {
      const response = await fetch(url);
      const body = await response.text();
      if (isReady(response, body)) return;
    } catch {
      // keep polling while the process starts
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${url}.\n${proc.logs.join('')}`);
}

async function startBackend(port, storePath) {
  const proc = startProcess('backend', process.execPath, ['server/index.js'], {
    PORT: String(port),
    DATABASE_URL: '',
    FAIRVALUE_ROOM_STORE_PATH: storePath,
    FAIRVALUE_ROOM_PERSISTENCE: 'on',
  });
  await waitForHttp(`http://127.0.0.1:${port}/api/markets/charts`, proc, 30_000);
  return proc;
}

async function startFrontend(frontendPort, backendPort) {
  const proc = startProcess('frontend', 'npm', ['start', '--', '--host', '127.0.0.1', '--port', String(frontendPort)], {
    VITE_BACKEND_PORT: String(backendPort),
  });
  await waitForHttp(
    `http://127.0.0.1:${frontendPort}`,
    proc,
    120_000,
    (response, body) => response.ok && body.includes('<title>FairValue</title>') && body.includes('<div id="root"></div>')
  );
  return proc;
}

function captureMacAccessibilityTree() {
  const script = `
tell application "System Events"
  tell application process "Google Chrome for Testing"
    set frontmost to true
    set out to ""
    set elems to entire contents of front window
    repeat with e in elems
      try
        set r to role of e as text
        set n to ""
        set d to ""
        set v to ""
        try
          set n to name of e as text
        end try
        try
          set d to description of e as text
        end try
        try
          set v to value of e as text
        end try
        if n is "missing value" then set n to ""
        if d is "missing value" then set d to ""
        if v is "missing value" then set v to ""
        if n is "" and d is not "" then set n to d
        if n is "" and v is not "" then set n to v
        if n is not "" then set out to out & r & ": " & n & linefeed
      end try
    end repeat
    return out
  end tell
end tell`;

  return execFileSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
}

function interestingAxLines(raw) {
  const interestingRoles = /^(AXHeading|AXButton|AXTextField|AXStaticText|AXValueIndicator|AXCheckBox|AXRadioButton|AXLink|AXGroup):/;
  const seen = new Set();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && interestingRoles.test(line))
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(0, 90);
}

function scopedAxTree(raw, marker) {
  if (!marker) return raw;

  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Could not find macOS AX app-region marker: ${marker}`);
  }

  const scoped = raw.slice(markerIndex);
  const lines = scoped.split('\n');
  const chromeTabIndex = lines.findIndex((line) => line.trim() === 'AXRadioButton: FairValue');
  return (chromeTabIndex === -1 ? lines : lines.slice(0, chromeTabIndex)).join('\n');
}

async function captureState({ label, page, expectedNames, appRegionMarker, macAx = true, macAxSkippedReason = '' }) {
  await page.bringToFront();
  await delay(400);
  const aria = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  let appAxRaw = '';
  let axLines = [];

  if (macAx) {
    const axRaw = captureMacAccessibilityTree();
    appAxRaw = scopedAxTree(axRaw, appRegionMarker);
    axLines = interestingAxLines(appAxRaw);
  }

  const evidence = macAx ? appAxRaw : aria;
  const missing = expectedNames.filter((name) => !evidence.includes(name));
  assert.deepEqual(
    missing,
    [],
    `${label} missing accessible names: ${missing.join(', ')}\n\nEvidence excerpt:\n${macAx ? axLines.join('\n') : aria.split('\n').slice(0, 80).join('\n')}`
  );
  return {
    label,
    source: macAx ? 'macOS AX + Playwright ARIA' : 'Playwright ARIA',
    macAxSkippedReason,
    expectedNames,
    aria,
    axLines,
  };
}

async function createRoomThroughUi(page) {
  await page.goto('/join');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByLabel('Host nickname').fill('AX Host');
  await page.getByLabel('Property address').fill(property.address);
  await page.getByLabel('Asking price').fill(String(property.askingPrice));
  await page.getByRole('button', { name: /^Create Room$/ }).click();
  await page.waitForURL(/\/host\/[A-Z0-9]{4}$/);
  await page.getByText('Connected').first().waitFor({ state: 'visible', timeout: 15_000 });
  return new URL(page.url()).pathname.split('/').pop();
}

async function joinRoomThroughUi(page, roomCode) {
  await page.goto(`/play/${roomCode}`);
  await page.getByLabel('Player nickname').fill('AX Player');
  await page.getByRole('button', { name: /^Join Room$/ }).click();
  await page.getByText('Connected').first().waitFor({ state: 'visible', timeout: 15_000 });
}

function renderReport({ frontendPort, backendPort, roomCode, captures }) {
  const tableRows = captures.map((capture) => (
    `| ${capture.label} | ${capture.source} | ${capture.expectedNames.map((name) => `\`${name}\``).join('<br>')} | PASS |`
  )).join('\n');

  const excerpts = captures.map((capture) => {
    const axExcerpt = capture.axLines.length > 0
      ? capture.axLines.join('\n')
      : `Not captured for this dense route: ${capture.macAxSkippedReason || 'Playwright ARIA snapshot used as the bounded evidence source.'}`;

    return `### ${capture.label}\n\nmacOS AX excerpt:\n\n\`\`\`text\n${axExcerpt}\n\`\`\`\n\nPlaywright ARIA snapshot excerpt:\n\n\`\`\`yaml\n${capture.aria.split('\n').slice(0, 80).join('\n')}\n\`\`\`\n`;
  }).join('\n');

  return `# FairValue Assistive Technology Notes

Last captured: 2026-05-11

## Scope

This file records a local assistive-technology evidence pass for the rendered FairValue solo-market and room flows.

- Source app: Vite frontend on \`http://127.0.0.1:${frontendPort}\`
- Backend: Express/WebSocket server on \`http://127.0.0.1:${backendPort}\`
- Room captured: \`${roomCode}\`
- Browser: Playwright Google Chrome for Testing, headed, with \`--force-renderer-accessibility\`
- Platform evidence: macOS System Events accessibility tree for the Chrome window
- Snapshot evidence: Playwright \`ariaSnapshot({ mode: 'ai' })\`

The Browser plugin was listed but its required JavaScript browser-control runtime was not exposed in this session, so this pass used the repo Playwright path. No non-disruptive VoiceOver speech-output CLI was available; this pass verifies the macOS accessibility tree that VoiceOver consumes, but it is not a substitute for a human listening to VoiceOver output and using the rotor.

## Result

| Surface | Evidence source | Required accessible names | Result |
|---|---|---|---|
${tableRows}

## Manual VoiceOver Checklist

Run this checklist with VoiceOver enabled before a public demo or release:

1. On \`/\`, use VO+Right from the top of the page. Confirm VoiceOver announces FairValue, Search properties, Map View, and the Sort control.
2. Open the Sort menu. Confirm VoiceOver announces each sort option and the active option state.
3. Open \`/market/440298192\`. Confirm the property address, price, Market Activity, Financial Details, Multiplayer Mode, and Start a Bid are reachable.
4. On \`/join\`, use VO+Right from the top of the page. Confirm VoiceOver announces the FairValue heading, Create Room, and Join Room in that order.
5. Activate Create Room. Confirm focus lands on Host nickname, then reaches Property address, Asking price, Back, and Create Room in a useful order.
6. Create a room. Confirm the host screen announces room code, player count, connection status, AI toggle state, Settle, property address, probability, leaderboard, activity, QR/public URL controls, and AI analyst controls.
7. Trigger the missing-key AI fallback. Confirm the degraded response is announced as an alert and does not trap focus.
8. Open Settle. Confirm the dialog is announced as Settle Market, focus starts on Actual price, Escape closes the dialog, and focus returns to Settle.
9. Open \`/play/:roomCode\` on a narrow viewport. Confirm Join Game, the room code, property address, Player nickname, and Join Room are announced.
10. Join as a player. Confirm the probability meter announces the percentage, wager presets announce dollar amounts, Custom wager is editable, and OVER/UNDER buttons include the current wager in their names.
11. Place a bet and settle the room. Confirm both host and player settled-result regions announce Market Settled, the actual price, the winning outcome, and affected player names.

## Captured Evidence

${excerpts.trimEnd()}
`;
}

async function main() {
  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
  const storePath = path.join(os.tmpdir(), `fairvalue-assistive-tech-${process.pid}.json`);
  let backend = null;
  let frontend = null;
  let browser = null;

  try {
    backend = await startBackend(backendPort, storePath);
    frontend = await startFrontend(frontendPort, backendPort);
    browser = await chromium.launch({
      headless: false,
      args: ['--force-renderer-accessibility'],
    });

    const desktopContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${frontendPort}`,
      viewport: { width: 1440, height: 900 },
    });
    const mobileContext = await browser.newContext({
      baseURL: `http://127.0.0.1:${frontendPort}`,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const desktop = await desktopContext.newPage();
    const mobile = await mobileContext.newPage();
    const captures = [];

    await desktop.goto('/');
    await desktop.getByLabel('Search properties').waitFor({ state: 'visible', timeout: 15_000 });
    captures.push(await captureState({
      label: '/ browse markets',
      page: desktop,
      appRegionMarker: 'AXTextField: Search properties',
      macAx: false,
      macAxSkippedReason: 'The browse route can expose hundreds of map and card nodes to System Events, so this bounded pass asserts the Playwright ARIA snapshot instead.',
      expectedNames: ['FairValue', 'Search properties', 'Map View', 'Sort', 'Price: High to Low'],
    }));

    await desktop.getByRole('button', { name: /Sort markets by/ }).click();
    captures.push(await captureState({
      label: '/ sort menu open',
      page: desktop,
      appRegionMarker: 'AXStaticText: Sort',
      macAx: false,
      macAxSkippedReason: 'The sort menu sits on the dense browse route; Playwright ARIA provides the bounded menu-role evidence.',
      expectedNames: ['Price: High to Low', 'Price: Low to High', 'Recently Sold', 'Largest', 'Address A-Z'],
    }));
    await desktop.keyboard.press('Escape');

    await desktop.goto('/market/440298192');
    await desktop.getByRole('link', { name: /Back to Markets/ }).waitFor({ state: 'visible', timeout: 15_000 });
    captures.push(await captureState({
      label: '/market property detail',
      page: desktop,
      appRegionMarker: 'AXLink: Back to Markets',
      macAx: false,
      macAxSkippedReason: 'The property detail route includes image, chart, and long detail sections that make full-window System Events traversal unreliable.',
      expectedNames: ['Back to Markets', '3004 26th St', '$800,000', 'Market Activity', 'Financial Details', 'Start a Bid'],
    }));

    await desktop.goto('/join');
    captures.push(await captureState({
      label: '/join pick screen',
      page: desktop,
      appRegionMarker: 'AXHeading: FairValue',
      expectedNames: ['FairValue', 'Create Room', 'Join Room'],
    }));

    await desktop.getByRole('button', { name: /Create Room/ }).click();
    captures.push(await captureState({
      label: '/join create-room form',
      page: desktop,
      appRegionMarker: 'AXHeading: FairValue',
      expectedNames: ['Host nickname', 'Property address', 'Asking price', 'Back', 'Create Room'],
    }));

    await desktop.getByRole('button', { name: /Back/ }).click();
    const roomCode = await createRoomThroughUi(desktop);
    captures.push(await captureState({
      label: '/host room dashboard',
      page: desktop,
      appRegionMarker: `AXStaticText: ${roomCode}`,
      expectedNames: [roomCode, property.address, 'AI bot disabled', 'Settle', 'Connected', 'Market Probability'],
    }));

    await Promise.all([
      desktop.waitForResponse((response) => (
        response.url().includes('/api/ai/cognee/markets') && response.status() === 503
      )),
      desktop.getByRole('button', { name: 'Market summary' }).click(),
    ]);
    await desktop.getByRole('alert').waitFor({ state: 'visible', timeout: 15_000 });
    captures.push(await captureState({
      label: '/host AI degraded alert',
      page: desktop,
      appRegionMarker: 'AXStaticText: AI ANALYST',
      expectedNames: ['AI ANALYST', 'Give me a summary of this market', 'Set COGNEE_API_KEY on the server'],
    }));

    await desktop.getByRole('button', { name: /Settle/ }).click();
    captures.push(await captureState({
      label: '/host settle modal',
      page: desktop,
      appRegionMarker: 'AXGroup: Settle Market',
      expectedNames: ['Settle Market', 'Actual price', 'Cancel', 'Confirm Settlement'],
    }));
    await desktop.keyboard.press('Escape');

    await mobile.goto(`/play/${roomCode}`);
    captures.push(await captureState({
      label: '/play join form',
      page: mobile,
      appRegionMarker: 'AXStaticText: Join Game',
      expectedNames: ['Join Game', roomCode, property.address, 'Player nickname', 'Join Room'],
    }));

    await joinRoomThroughUi(mobile, roomCode);
    captures.push(await captureState({
      label: '/play betting controls',
      page: mobile,
      appRegionMarker: `AXStaticText: ${roomCode}`,
      expectedNames: ['Custom wager', 'Set wager to $100', 'Bet $25 on OVER', 'Bet $25 on UNDER'],
    }));

    await mobile.getByRole('button', { name: 'Bet $25 on OVER' }).click();
    await desktop.getByRole('button', { name: /Settle/ }).click();
    await desktop.getByLabel('Actual price').fill('800000');
    await desktop.getByRole('button', { name: /^Confirm Settlement$/ }).click();
    await desktop.getByTestId('host-settlement-result').waitFor({ state: 'visible', timeout: 15_000 });
    await mobile.getByTestId('player-settlement-result').waitFor({ state: 'visible', timeout: 15_000 });

    captures.push(await captureState({
      label: '/host settled result',
      page: desktop,
      appRegionMarker: `AXStaticText: ${roomCode}`,
      expectedNames: ['Market Settled', 'Actual:', 'OVER', 'WINS', 'AX Player'],
    }));

    captures.push(await captureState({
      label: '/play settled result',
      page: mobile,
      appRegionMarker: `AXStaticText: ${roomCode}`,
      expectedNames: ['Market Settled', 'Actual price', 'OVER', 'wins', 'AX Player'],
    }));

    fs.mkdirSync(path.dirname(notesPath), { recursive: true });
    fs.writeFileSync(notesPath, renderReport({ frontendPort, backendPort, roomCode, captures }));
    console.log(`Assistive-tech notes written to ${path.relative(repoRoot, notesPath)}`);
    console.log(`Captured room ${roomCode} on frontend ${frontendPort}, backend ${backendPort}`);
  } finally {
    if (browser) await browser.close();
    await stopProcess(frontend);
    await stopProcess(backend);
    fs.rmSync(storePath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
