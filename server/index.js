require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const sql = require('./db');
const {
  EVENT_TYPES,
  createInMemoryRoomEventStore,
  replayRoomEvents,
  roomEventToActivity,
} = require('./roomEventLog');
const { createRoomPersistence } = require('./roomPersistence');
const {
  DEFAULT_B,
  priceOver,
  getPublicMarketState,
  createMarketState,
  applyTrade,
  placeBetWithBudget,
  getWinningOutcome,
  settlePlayers,
} = require('../src/lib/marketEngine');

const app = express();
app.use(express.json());

const server = http.createServer(app);

// ─── Room state (multiplayer runtime + local snapshots) ─────────────
// Rooms live in memory for active WebSocket sessions and can be snapshotted
// locally so degraded/no-DB room state survives a backend restart.
// Trades within rooms still attempt to persist to Neon when configured.

const rooms = {};
const HOST_TOKEN_HEADER = 'x-fairvalue-host-token';
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;
const MAX_ASKING_PRICE = 100_000_000;
const MAX_TEXT_LENGTH = 120;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map();
const roomEventStore = createInMemoryRoomEventStore();
let roomPersistence = createRoomPersistence(resolveRoomPersistenceOptions());
let roomPersistenceWriteQueue = Promise.resolve();

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function tagRoomPersistenceError(error) {
  error.roomPersistenceFailed = true;
  return error;
}

function resolveRoomPersistenceOptions() {
  const mode = String(process.env.FAIRVALUE_ROOM_PERSISTENCE || '').toLowerCase();
  const storeMode = String(process.env.FAIRVALUE_ROOM_STORE || '').toLowerCase();
  if (['0', 'false', 'off', 'disabled'].includes(mode) || ['0', 'false', 'off', 'disabled'].includes(storeMode)) {
    return { mode: 'off' };
  }

  if (['postgres', 'neon', 'db', 'database'].includes(storeMode)) {
    return { mode: 'postgres', sql };
  }

  const filePath = process.env.FAIRVALUE_ROOM_STORE_PATH ||
    (require.main === module ? path.join(process.cwd(), '.fairvalue', 'rooms.json') : null);
  return { mode: 'json', filePath };
}

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  } while (rooms[code]);
  return code;
}

function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

function generateHostToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeRoomSnapshot(room) {
  return {
    code: room.code,
    hostToken: room.hostToken,
    house: cloneJson(room.house),
    market: cloneJson(room.market),
    players: cloneJson(room.players),
    betReceipts: Array.from(room.betReceipts.entries()).map(([key, receipt]) => [key, cloneJson(receipt)]),
    aiEnabled: Boolean(room.aiEnabled),
    settled: Boolean(room.settled),
    settlement: room.settlement ? cloneJson(room.settlement) : null,
    activity: cloneJson(room.activity || []),
    marketId: room.marketId || null,
    events: roomEventStore.list(room.code),
  };
}

function hydrateRoomSnapshot(snapshot) {
  const code = normalizeRoomCode(snapshot?.code);
  if (!code || !snapshot?.house) return null;

  return {
    code,
    hostToken: snapshot.hostToken || generateHostToken(),
    house: cloneJson(snapshot.house),
    market: createMarketState(snapshot.market || { b: DEFAULT_B }),
    players: cloneJson(snapshot.players || {}),
    betReceipts: new Map((snapshot.betReceipts || []).map(([key, receipt]) => [key, cloneJson(receipt)])),
    connections: [],
    aiEnabled: false,
    aiInterval: null,
    settled: Boolean(snapshot.settled),
    settlement: snapshot.settlement ? cloneJson(snapshot.settlement) : null,
    activity: cloneJson(snapshot.activity || []),
    marketId: snapshot.marketId || null,
  };
}

function persistRooms() {
  if (!roomPersistence.enabled) return;
  const snapshots = {};
  for (const room of Object.values(rooms)) {
    snapshots[room.code] = serializeRoomSnapshot(room);
  }

  try {
    const write = () => roomPersistence.save({ rooms: snapshots });
    if (roomPersistence.kind === 'json') return write();

    roomPersistenceWriteQueue = roomPersistenceWriteQueue
      .catch(() => {})
      .then(write)
      .catch((error) => {
        console.error(`Room persistence (${roomPersistence.kind}) save failed:`, error.message);
        throw tagRoomPersistenceError(error);
      });
    roomPersistenceWriteQueue.catch(() => {});
    return roomPersistenceWriteQueue;
  } catch (error) {
    console.error(`Room persistence (${roomPersistence.kind}) save failed:`, error.message);
    throw tagRoomPersistenceError(error);
  }
}

async function waitForRoomPersistence(persistenceResult) {
  if (isPromiseLike(persistenceResult)) await persistenceResult;
}

function roomPersistenceError(res, error) {
  if (!error?.roomPersistenceFailed) throw error;
  return res.status(503).json({
    error: 'Room persistence failed',
    message: 'Configured room persistence could not save this room mutation.',
  });
}

function runAiBotInterval(room) {
  room.aiInterval = setInterval(() => {
    if (!room.aiEnabled || room.settled) { clearInterval(room.aiInterval); room.aiInterval = null; return; }

    const probOver = priceOver(room.market.q_over, room.market.q_under, room.market.b);
    const contrarianStrength = 0.6;
    const noise = gaussianRandom() * 0.15;
    let pBetOver = (1 - probOver) * contrarianStrength + 0.5 * (1 - contrarianStrength) + noise;
    pBetOver = Math.max(0.05, Math.min(0.95, pBetOver));

    const outcome = Math.random() < pBetOver ? 'over' : 'under';
    const shareOptions = [1, 2, 3, 5, 8, 10, 15, 20];
    const weights = [25, 20, 15, 12, 8, 8, 7, 5];
    const shares = weightedRandom(shareOptions, weights);

    const execution = applyTrade(room.market, outcome, shares, 'AI');
    room.market = execution.market;
    const trade = execution.trade;

    const marketState = execution.publicMarket;
    const { event: aiEvent, activityEntry } = appendRoomEvent(room, EVENT_TYPES.AI_TRADE, {
      outcome,
      wager: trade.wager,
      shares: execution.shares,
      trade,
      market: marketState,
    });

    broadcast(room, {
      type: 'ai_trade',
      outcome,
      wager: trade.wager,
      trade,
      market: marketState,
      activity: activityEntry,
      event_sequence: aiEvent.sequence,
    });

    persistTrade(room.marketId, trade, shares);
    updateMarketState(room.marketId, room.market);
  }, 5000);
}

function persistRoom(room) {
  if (!room || !rooms[room.code]) return;
  return persistRooms();
}

function hydratePersistedRooms(snapshot) {
  let loaded = 0;

  for (const [code, roomSnapshot] of Object.entries(snapshot.rooms || {})) {
    const room = hydrateRoomSnapshot({ ...roomSnapshot, code: roomSnapshot.code || code });
    if (!room) continue;
    rooms[room.code] = room;
    roomEventStore.replace(room.code, roomSnapshot.events || []);
    loaded += 1;
  }

  return {
    loaded,
    filePath: roomPersistence.filePath,
    kind: roomPersistence.kind,
  };
}

function loadPersistedRooms() {
  if (!roomPersistence.enabled) {
    return { loaded: 0, filePath: roomPersistence.filePath, kind: roomPersistence.kind };
  }

  const loaded = roomPersistence.load();
  if (isPromiseLike(loaded)) return loaded.then(hydratePersistedRooms);
  return hydratePersistedRooms(loaded);
}

function configureRoomPersistence(filePathOrOptions) {
  if (typeof filePathOrOptions === 'object' && filePathOrOptions !== null) {
    roomPersistence = createRoomPersistence({ sql, ...filePathOrOptions });
  } else {
    roomPersistence = createRoomPersistence({
      mode: filePathOrOptions ? 'json' : 'off',
      filePath: filePathOrOptions,
    });
  }
  roomPersistenceWriteQueue = Promise.resolve();
  return loadPersistedRooms();
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/<[^>]*>/g, '').slice(0, maxLength);
  return trimmed || null;
}

function parsePositiveNumber(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return null;
  return parsed;
}

function getIdempotencyKey(req) {
  const key = String(req.get('Idempotency-Key') || req.body?.idempotency_key || '').trim();
  return IDEMPOTENCY_KEY_PATTERN.test(key) ? key : null;
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : crypto.randomUUID();
}

function rateLimitKey(req, scope) {
  const roomCode = normalizeRoomCode(req.params?.code) || req.params?.code || 'global';
  const sessionId = sanitizeText(req.body?.session_id, 100) || 'anonymous';
  return `${scope}:${req.ip || req.socket.remoteAddress || 'unknown'}:${roomCode}:${sessionId}`;
}

function pruneRateLimitBuckets(now = Date.now()) {
  if (rateLimitBuckets.size < 5000) return;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function limitRequests(scope, { max, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    pruneRateLimitBuckets(now);

    const key = rateLimitKey(req, scope);
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count <= max) {
      next();
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      error: 'Too many requests',
      retry_after: retryAfterSeconds,
    });
  };
}

function validateCreateRoomPayload(body) {
  const address = sanitizeText(body?.address, 100);
  const askingPrice = parsePositiveNumber(body?.asking_price, MAX_ASKING_PRICE);
  if (!address) return { error: 'Address is required' };
  if (askingPrice === null) return { error: 'Asking price must be between $1 and $100M' };
  return { value: { address, asking_price: askingPrice } };
}

function validateJoinPayload(body) {
  const sessionId = sanitizeText(body?.session_id, 100);
  const nickname = sanitizeText(body?.nickname, 20);
  if (!sessionId) return { error: 'Session ID is required' };
  if (!nickname) return { error: 'Nickname is required' };
  return { value: { session_id: sessionId, nickname } };
}

function validateBetPayload(body) {
  const sessionId = sanitizeText(body?.session_id, 100);
  const outcome = typeof body?.outcome === 'string' ? body.outcome.trim().toLowerCase() : body?.outcome;
  const wager = parsePositiveNumber(body?.wager, 1000);
  if (!sessionId) return { error: 'Session ID is required' };
  if (!['over', 'under'].includes(outcome)) return { error: "Outcome must be 'over' or 'under'" };
  if (wager === null) return { error: 'Wager must be between $1 and $1,000' };
  return { value: { session_id: sessionId, outcome, wager } };
}

function validateSettlePayload(body) {
  const actualPrice = parsePositiveNumber(body?.actual_price, MAX_ASKING_PRICE);
  if (actualPrice === null) return { error: 'Actual price must be between $1 and $100M' };
  return { value: { actual_price: actualPrice } };
}

function validationError(res, message) {
  return res.status(400).json({ error: message });
}

function betFingerprint(bet) {
  return JSON.stringify({
    session_id: bet.session_id,
    outcome: bet.outcome,
    wager: bet.wager,
  });
}

// ─── Room helpers ───────────────────────────────────────────────────

async function createRoom(house, roomCode) {
  const code = roomCode ? normalizeRoomCode(roomCode) : generateRoomCode();
  if (!code) throw new Error('Room code must be 4 letters or numbers');
  const room = {
    code,
    hostToken: generateHostToken(),
    house,
    market: createMarketState({ b: DEFAULT_B }),
    players: {},
    betReceipts: new Map(),
    connections: [],
    aiEnabled: false,
    aiInterval: null,
    settled: false,
    settlement: null,
    activity: [],
    marketId: null,
  };

  // Persist a new market row + market_state in Neon so trades are saved
  try {
    const propertyId = 'room-' + code;
    const [inserted] = await sql`
      INSERT INTO markets (address, asking_price, property_id, status)
      VALUES (${house.address || ''}, ${house.asking_price || 0}, ${propertyId}, 'open')
      RETURNING id
    `;
    room.marketId = inserted.id;

    await sql`
      INSERT INTO market_state (market_id, q_over, q_under, b, total_trades, total_wagered)
      VALUES (${room.marketId}, 0, 0, 100, 0, 0)
    `;
    console.log(`Room ${code}: created DB market ${room.marketId}`);
  } catch (e) {
    console.error(`Room ${code}: failed to create DB market:`, e.message);
  }

  rooms[code] = room;
  const { persistence } = appendRoomEvent(room, EVENT_TYPES.ROOM_CREATED, {
    house: room.house,
    market: getPublicMarketState(room.market),
  });
  await waitForRoomPersistence(persistence);
  return room;
}

function broadcast(room, event) {
  const msg = JSON.stringify(event);
  room.connections = room.connections.filter(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      return true;
    }
    return false;
  });
}

function appendRoomEvent(room, type, payload = {}, req) {
  const event = roomEventStore.append({
    roomCode: room.code,
    type,
    payload,
    requestId: req?.requestId,
  });
  const activityEntry = roomEventToActivity(event);
  if (activityEntry) room.activity.push(activityEntry);
  let persistence;
  try {
    persistence = persistRoom(room);
  } catch (error) {
    persistence = Promise.reject(error);
  }
  return { event, activityEntry, persistence };
}

function recordRoomError(room, action, message, status, req) {
  appendRoomEvent(room, EVENT_TYPES.ERROR, { action, message, status }, req);
}

function requireHostCapability(req, res, room) {
  const token = req.get(HOST_TOKEN_HEADER);
  if (!token || token !== room.hostToken) {
    const message = token ? 'Invalid host token' : 'Host token required';
    recordRoomError(room, 'host_capability', message, 403, req);
    res.status(403).json({ error: message });
    return false;
  }
  return true;
}

function getRoomFromCodeParam(req, res) {
  const code = normalizeRoomCode(req.params.code);
  if (!code) {
    res.status(400).json({ error: 'Room code must be 4 letters or numbers' });
    return null;
  }

  const room = rooms[code];
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return null;
  }

  return room;
}

function getRoomReplay(room) {
  return replayRoomEvents(roomEventStore.list(room.code));
}

function getRoomStatePayload(room) {
  const replay = getRoomReplay(room);
  const replayPlayers = Object.values(replay.players);

  return {
    market: replay.market || getPublicMarketState(room.market),
    players: replayPlayers.length ? replayPlayers : Object.values(room.players),
    house: replay.house || room.house,
    history: [],
    activity: replay.activity.slice(-50),
    ai_enabled: room.aiEnabled,
    settled: replay.settled || room.settled,
    settlement: replay.settlement || room.settlement,
    event_sequence: replay.last_sequence,
  };
}

// ─── Persist trade to Neon ──────────────────────────────────────────

async function persistTrade(marketId, trade, shares) {
  if (!marketId) return;
  try {
    await sql`INSERT INTO trades (market_id, outcome, shares, wager, payout, prob_over_after, prob_under_after, source)
              VALUES (${marketId}, ${trade.outcome}, ${shares}, ${trade.wager}, ${trade.payout}, ${trade.prob_over_after}, ${trade.prob_under_after}, ${trade.source})`;
  } catch (e) {
    console.error('Failed to persist trade:', e.message);
  }
}

async function updateMarketState(marketId, market) {
  if (!marketId) return;
  try {
    await sql`UPDATE market_state SET q_over=${market.q_over}, q_under=${market.q_under}, total_trades=${market.total_trades}, total_wagered=${market.total_wagered}, updated_at=now() WHERE market_id=${marketId}`;
  } catch (e) {
    console.error('Failed to update market_state:', e.message);
  }
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = normalizeRequestId(req.get(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.set(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const entry = JSON.stringify({
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: durationMs,
    });
    if (res.statusCode >= 500) console.error(entry);
    else console.info(entry);
  });

  next();
});

// ─── Server-side Cognee AI boundary ─────────────────────────────────

const COGNEE_BASE_URL = process.env.COGNEE_BASE_URL || 'https://api.cognee.ai';

function cogneeUnavailable(res) {
  return res.status(503).json({
    degraded: true,
    error: 'AI analyst unavailable',
    message: 'Set COGNEE_API_KEY on the server to enable Cognee analysis.',
  });
}

function safeDatasetSuffix(value) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return cleaned || 'unknown';
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function cogneeRequest(path, { method = 'GET', body } = {}) {
  const apiKey = process.env.COGNEE_API_KEY;
  if (!apiKey) {
    const err = new Error('COGNEE_API_KEY is not configured');
    err.degraded = true;
    err.status = 503;
    throw err;
  }

  const response = await fetch(`${COGNEE_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const err = new Error(`Cognee request failed with status ${response.status}`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function handleCogneeError(res, error) {
  if (error.degraded) return cogneeUnavailable(res);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
  return res.status(status).json({
    error: 'Cognee request failed',
    message: error.message || 'Unexpected Cognee integration failure',
  });
}

app.use('/api/ai/cognee', limitRequests('ai', { max: 60 }));

app.post('/api/ai/cognee/markets/:propertyId/initialize', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const askingPrice = numberOrZero(req.body.asking_price);
  const marketDescription = `
Property Market ${propertyId}: Real estate prediction market with asking price $${askingPrice}.
This market uses LMSR (Logarithmic Market Scoring Rule) algorithm for fair value pricing.
Bettors predict if the property will appraise OVER or UNDER the asking price.
The fair value is calculated as: asking_price + (prob_over - 0.5) * 2 * asking_price * 0.10
`;

  try {
    await cogneeRequest('/api/add', {
      method: 'POST',
      body: {
        data: marketDescription,
        dataset_name: `property_market_${propertyId}`,
      },
    });
    await cogneeRequest('/api/cognify', {
      method: 'POST',
      body: {
        datasets: [`property_market_${propertyId}`],
      },
    });
    res.json({ ok: true });
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.post('/api/ai/cognee/markets/:propertyId/state', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const { state, bet } = req.body;
  if (!state) return res.status(400).json({ error: 'State payload is required' });

  const qOver = numberOrZero(state.qOver);
  const qUnder = numberOrZero(state.qUnder);
  const totalWagered = numberOrZero(state.totalWagered);
  const totalTrades = numberOrZero(state.totalTrades);
  const fairValue = numberOrZero(state.fairValue);
  const askingPrice = numberOrZero(state.askingPrice);
  const timestamp = state.timestamp || new Date().toISOString();

  const stateDescription = `
LMSR Market State at ${timestamp}:
- Property ID: ${propertyId}
- Asking Price: $${askingPrice}
- Current Fair Value: $${fairValue.toFixed(2)}
- qOver (OVER shares outstanding): ${qOver.toFixed(2)}
- qUnder (UNDER shares outstanding): ${qUnder.toFixed(2)}
- Total Wagered: $${totalWagered.toFixed(2)}
- Total Trades: ${totalTrades}
- Probability OVER: ${(qOver / (qOver + qUnder || 1)).toFixed(4)}
`;

  try {
    await cogneeRequest('/api/add', {
      method: 'POST',
      body: {
        data: stateDescription,
        dataset_name: `lmsr_state_${propertyId}`,
      },
    });

    const datasets = [`lmsr_state_${propertyId}`];
    if (bet) {
      const amount = numberOrZero(bet.amount);
      const shares = numberOrZero(bet.shares);
      const actualCost = numberOrZero(bet.actualCost);
      const priceAtBet = numberOrZero(bet.priceAtBet);
      const betDescription = `
Trade Executed at ${bet.timestamp || new Date().toISOString()}:
- Property: ${propertyId}
- Direction: ${bet.direction === 'higher' ? 'OVER (higher)' : 'UNDER (lower)'}
- Wager Amount: $${amount.toFixed(2)}
- Shares Purchased: ${shares.toFixed(2)}
- Actual Cost: $${actualCost.toFixed(2)}
- Price at Bet: $${priceAtBet.toFixed(2)}
- Bet ID: ${bet.id || 'unknown'}
This trade updated the market state through LMSR cost function mechanics.
`;

      await cogneeRequest('/api/add', {
        method: 'POST',
        body: {
          data: betDescription,
          dataset_name: `bets_${propertyId}`,
        },
      });
      datasets.push(`bets_${propertyId}`);
    }

    await cogneeRequest('/api/cognify', {
      method: 'POST',
      body: { datasets },
    });
    res.json({ ok: true });
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.post('/api/ai/cognee/markets/:propertyId/search', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const query = String(req.body.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const data = await cogneeRequest('/api/search', {
      method: 'POST',
      body: {
        query,
        search_type: req.body.search_type || 'GRAPH_COMPLETION',
        datasets: [`property_market_${propertyId}`, `lmsr_state_${propertyId}`, `bets_${propertyId}`],
      },
    });
    res.json(data);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.get('/api/ai/cognee/markets/:propertyId/graph', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  try {
    const data = await cogneeRequest(`/api/datasets/property_market_${propertyId}/graph`);
    res.json(data);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.get('/api/ai/cognee/visualize', async (req, res) => {
  const outputPath = req.query.output_path ? `?output_path=${encodeURIComponent(req.query.output_path)}` : '';
  try {
    const html = await cogneeRequest(`/api/visualize${outputPath}`);
    res.type('html').send(html);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

// ─── Room API routes ────────────────────────────────────────────────

app.post('/api/rooms', limitRequests('rooms:create', { max: 20 }), async (req, res) => {
  const validated = validateCreateRoomPayload(req.body);
  if (validated.error) return validationError(res, validated.error);

  const house = validated.value;
  try {
    const room = await createRoom(house);
    res.json({ room_code: room.code, host_token: room.hostToken, house });
  } catch (error) {
    return roomPersistenceError(res, error);
  }
});

app.post('/api/rooms/:code/join', limitRequests('rooms:join', { max: 30 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;

  const validated = validateJoinPayload(req.body);
  if (validated.error) {
    recordRoomError(room, 'join', validated.error, 400, req);
    return validationError(res, validated.error);
  }

  const { session_id, nickname } = validated.value;
  let player = room.players[session_id];
  let joinBroadcast = null;
  let persistence = null;
  if (player) {
    player.nickname = nickname;
    ({ persistence } = appendRoomEvent(room, EVENT_TYPES.RECONNECT, {
      session_id,
      nickname,
      player: cloneJson(player),
      source: 'join',
    }, req));
  } else {
    player = { session_id, nickname, balance: 1000, bets: [] };
    room.players[session_id] = player;
    const { activityEntry, persistence: joinPersistence } = appendRoomEvent(room, EVENT_TYPES.PLAYER_JOINED, {
      session_id,
      nickname,
      player: cloneJson(player),
      player_count: Object.keys(room.players).length,
    }, req);
    persistence = joinPersistence;
    joinBroadcast = {
      type: 'join',
      nickname,
      player,
      player_count: Object.keys(room.players).length,
      activity: activityEntry,
    };
  }

  try {
    await waitForRoomPersistence(persistence);
  } catch (error) {
    return roomPersistenceError(res, error);
  }

  if (joinBroadcast) broadcast(room, joinBroadcast);

  const state = getRoomStatePayload(room);
  res.json({
    player,
    market: state.market,
    players: state.players,
    house: state.house,
    activity: state.activity,
    settled: state.settled,
    settlement: state.settlement,
    event_sequence: state.event_sequence,
  });
});

app.get('/api/rooms/:code/state', (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;

  res.json(getRoomStatePayload(room));
});

app.get('/api/rooms/:code/events', (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!requireHostCapability(req, res, room)) return;

  const afterSequence = Number(req.query.after_sequence || 0);
  if (!Number.isInteger(afterSequence) || afterSequence < 0) {
    return validationError(res, 'after_sequence must be a non-negative integer');
  }

  const events = roomEventStore.list(room.code, { afterSequence });
  res.json({
    room_code: room.code,
    events,
    last_sequence: events.at(-1)?.sequence || afterSequence,
  });
});

app.get('/api/rooms/:code/replay', (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!requireHostCapability(req, res, room)) return;

  const events = roomEventStore.list(room.code);
  res.json({
    room_code: room.code,
    replay: replayRoomEvents(events),
  });
});

app.post('/api/rooms/:code/bet', limitRequests('rooms:bet', { max: 30 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;

  const validated = validateBetPayload(req.body);
  if (validated.error) {
    recordRoomError(room, 'bet', validated.error, 400, req);
    return validationError(res, validated.error);
  }

  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    recordRoomError(room, 'bet', 'Idempotency-Key header is required for bets', 400, req);
    return validationError(res, 'Idempotency-Key header is required for bets');
  }

  const { session_id, outcome, wager } = validated.value;
  const fingerprint = betFingerprint(validated.value);
  const receipt = room.betReceipts.get(idempotencyKey);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) {
      recordRoomError(room, 'bet', 'Idempotency key was already used for a different bet', 409, req);
      return res.status(409).json({ error: 'Idempotency key was already used for a different bet' });
    }

    res.set('Idempotent-Replay', 'true');
    return res.json({ ...cloneJson(receipt.response), idempotent_replay: true });
  }

  if (room.settled) {
    recordRoomError(room, 'bet', 'Market is settled', 400, req);
    return res.status(400).json({ error: 'Market is settled' });
  }

  const player = room.players[session_id];
  if (!player) {
    recordRoomError(room, 'bet', 'Player not found in room', 404, req);
    return res.status(404).json({ error: 'Player not found in room' });
  }
  if (wager > player.balance) {
    recordRoomError(room, 'bet', 'Insufficient balance', 400, req);
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const execution = placeBetWithBudget(room.market, outcome, wager, player.nickname);
  room.market = execution.market;
  const shares = execution.shares;
  const trade = execution.trade;

  player.balance -= trade.wager;
  player.bets.push({
    outcome,
    wager: trade.wager,
    shares: Math.round(shares * 100) / 100,
    prob_at_entry: outcome === 'over' ? trade.prob_over_after : trade.prob_under_after,
    timestamp: trade.timestamp,
  });

  const marketState = execution.publicMarket;
  const { event, activityEntry } = appendRoomEvent(room, EVENT_TYPES.BET_PLACED, {
    session_id,
    nickname: player.nickname,
    outcome,
    wager: trade.wager,
    shares: Math.round(shares * 100) / 100,
    trade,
    market: marketState,
    player: cloneJson(player),
    idempotency_key: idempotencyKey,
  }, req);

  // Persist to DB in background (don't block response)
  persistTrade(room.marketId, trade, shares);
  updateMarketState(room.marketId, room.market);

  const response = { trade, market: marketState, player, event_sequence: event.sequence };
  room.betReceipts.set(idempotencyKey, {
    fingerprint,
    response: cloneJson(response),
    createdAt: Date.now(),
  });
  try {
    await waitForRoomPersistence(persistRoom(room));
  } catch (error) {
    return roomPersistenceError(res, error);
  }

  broadcast(room, {
    type: 'bet',
    nickname: player.nickname,
    outcome,
    wager: trade.wager,
    trade,
    market: marketState,
    player,
    activity: activityEntry,
    event_sequence: event.sequence,
  });

  res.json(response);
});

app.post('/api/rooms/:code/settle', limitRequests('rooms:settle', { max: 20 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!requireHostCapability(req, res, room)) return;

  const validated = validateSettlePayload(req.body);
  if (validated.error) {
    recordRoomError(room, 'settle', validated.error, 400, req);
    return validationError(res, validated.error);
  }

  if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  room.aiEnabled = false;
  room.settled = true;

  const { actual_price } = validated.value;
  const winningOutcome = getWinningOutcome(actual_price, room.house.asking_price);
  const settlement = settlePlayers(Object.values(room.players), winningOutcome);
  for (const player of settlement.players) {
    room.players[player.session_id] = player;
  }
  const { results } = settlement;

  room.settlement = { winning_outcome: winningOutcome, actual_price, results };
  const { event, activityEntry, persistence } = appendRoomEvent(room, EVENT_TYPES.SETTLEMENT_COMPLETED, {
    actual_price,
    winning_outcome: winningOutcome,
    results,
    settlement: room.settlement,
    players: Object.values(room.players).map((player) => cloneJson(player)),
  }, req);

  try {
    await waitForRoomPersistence(persistence);
  } catch (error) {
    return roomPersistenceError(res, error);
  }

  broadcast(room, { type: 'settle', ...room.settlement, activity: activityEntry, event_sequence: event.sequence });

  res.json({ ...room.settlement, event_sequence: event.sequence });
});

app.post('/api/rooms/:code/toggle-ai', limitRequests('rooms:toggle-ai', { max: 20 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!requireHostCapability(req, res, room)) return;
  if (room.settled) {
    recordRoomError(room, 'toggle-ai', 'Market is settled', 400, req);
    return res.status(400).json({ error: 'Market is settled' });
  }

  room.aiEnabled = !room.aiEnabled;
  const { event, persistence } = appendRoomEvent(room, EVENT_TYPES.PHASE_CHANGED, {
    phase: 'ai_toggled',
    ai_enabled: room.aiEnabled,
  }, req);

  try {
    await waitForRoomPersistence(persistence);
  } catch (error) {
    return roomPersistenceError(res, error);
  }

  if (room.aiEnabled) {
    runAiBotInterval(room);
  } else {
    if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  }

  res.json({ ai_enabled: room.aiEnabled, event_sequence: event.sequence });
});

app.get('/api/rooms/:code/leaderboard', (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;

  const sorted = Object.values(room.players).sort((a, b) => b.balance - a.balance);
  res.json({ leaderboard: sorted.map(p => ({ nickname: p.nickname, balance: Math.round(p.balance * 100) / 100 })) });
});

// ─── Solo market endpoints (read from Neon) ─────────────────────────

app.get('/api/markets', async (req, res) => {
  try {
    const rows = await sql`SELECT m.*, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
                           FROM markets m JOIN market_state ms ON m.id = ms.market_id
                           WHERE m.status = 'open' ORDER BY m.created_at`;
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// Chart endpoints — must be before /api/markets/:id to avoid "charts" matching as :id
app.get('/api/markets/charts', async (req, res) => {
  if (sql.isConfigured === false) return res.json({});

  try {
    const rows = await sql`
      SELECT m.property_id, t.prob_over_after, t.created_at
      FROM trades t JOIN markets m ON t.market_id = m.id
      WHERE t.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY m.property_id, t.created_at
    `;
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.property_id]) grouped[row.property_id] = [];
      grouped[row.property_id].push({
        prob: Number(row.prob_over_after),
        time: row.created_at,
      });
    }
    res.json(grouped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/by-property/:propertyId/chart', async (req, res) => {
  if (sql.isConfigured === false) return res.json([]);

  try {
    const rows = await sql`
      SELECT t.prob_over_after, t.created_at
      FROM trades t
      WHERE t.market_id = (SELECT id FROM markets WHERE property_id = ${req.params.propertyId} LIMIT 1)
      ORDER BY t.created_at DESC
      LIMIT 50
    `;
    const data = rows.reverse().map(r => ({
      prob: Number(r.prob_over_after),
      time: r.created_at,
    }));
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/:id', async (req, res) => {
  try {
    const rows = await sql`SELECT m.*, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
                           FROM markets m JOIN market_state ms ON m.id = ms.market_id
                           WHERE m.id = ${req.params.id}`;
    if (!rows.length) return res.status(404).json({ error: 'Market not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/:id/history', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM trades WHERE market_id = ${req.params.id} ORDER BY created_at`;
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ─── 24/7 Market Simulation Engine ──────────────────────────────────

const simulations = new Map(); // marketId -> { interval, market }

async function startSimulations() {
  try {
    const rows = await sql`
      SELECT m.id, m.property_id, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
      FROM markets m JOIN market_state ms ON m.id = ms.market_id
      WHERE m.status = 'open'
    `;

    let index = 0;
    for (const row of rows) {
      const marketId = row.id;
      const market = createMarketState({
        q_over: Number(row.q_over),
        q_under: Number(row.q_under),
        b: Number(row.b),
        total_trades: Number(row.total_trades),
        total_wagered: Number(row.total_wagered),
      });

      // Stagger start by ~2.5s per market
      const delay = index * 2500;
      setTimeout(() => {
        const interval = setInterval(() => {
          runSimTrade(marketId, market);
        }, 15000);
        simulations.set(marketId, { interval, market });
      }, delay);

      // Store the market object immediately for reference
      simulations.set(marketId, { interval: null, market });
      index++;
    }

    console.log(`Simulation started for ${rows.length} markets`);
  } catch (e) {
    console.error('Failed to start simulations:', e.message);
  }
}

function runSimTrade(marketId, market) {
  const probOver = priceOver(market.q_over, market.q_under, market.b);
  const contrarianStrength = 0.6;
  const noise = gaussianRandom() * 0.15;
  let pBetOver = (1 - probOver) * contrarianStrength + 0.5 * (1 - contrarianStrength) + noise;
  pBetOver = Math.max(0.05, Math.min(0.95, pBetOver));

  const outcome = Math.random() < pBetOver ? 'over' : 'under';
  const shareOptions = [1, 2, 3, 5, 8, 10, 15, 20];
  const weights = [25, 20, 15, 12, 8, 8, 7, 5];
  const shares = weightedRandom(shareOptions, weights);

  const execution = applyTrade(market, outcome, shares, 'auto');
  const trade = execution.trade;
  Object.assign(market, execution.market);

  // Persist in background
  persistTrade(marketId, trade, execution.shares);
  updateMarketState(marketId, market);
}

// ─── Helpers ────────────────────────────────────────────────────────

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── WebSocket ──────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/ws/')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const roomCode = normalizeRoomCode(req.url.replace('/ws/', ''));
  if (!roomCode) { ws.close(4000); return; }
  const room = rooms[roomCode];
  if (!room) { ws.close(4004); return; }

  room.connections.push(ws);
  appendRoomEvent(room, EVENT_TYPES.RECONNECT, {
    source: 'websocket',
    connection_count: room.connections.length,
  });
  ws.on('close', () => {
    room.connections = room.connections.filter(c => c !== ws);
    appendRoomEvent(room, EVENT_TYPES.PLAYER_LEFT, {
      source: 'websocket',
      connection_count: room.connections.length,
    });
  });
});

// ─── Start ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8000;
if (require.main === module) {
  Promise.resolve(loadPersistedRooms())
    .then((restored) => {
      server.listen(PORT, () => {
        console.log(`FairValue server running on http://localhost:${PORT}`);
        if (restored.loaded) {
          const source = restored.filePath || restored.kind;
          console.log(`Restored ${restored.loaded} room(s) from ${source}`);
        }
        startSimulations();
      });
    })
    .catch((error) => {
      console.error('Failed to load persisted rooms:', error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  app,
  server,
  rooms,
  createRoom,
  generateRoomCode,
  normalizeRoomCode,
  generateHostToken,
  requireHostCapability,
  roomEventStore,
  roomPersistence: () => roomPersistence,
  configureRoomPersistence,
  loadPersistedRooms,
  persistRooms,
  replayRoomEvents,
  EVENT_TYPES,
  startSimulations,
};
