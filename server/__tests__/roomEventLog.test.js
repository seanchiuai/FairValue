const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const {
  server,
  rooms,
  roomEventStore,
  EVENT_TYPES,
  configureRoomPersistence,
  loadPersistedRooms,
  roomPersistence,
  roomEventLog,
} = require('../index');
const {
  EVENT_LOG_SCHEMA_VERSION,
  createJsonRoomEventLog,
  createInMemoryRoomEventStore,
  replayRoomEvents,
  validateRoomEventPayload,
} = require('../roomEventLog');

let baseUrl;
let wsBaseUrl;
const tempDirs = new Set();

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      wsBaseUrl = `ws://127.0.0.1:${address.port}`;
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

function openSocket(code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/${code}`);
    const timer = setTimeout(() => reject(new Error(`Timed out opening socket for ${code}`)), 3000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function closeSocket(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', resolve);
    ws.close();
    setTimeout(resolve, 100);
  });
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '321 Event Log Lane', asking_price: 700000 },
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
  roomEventStore.clearAll();
  roomPersistence().clear();
  configureRoomPersistence(null);
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

after(close);

test('in-memory room event adapter appends deterministically and replays state', () => {
  const store = createInMemoryRoomEventStore();

  const created = store.append({
    roomCode: 'a1b2',
    type: EVENT_TYPES.ROOM_CREATED,
    timestamp: 1,
    payload: {
      house: { address: 'Replay House', asking_price: 500000 },
      market: { total_trades: 0, prob_over: 0.5, prob_under: 0.5 },
    },
  });
  const joined = store.append({
    roomCode: 'a1b2',
    type: EVENT_TYPES.PLAYER_JOINED,
    timestamp: 2,
    payload: {
      session_id: 'player-1',
      nickname: 'Replay Player',
      player: { session_id: 'player-1', nickname: 'Replay Player', balance: 1000, bets: [] },
    },
  });
  const bet = store.append({
    roomCode: 'a1b2',
    type: EVENT_TYPES.BET_PLACED,
    timestamp: 3,
    payload: {
      session_id: 'player-1',
      nickname: 'Replay Player',
      outcome: 'over',
      wager: 25,
      market: { total_trades: 1, prob_over: 0.55, prob_under: 0.45 },
      player: { session_id: 'player-1', nickname: 'Replay Player', balance: 975, bets: [{ outcome: 'over' }] },
    },
  });

  assert.equal(created.id, 'A1B2-00000001');
  assert.equal(joined.sequence, 2);
  assert.equal(bet.sequence, 3);
  assert.deepEqual(
    store.list('A1B2', { afterSequence: 1 }).map((event) => event.sequence),
    [2, 3]
  );

  const replay = replayRoomEvents(store.list('a1b2'));
  assert.equal(replay.room_code, 'A1B2');
  assert.equal(replay.house.address, 'Replay House');
  assert.equal(replay.market.total_trades, 1);
  assert.equal(replay.players['player-1'].balance, 975);
  assert.deepEqual(replay.activity.map((entry) => entry.type), ['join', 'bet']);
});

test('room event payload contracts reject malformed canonical events before append', () => {
  const store = createInMemoryRoomEventStore();

  assert.equal(
    validateRoomEventPayload(EVENT_TYPES.ROOM_CREATED, {
      house: { address: 'Contract House', asking_price: 500000 },
      market: { prob_over: 0.5, prob_under: 0.5 },
    }),
    null
  );
  assert.equal(
    validateRoomEventPayload(EVENT_TYPES.RECONNECT, { source: 'websocket', connection_count: 1 }),
    null
  );
  assert.match(
    validateRoomEventPayload(EVENT_TYPES.BET_PLACED, {
      session_id: 'player-1',
      outcome: 'sideways',
      wager: 25,
      market: {},
      player: {},
    }),
    /outcome/
  );
  assert.throws(
    () => store.append({
      roomCode: 'EVNT',
      type: EVENT_TYPES.BET_PLACED,
      payload: { session_id: 'player-1', outcome: 'over', wager: 20, player: {} },
    }),
    /Invalid bet_placed payload: market is required/
  );
  assert.throws(
    () => store.append({
      roomCode: 'EVNT',
      type: EVENT_TYPES.SETTLEMENT_COMPLETED,
      payload: {
        actual_price: 720000,
        winning_outcome: 'over',
        settlement: { actual_price: 720000, winning_outcome: 'over', results: [] },
      },
    }),
    /Invalid settlement_completed payload: evidence_packet is required/
  );
});

test('json room event log appends canonical events without rewriting the stream', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-event-log-'));
  tempDirs.add(tempDir);
  const eventLogPath = path.join(tempDir, 'room-events.ndjson');
  const eventLog = createJsonRoomEventLog({ filePath: eventLogPath });

  const created = {
    id: 'EVLG-00000001',
    room_code: 'EVLG',
    sequence: 1,
    type: EVENT_TYPES.ROOM_CREATED,
    payload: {
      house: { address: 'Append House', asking_price: 500000 },
      market: { total_trades: 0, prob_over: 0.5, prob_under: 0.5 },
    },
    timestamp: 1,
  };
  const joined = {
    id: 'EVLG-00000002',
    room_code: 'EVLG',
    sequence: 2,
    type: EVENT_TYPES.PLAYER_JOINED,
    payload: {
      session_id: 'event-log-player',
      nickname: 'Event Log Player',
      player: { session_id: 'event-log-player', nickname: 'Event Log Player', balance: 1000, bets: [] },
    },
    timestamp: 2,
  };

  eventLog.append(created);
  const firstWrite = fs.readFileSync(eventLogPath, 'utf8');
  eventLog.append(joined);
  const secondWrite = fs.readFileSync(eventLogPath, 'utf8');

  assert.ok(secondWrite.startsWith(firstWrite));
  const records = secondWrite.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.schema_version), [
    EVENT_LOG_SCHEMA_VERSION,
    EVENT_LOG_SCHEMA_VERSION,
  ]);

  const loaded = eventLog.loadRoom('evlg');
  assert.deepEqual(loaded.map((event) => event.sequence), [1, 2]);
  assert.equal(loaded[1].payload.player.session_id, 'event-log-player');
  assert.equal(JSON.stringify(loaded).includes('host_token'), false);
});

test('room event log supports audit access, ordered replay, and settlement reconstruction', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  const deniedEvents = await request(`/api/rooms/${code}/events`);
  assert.equal(deniedEvents.status, 403);

  const ws = await openSocket(code);
  await closeSocket(ws);

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Event Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'event-log-bet-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 25 },
  });
  assert.equal(bet.status, 200);

  const aiEnabled = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(aiEnabled.status, 200);
  assert.equal(aiEnabled.data.ai_enabled, true);

  const aiDisabled = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(aiDisabled.status, 200);
  assert.equal(aiDisabled.data.ai_enabled, false);

  const settlement = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 710000 },
  });
  assert.equal(settlement.status, 200);
  assert.equal(settlement.data.winning_outcome, 'over');
  assert.equal(settlement.data.evidence_packet.status, 'host_attested');

  const eventsResponse = await request(`/api/rooms/${code}/events`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(eventsResponse.status, 200);
  const events = eventsResponse.data.events;
  assert.deepEqual(
    events.map((event) => event.sequence),
    events.map((_, index) => index + 1)
  );

  const eventTypes = events.map((event) => event.type);
  assert.ok(eventTypes.includes(EVENT_TYPES.ROOM_CREATED));
  assert.ok(eventTypes.includes(EVENT_TYPES.ERROR));
  assert.ok(eventTypes.includes(EVENT_TYPES.RECONNECT));
  assert.ok(eventTypes.includes(EVENT_TYPES.PLAYER_LEFT));
  assert.ok(eventTypes.includes(EVENT_TYPES.PLAYER_JOINED));
  assert.ok(eventTypes.includes(EVENT_TYPES.BET_PLACED));
  assert.ok(eventTypes.includes(EVENT_TYPES.PHASE_CHANGED));
  assert.ok(eventTypes.includes(EVENT_TYPES.SETTLEMENT_COMPLETED));
  assert.equal(events.find((event) => event.type === EVENT_TYPES.ERROR).payload.action, 'host_capability');

  const afterCursor = await request(`/api/rooms/${code}/events?after_sequence=${events.at(-2).sequence}`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(afterCursor.status, 200);
  assert.deepEqual(afterCursor.data.events.map((event) => event.type), [EVENT_TYPES.SETTLEMENT_COMPLETED]);

  const replayResponse = await request(`/api/rooms/${code}/replay`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.data.replay.settled, true);
  assert.equal(replayResponse.data.replay.settlement.winning_outcome, 'over');
  assert.equal(replayResponse.data.replay.settlement.evidence_packet.schema_version, 'settlement-evidence/v1');
  assert.equal(replayResponse.data.replay.market.total_trades, 1);
  assert.equal(replayResponse.data.replay.players['player-1'].balance, settlement.data.results[0].final_balance);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.event_sequence, events.at(-1).sequence);
  assert.equal(state.data.settlement.winning_outcome, replayResponse.data.replay.settlement.winning_outcome);
  assert.deepEqual(
    state.data.activity.map((entry) => entry.type),
    ['join', 'bet', 'settle']
  );
});

test('replay verification proves live room projection matches canonical events without leaking authority tokens', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'verify-player', nickname: 'Verify Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'replay-verify-bet-001' },
    body: { session_id: 'verify-player', outcome: 'over', wager: 35 },
  });
  assert.equal(bet.status, 200);

  const aiEnabled = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(aiEnabled.status, 200);
  assert.equal(aiEnabled.data.ai_enabled, true);

  const settlement = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 715000 },
  });
  assert.equal(settlement.status, 200);
  assert.equal(settlement.data.winning_outcome, 'over');

  const denied = await request(`/api/rooms/${code}/replay/verify`);
  assert.equal(denied.status, 403);

  const verified = await request(`/api/rooms/${code}/replay/verify`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.ok, true);
  assert.equal(verified.data.mismatch_count, 0);
  assert.equal(verified.data.room_code, code);
  assert.ok(verified.data.event_count >= 5);
  assert.ok(verified.data.checks.some((check) => check.path === 'market' && check.ok));
  assert.ok(verified.data.checks.some((check) => check.path === 'players' && check.ok));
  assert.ok(verified.data.checks.some((check) => check.path === 'ai_enabled' && check.ok));
  assert.equal(JSON.stringify(verified.data).includes(room.host_token), false);

  rooms[code].players['verify-player'].balance += 1;
  const mismatch = await request(`/api/rooms/${code}/replay/verify`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.data.ok, false);
  assert.deepEqual(
    mismatch.data.mismatches.map((entry) => entry.path),
    ['players']
  );
  assert.equal(JSON.stringify(mismatch.data).includes(room.host_token), false);
});

test('file-backed room persistence restores room state, events, and bet idempotency', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-room-store-'));
  tempDirs.add(tempDir);
  const storePath = path.join(tempDir, 'rooms.json');
  configureRoomPersistence(storePath);
  assert.equal(roomEventLog().filePath, `${storePath}.events.ndjson`);

  const room = await createHostedRoom();
  const code = room.room_code;
  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Durable Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'durable-bet-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 25 },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.market.total_trades, 1);
  assert.equal(fs.existsSync(storePath), true);
  assert.equal(fs.existsSync(roomEventLog().filePath), true);

  const stored = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(stored.rooms[code].code, code);
  assert.equal(stored.rooms[code].hostToken, room.host_token);
  assert.equal(stored.rooms[code].events.at(-1).type, EVENT_TYPES.BET_PLACED);
  assert.equal(stored.rooms[code].betReceipts.length, 1);
  const eventLogRecords = fs.readFileSync(roomEventLog().filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(eventLogRecords.at(-1).event.type, EVENT_TYPES.BET_PLACED);
  assert.equal(JSON.stringify(eventLogRecords).includes(room.host_token), false);
  stored.rooms[code].aiEnabled = true;
  fs.writeFileSync(storePath, `${JSON.stringify(stored, null, 2)}\n`);

  for (const existingCode of Object.keys(rooms)) delete rooms[existingCode];
  roomEventStore.clearAll();

  const restored = loadPersistedRooms();
  assert.equal(restored.loaded, 1);
  assert.ok(rooms[code]);

  const restoredState = await request(`/api/rooms/${code}/state`);
  assert.equal(restoredState.status, 200);
  assert.equal(restoredState.data.house.address, '321 Event Log Lane');
  assert.equal(restoredState.data.market.total_trades, 1);
  assert.equal(restoredState.data.players[0].nickname, 'Durable Player');
  assert.equal(restoredState.data.event_sequence, stored.rooms[code].events.at(-1).sequence);
  assert.equal(restoredState.data.ai_enabled, false);

  const duplicate = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'durable-bet-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 25 },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.idempotent_replay, true);
  assert.equal(rooms[code].market.total_trades, 1);

  const settlement = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 710000 },
  });
  assert.equal(settlement.status, 200);
  assert.equal(settlement.data.winning_outcome, 'over');

  for (const existingCode of Object.keys(rooms)) delete rooms[existingCode];
  roomEventStore.clearAll();
  loadPersistedRooms();

  const settledState = await request(`/api/rooms/${code}/state`);
  assert.equal(settledState.status, 200);
  assert.equal(settledState.data.settled, true);
  assert.equal(settledState.data.settlement.winning_outcome, 'over');
  assert.deepEqual(
    settledState.data.activity.map((entry) => entry.type),
    ['join', 'bet', 'settle']
  );
});

test('append-only room event journal restores replay state when snapshot events are stale', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-event-recovery-'));
  tempDirs.add(tempDir);
  const storePath = path.join(tempDir, 'rooms.json');
  configureRoomPersistence(storePath);

  const room = await createHostedRoom();
  const code = room.room_code;
  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'journal-player', nickname: 'Journal Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'journal-bet-001' },
    body: { session_id: 'journal-player', outcome: 'over', wager: 40 },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.market.total_trades, 1);

  const stored = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const snapshotEventCount = stored.rooms[code].events.length;
  assert.ok(snapshotEventCount >= 3);

  stored.rooms[code].events = stored.rooms[code].events.slice(0, 1);
  stored.rooms[code].market = {
    q_over: 0,
    q_under: 0,
    b: 100,
    total_trades: 0,
    total_wagered: 0,
  };
  stored.rooms[code].players = {};
  stored.rooms[code].activity = [];
  fs.writeFileSync(storePath, `${JSON.stringify(stored, null, 2)}\n`);

  for (const existingCode of Object.keys(rooms)) delete rooms[existingCode];
  roomEventStore.clearAll();

  const restored = loadPersistedRooms();
  assert.equal(restored.loaded, 1);
  assert.equal(roomEventStore.list(code).length, snapshotEventCount);
  assert.equal(rooms[code].market.total_trades, 1);
  assert.equal(rooms[code].players['journal-player'].nickname, 'Journal Player');

  const restoredState = await request(`/api/rooms/${code}/state`);
  assert.equal(restoredState.status, 200);
  assert.equal(restoredState.data.market.total_trades, 1);
  assert.equal(restoredState.data.players[0].nickname, 'Journal Player');
  assert.equal(restoredState.data.event_sequence, snapshotEventCount);

  const secondBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'journal-bet-002' },
    body: { session_id: 'journal-player', outcome: 'under', wager: 20 },
  });
  assert.equal(secondBet.status, 200);
  assert.equal(secondBet.data.market.total_trades, 2);
});
