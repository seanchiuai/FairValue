require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const sql = require('./db');
const {
  EVENT_TYPES,
  createJsonRoomEventLog,
  createPostgresRoomEventLog,
  createInMemoryRoomEventStore,
  replayRoomEvents,
  roomEventToActivity,
} = require('./roomEventLog');
const { createReplayIntegrityReport } = require('./replayIntegrity');
const { createRoomPersistence } = require('./roomPersistence');
const { validateSettlementEvidencePayload } = require('./settlementEvidence');
const { createPublicVerificationArtifact } = require('./publicVerification');
const observability = require('./observability');
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
const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
});
app.use(express.json());

const server = http.createServer(app);

// ─── Room state (multiplayer runtime + local snapshots) ─────────────
// Rooms live in memory for active WebSocket sessions and can be snapshotted
// locally so degraded/no-DB room state survives a backend restart.
// Trades within rooms still attempt to persist to Neon when configured.

const rooms = {};
const HOST_TOKEN_HEADER = 'x-fairvalue-host-token';
const USER_TOKEN_HEADER = 'x-fairvalue-user-token';
const OPS_TOKEN_HEADER = 'x-fairvalue-ops-token';
const USER_TOKEN_VERSION = 'fv1';
const DEFAULT_IDENTITY_SECRET = 'fairvalue-local-dev-identity-secret';
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;
const USER_ID_PATTERN = /^usr_[A-Za-z0-9_-]{16,80}$/;
const MAX_ASKING_PRICE = 100_000_000;
const MAX_TEXT_LENGTH = 120;
const MAX_DRAFT_LIST_ITEMS = 8;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MARKET_DRAFT_SOURCE_TYPES = new Set(['pasted_listing', 'manual', 'csv_row', 'address', 'existing_property']);
const MARKET_DRAFT_FORMATS = new Set(['binary_over_under']);
const MARKET_DRAFT_CONFIDENCES = new Set(['low', 'medium', 'high']);
const rateLimitBuckets = new Map();
let roomPersistence = createRoomPersistence(resolveRoomPersistenceOptions());
let roomEventLog = createRoomEventLog(resolveRoomEventLogOptions(roomPersistence, { configuredSql: sql }));
const roomEventStore = createInMemoryRoomEventStore();
let roomPersistenceWriteQueue = Promise.resolve();

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function tagRoomPersistenceError(error) {
  error.roomPersistenceFailed = true;
  if (!error.roomPersistenceKind) error.roomPersistenceKind = roomPersistence.kind;
  return error;
}

function tagRoomEventLogPersistenceError(error) {
  error.roomPersistenceFailed = true;
  error.roomPersistenceKind = roomEventLog.kind || 'room-event-log';
  return error;
}

function resolveRoomPersistenceOptions() {
  const mode = String(process.env.FAIRVALUE_ROOM_PERSISTENCE || '').toLowerCase();
  const storeMode = String(process.env.FAIRVALUE_ROOM_STORE || '').toLowerCase();
  if (['0', 'false', 'off', 'disabled'].includes(mode) || ['0', 'false', 'off', 'disabled'].includes(storeMode)) {
    return { mode: 'off' };
  }

  if (['postgres', 'neon', 'db', 'database'].includes(storeMode)) {
    return {
      mode: 'postgres',
      sql,
      retentionDays: process.env.FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS || '0',
    };
  }

  const filePath = process.env.FAIRVALUE_ROOM_STORE_PATH ||
    (require.main === module ? path.join(process.cwd(), '.fairvalue', 'rooms.json') : null);
  return {
    mode: 'json',
    filePath,
    encryptionSecret: process.env.FAIRVALUE_ROOM_SNAPSHOT_SECRET || '',
    retentionDays: process.env.FAIRVALUE_ROOM_RETENTION_DAYS || '30',
  };
}

function resolveRoomEventLogOptions(persistence = roomPersistence, { configuredSql = sql } = {}) {
  const mode = String(process.env.FAIRVALUE_ROOM_EVENT_LOG || 'auto').trim().toLowerCase();
  if (['0', 'false', 'off', 'disabled', 'none'].includes(mode)) return {};
  if (['postgres', 'neon', 'db', 'database'].includes(mode)) return { mode: 'postgres', sql: configuredSql };
  if (process.env.FAIRVALUE_ROOM_EVENT_LOG_PATH) {
    return { mode: 'json', filePath: process.env.FAIRVALUE_ROOM_EVENT_LOG_PATH };
  }
  if (persistence?.kind === 'postgres') {
    return { mode: 'postgres', sql: configuredSql };
  }
  if (persistence?.kind === 'json' && persistence.filePath) {
    return { mode: 'json', filePath: `${persistence.filePath}.events.ndjson` };
  }
  return {};
}

function createRoomEventLog(options = {}) {
  const mode = String(options.mode || 'json').trim().toLowerCase();
  if (['postgres', 'neon', 'db', 'database'].includes(mode)) {
    return createPostgresRoomEventLog({ sql: options.sql });
  }
  return createJsonRoomEventLog(options);
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
    hostUserId: room.hostUserId || null,
    house: cloneJson(room.house),
    market: cloneJson(room.market),
    players: cloneJson(room.players),
    betReceipts: Array.from(room.betReceipts.entries()).map(([key, receipt]) => [key, cloneJson(receipt)]),
    aiEnabled: Boolean(room.aiEnabled),
    settled: Boolean(room.settled),
    settlement: room.settlement ? cloneJson(room.settlement) : null,
    durabilityError: room.durabilityError ? cloneJson(room.durabilityError) : null,
    activity: cloneJson(room.activity || []),
    marketId: room.marketId || null,
    draftAudit: room.draftAudit ? cloneJson(room.draftAudit) : null,
    events: roomEventStore.list(room.code),
  };
}

function hydrateRoomSnapshot(snapshot) {
  const code = normalizeRoomCode(snapshot?.code);
  if (!code || !snapshot?.house) return null;

  return {
    code,
    hostToken: snapshot.hostToken || generateHostToken(),
    hostUserId: normalizeUserId(snapshot.hostUserId) || null,
    house: cloneJson(snapshot.house),
    market: createMarketState(snapshot.market || { b: DEFAULT_B }),
    players: cloneJson(snapshot.players || {}),
    betReceipts: new Map((snapshot.betReceipts || []).map(([key, receipt]) => [key, cloneJson(receipt)])),
    connections: [],
    aiEnabled: false,
    aiInterval: null,
    aiTradeInFlight: false,
    settled: Boolean(snapshot.settled),
    settlement: snapshot.settlement ? cloneJson(snapshot.settlement) : null,
    durabilityError: snapshot.durabilityError ? cloneJson(snapshot.durabilityError) : null,
    activity: cloneJson(snapshot.activity || []),
    marketId: snapshot.marketId || null,
    draftAudit: snapshot.draftAudit ? cloneJson(snapshot.draftAudit) : null,
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

function persistRoomEvent(event) {
  if (!roomEventLog.enabled) return;
  try {
    return roomEventLog.append(event);
  } catch (error) {
    throw tagRoomEventLogPersistenceError(error);
  }
}

function combinePersistenceResults(...results) {
  const pending = results.filter(Boolean);
  if (!pending.length) return;
  if (pending.some(isPromiseLike)) return Promise.all(pending);
}

async function waitForRoomPersistence(persistenceResult) {
  if (isPromiseLike(persistenceResult)) await persistenceResult;
}

function roomPersistenceError(res, error) {
  if (!error?.roomPersistenceFailed) throw error;
  observability.increment('persistence.failures');
  observability.increment('room_lifecycle.durability_failures');
  observability.recordError('persistence', error, { kind: error.roomPersistenceKind || roomPersistence.kind });
  return res.status(503).json({
    error: 'Room persistence failed',
    message: 'Configured room persistence could not save this room mutation.',
  });
}

function roomPersistenceFailurePayload(action, error) {
  return {
    action,
    error: 'Room persistence failed',
    message: 'Configured room persistence could not save this room mutation.',
    timestamp: Date.now() / 1000,
  };
}

function setRoomDurabilityError(room, action, error) {
  room.durabilityError = roomPersistenceFailurePayload(action, error);
  observability.increment('room_lifecycle.durability_failures');
  observability.recordError('persistence', error, { action, kind: roomPersistence.kind });
  return room.durabilityError;
}

function clearRoomDurabilityError(room, action) {
  if (!room?.durabilityError) return;
  if (!action || room.durabilityError.action === action) room.durabilityError = null;
}

function stopAiBotInterval(room) {
  if (room?.aiInterval) clearInterval(room.aiInterval);
  if (room) room.aiInterval = null;
}

async function runAiBotTick(room) {
  if (!room || !room.aiEnabled || room.settled) {
    stopAiBotInterval(room);
    return { ok: false, skipped: true };
  }
  if (room.aiTradeInFlight) return { ok: false, skipped: true, reason: 'ai_trade_in_flight' };

  room.aiTradeInFlight = true;
  try {
    if (!room.aiEnabled || room.settled) {
      stopAiBotInterval(room);
      return { ok: false, skipped: true };
    }

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
    const { event: aiEvent, activityEntry, persistence } = appendRoomEvent(room, EVENT_TYPES.AI_TRADE, {
      outcome,
      wager: trade.wager,
      shares: execution.shares,
      trade,
      market: marketState,
    });

    try {
      await waitForRoomPersistence(persistence);
      clearRoomDurabilityError(room, 'ai_trade');
    } catch (error) {
      const durabilityError = setRoomDurabilityError(room, 'ai_trade', error);
      room.aiEnabled = false;
      stopAiBotInterval(room);
      console.error(`Room ${room.code}: AI trade persistence failed; bot disabled:`, error.message);
      broadcast(room, { type: 'room_durability_failed', ...durabilityError });
      return { ok: false, error, durabilityError };
    }

    broadcast(room, {
      type: 'ai_trade',
      outcome,
      wager: trade.wager,
      trade,
      market: marketState,
      activity: activityEntry,
      event_sequence: aiEvent.sequence,
      durability: { room_persistence: 'persisted' },
    });
    observability.increment('room_lifecycle.ai_trades');

    persistTrade(room.marketId, trade, shares);
    updateMarketState(room.marketId, room.market);
    return { ok: true, event_sequence: aiEvent.sequence };
  } finally {
    room.aiTradeInFlight = false;
  }
}

function runAiBotInterval(room) {
  room.aiInterval = setInterval(() => {
    runAiBotTick(room).catch((error) => {
      const durabilityError = setRoomDurabilityError(room, 'ai_trade', error);
      room.aiEnabled = false;
      stopAiBotInterval(room);
      console.error(`Room ${room.code}: AI bot tick failed; bot disabled:`, error.message);
      broadcast(room, { type: 'room_durability_failed', ...durabilityError });
    });
  }, 5000);
}

function persistRoom(room) {
  if (!room || !rooms[room.code]) return;
  return persistRooms();
}

function hydratePersistedRoomsFromEvents(snapshot, durableEvents = []) {
  let loaded = 0;
  const durableEventsByRoom = new Map();

  for (const event of durableEvents) {
    const events = durableEventsByRoom.get(event.room_code) || [];
    events.push(event);
    durableEventsByRoom.set(event.room_code, events);
  }

  for (const [code, roomSnapshot] of Object.entries(snapshot.rooms || {})) {
    const room = hydrateRoomSnapshot({ ...roomSnapshot, code: roomSnapshot.code || code });
    if (!room) continue;
    const snapshotEvents = roomSnapshot.events || [];
    const durableEvents = durableEventsByRoom.get(room.code) || [];
    const events = durableEvents.length >= snapshotEvents.length ? durableEvents : snapshotEvents;
    if (events.length > snapshotEvents.length) hydrateRoomFromReplay(room, events);
    rooms[room.code] = room;
    roomEventStore.replace(room.code, events);
    loaded += 1;
  }

  return {
    loaded,
    filePath: roomPersistence.filePath,
    kind: roomPersistence.kind,
  };
}

function hydratePersistedRooms(snapshot) {
  if (!roomEventLog.enabled) return hydratePersistedRoomsFromEvents(snapshot, []);

  const durableEvents = roomEventLog.load();
  if (isPromiseLike(durableEvents)) {
    return durableEvents.then((events) => hydratePersistedRoomsFromEvents(snapshot, events));
  }
  return hydratePersistedRoomsFromEvents(snapshot, durableEvents);
}

function hydrateRoomFromReplay(room, events) {
  const replay = replayRoomEvents(events);
  if (replay.house) room.house = cloneJson(replay.house);
  if (replay.market) room.market = createMarketState(replay.market);
  if (replay.players) room.players = cloneJson(replay.players);
  if (replay.activity) room.activity = cloneJson(replay.activity);
  room.settled = Boolean(replay.settled);
  room.settlement = replay.settlement ? cloneJson(replay.settlement) : null;
  room.draftAudit = replay.draft_audit ? cloneJson(replay.draft_audit) : room.draftAudit;
  room.aiEnabled = false;
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
  let eventLogSql = sql;
  if (typeof filePathOrOptions === 'object' && filePathOrOptions !== null) {
    roomPersistence = createRoomPersistence({ sql, ...filePathOrOptions });
    eventLogSql = filePathOrOptions.sql || sql;
  } else {
    roomPersistence = createRoomPersistence({
      mode: filePathOrOptions ? 'json' : 'off',
      filePath: filePathOrOptions,
    });
  }
  roomEventLog = createRoomEventLog(resolveRoomEventLogOptions(roomPersistence, { configuredSql: eventLogSql }));
  roomPersistenceWriteQueue = Promise.resolve();
  return loadPersistedRooms();
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/<[^>]*>/g, '').slice(0, maxLength);
  return trimmed || null;
}

function normalizeUserId(value) {
  const userId = sanitizeText(value, 100);
  return userId && USER_ID_PATTERN.test(userId) ? userId : null;
}

function getIdentitySecret() {
  return process.env.FAIRVALUE_IDENTITY_SECRET || DEFAULT_IDENTITY_SECRET;
}

function generateUserId() {
  return `usr_${crypto.randomBytes(18).toString('base64url')}`;
}

function signUserId(userId) {
  return crypto
    .createHmac('sha256', getIdentitySecret())
    .update(`${USER_TOKEN_VERSION}:${userId}`)
    .digest('base64url');
}

function createUserToken(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) throw new Error('Invalid user ID');
  return `${USER_TOKEN_VERSION}.${normalizedUserId}.${signUserId(normalizedUserId)}`;
}

function verifyUserToken(token) {
  if (typeof token !== 'string') return null;
  const [version, userId, signature] = token.trim().split('.');
  const normalizedUserId = normalizeUserId(userId);
  if (version !== USER_TOKEN_VERSION || !normalizedUserId || !signature) return null;

  const expected = signUserId(normalizedUserId);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  return { user_id: normalizedUserId };
}

function parsePositiveNumber(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return null;
  return parsed;
}

function normalizeDraftPropertyId(value) {
  const propertyId = sanitizeText(value, 80);
  return propertyId && /^[A-Za-z0-9._:-]+$/.test(propertyId) ? propertyId : null;
}

function sanitizeTextList(value, itemMaxLength = 160, maxItems = MAX_DRAFT_LIST_ITEMS) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, itemMaxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function hashDraftSourceText(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return crypto.createHash('sha256').update(value.trim()).digest('hex');
}

function validateMarketDraftAuditPayload(rawDraft, house) {
  if (rawDraft == null) return { value: null };
  if (typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
    return { error: 'Market draft must be an object' };
  }

  const sourceType = sanitizeText(rawDraft.source_type, 40) || 'manual';
  if (!MARKET_DRAFT_SOURCE_TYPES.has(sourceType)) {
    return { error: 'Market draft source type is invalid' };
  }

  const address = sanitizeText(rawDraft.address, 100);
  const askingPrice = parsePositiveNumber(rawDraft.asking_price, MAX_ASKING_PRICE);
  if (!address) return { error: 'Market draft address is required' };
  if (askingPrice === null) return { error: 'Market draft asking price must be between $1 and $100M' };
  if (address !== house.address) return { error: 'Market draft address must match room address' };
  if (Math.abs(askingPrice - house.asking_price) > 0.01) {
    return { error: 'Market draft asking price must match room asking price' };
  }

  const marketFormat = sanitizeText(rawDraft.market_format, 60) || 'binary_over_under';
  if (!MARKET_DRAFT_FORMATS.has(marketFormat)) {
    return { error: 'Market draft format is invalid' };
  }

  const provenance = rawDraft.provenance && typeof rawDraft.provenance === 'object'
    ? rawDraft.provenance
    : {};
  const confidence = sanitizeText(provenance.confidence, 20) || 'low';
  if (!MARKET_DRAFT_CONFIDENCES.has(confidence)) {
    return { error: 'Market draft provenance confidence is invalid' };
  }

  const sourceText = typeof rawDraft.source_text === 'string' ? rawDraft.source_text : '';
  const liquidityB = parsePositiveNumber(rawDraft.liquidity_b, 10_000) || DEFAULT_B;
  const evidenceRequired = sanitizeTextList(rawDraft.evidence_required, 180, 6);
  const warnings = sanitizeTextList(rawDraft.warnings, 180, 8);
  const matchedSignals = sanitizeTextList(provenance.matchedSignals, 80, 8);

  return {
    value: {
      schema_version: 'market-draft-audit/v1',
      source_type: sourceType,
      property_id: normalizeDraftPropertyId(rawDraft.property_id),
      normalized_fields: {
        address,
        city: sanitizeText(rawDraft.city, 80),
        state: sanitizeText(rawDraft.state, 20),
        zip: sanitizeText(rawDraft.zip, 20),
        asking_price: askingPrice,
        beds: parsePositiveNumber(rawDraft.beds, 100),
        baths: parsePositiveNumber(rawDraft.baths, 100),
        sqft: parsePositiveNumber(rawDraft.sqft, 1_000_000),
        home_type: sanitizeText(rawDraft.home_type, 80),
      },
      provenance: {
        source: sanitizeText(provenance.source, 100) || 'Unspecified draft source',
        confidence,
        matchedSignals,
      },
      market_question: sanitizeText(rawDraft.market_question, 180) || `Will ${address} appraise above $${askingPrice.toLocaleString()}?`,
      market_format: marketFormat,
      liquidity_b: liquidityB,
      settlement_rule: sanitizeText(rawDraft.settlement_rule, 240) || 'Settle using final sale price, appraisal, or host-provided valuation evidence.',
      evidence_required: evidenceRequired,
      generated_summary: sanitizeText(rawDraft.generated_summary, 520),
      warnings,
      source_text_hash: hashDraftSourceText(sourceText),
      source_text_length: sourceText.trim().length,
      validation: {
        status: 'accepted',
        checked_at: Date.now() / 1000,
        issues: [],
      },
    },
  };
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
    observability.increment('rate_limits.rejected');
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
  const hasHostUserId = Object.prototype.hasOwnProperty.call(body || {}, 'host_user_id');
  const hostUserId = hasHostUserId ? normalizeUserId(body?.host_user_id) : null;
  if (!address) return { error: 'Address is required' };
  if (askingPrice === null) return { error: 'Asking price must be between $1 and $100M' };
  if (hasHostUserId && !hostUserId) return { error: 'Host user ID is invalid' };
  const house = { address, asking_price: askingPrice };
  const draftAudit = validateMarketDraftAuditPayload(body?.market_draft, house);
  if (draftAudit.error) return { error: draftAudit.error };
  return { value: { ...house, host_user_id: hostUserId, draft_audit: draftAudit.value } };
}

function validateJoinPayload(body) {
  const sessionId = sanitizeText(body?.session_id, 100);
  const nickname = sanitizeText(body?.nickname, 20);
  const hasUserId = Object.prototype.hasOwnProperty.call(body || {}, 'user_id');
  const userId = hasUserId ? normalizeUserId(body?.user_id) : null;
  if (!sessionId) return { error: 'Session ID is required' };
  if (!nickname) return { error: 'Nickname is required' };
  if (hasUserId && !userId) return { error: 'User ID is invalid' };
  return { value: { session_id: sessionId, nickname, user_id: userId } };
}

function validateBetPayload(body) {
  const sessionId = sanitizeText(body?.session_id, 100);
  const hasUserId = Object.prototype.hasOwnProperty.call(body || {}, 'user_id');
  const userId = hasUserId ? normalizeUserId(body?.user_id) : null;
  const outcome = typeof body?.outcome === 'string' ? body.outcome.trim().toLowerCase() : body?.outcome;
  const wager = parsePositiveNumber(body?.wager, 1000);
  if (!sessionId) return { error: 'Session ID is required' };
  if (hasUserId && !userId) return { error: 'User ID is invalid' };
  if (!['over', 'under'].includes(outcome)) return { error: "Outcome must be 'over' or 'under'" };
  if (wager === null) return { error: 'Wager must be between $1 and $1,000' };
  return { value: { session_id: sessionId, user_id: userId, outcome, wager } };
}

function validateSettlePayload(body) {
  const actualPrice = parsePositiveNumber(body?.actual_price, MAX_ASKING_PRICE);
  if (actualPrice === null) return { error: 'Actual price must be between $1 and $100M' };
  const rawEvidence = Object.prototype.hasOwnProperty.call(body || {}, 'settlement_evidence')
    ? body.settlement_evidence
    : body?.evidence_packet;
  const evidence = validateSettlementEvidencePayload(rawEvidence, actualPrice);
  if (evidence.error) return { error: evidence.error };
  return { value: { actual_price: actualPrice, evidence_packet: evidence.value } };
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

async function createRoom(house, roomCode, options = {}) {
  const code = roomCode ? normalizeRoomCode(roomCode) : generateRoomCode();
  if (!code) throw new Error('Room code must be 4 letters or numbers');
  const room = {
    code,
    hostToken: generateHostToken(),
    hostUserId: normalizeUserId(options.hostUserId) || null,
    house,
    market: createMarketState({ b: DEFAULT_B }),
    players: {},
    betReceipts: new Map(),
    connections: [],
    aiEnabled: false,
    aiInterval: null,
    aiTradeInFlight: false,
    settled: false,
    settlement: null,
    durabilityError: null,
    activity: [],
    marketId: null,
    draftAudit: options.draftAudit ? cloneJson(options.draftAudit) : null,
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
    observability.recordError('database', e, { operation: 'create_room_market' });
    console.error(`Room ${code}: failed to create DB market:`, e.message);
  }

  rooms[code] = room;
  const { persistence } = appendRoomEvent(room, EVENT_TYPES.ROOM_CREATED, {
    house: room.house,
    market: getPublicMarketState(room.market),
    host_user_id: room.hostUserId,
    draft_audit: room.draftAudit,
  });
  await waitForRoomPersistence(persistence);
  return room;
}

function broadcast(room, event) {
  const msg = JSON.stringify(event);
  let recipients = 0;
  room.connections = room.connections.filter(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      recipients += 1;
      return true;
    }
    return false;
  });
  observability.increment('websocket.broadcasts');
  observability.increment('websocket.broadcast_recipients', recipients);
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
  let eventPersistence;
  let roomSnapshotPersistence;
  try {
    eventPersistence = persistRoomEvent(event);
  } catch (error) {
    eventPersistence = Promise.reject(error);
  }
  try {
    roomSnapshotPersistence = persistRoom(room);
  } catch (error) {
    roomSnapshotPersistence = Promise.reject(error);
  }
  const persistence = combinePersistenceResults(eventPersistence, roomSnapshotPersistence);
  return { event, activityEntry, persistence };
}

function recordRoomError(room, action, message, status, req) {
  observability.increment('room_lifecycle.room_errors');
  return appendRoomEvent(room, EVENT_TYPES.ERROR, { action, message, status }, req);
}

async function rejectRoomAuth(res, room, action, message, status, req) {
  const { persistence } = recordRoomError(room, action, message, status, req);
  try {
    await waitForRoomPersistence(persistence);
  } catch (error) {
    roomPersistenceError(res, error);
    return false;
  }

  res.status(status).json({ error: message });
  return false;
}

async function requireMatchingUserIdentity(req, res, room, sessionId, action) {
  const hasUserId = Object.prototype.hasOwnProperty.call(req.body || {}, 'user_id');
  const bodyUserId = hasUserId ? normalizeUserId(req.body.user_id) : null;
  const token = req.get(USER_TOKEN_HEADER);

  if (!token && !hasUserId) return true;
  if (!token) return rejectRoomAuth(res, room, action, 'User token required', 403, req);

  const identity = verifyUserToken(token);
  if (!identity) return rejectRoomAuth(res, room, action, 'Invalid user token', 403, req);
  if (bodyUserId && bodyUserId !== identity.user_id) {
    return rejectRoomAuth(res, room, action, 'User token does not match session', 403, req);
  }
  if (sessionId !== identity.user_id) {
    return rejectRoomAuth(res, room, action, 'User token does not match session', 403, req);
  }

  req.userIdentity = identity;
  return true;
}

async function requireHostCapability(req, res, room) {
  const hostToken = req.get(HOST_TOKEN_HEADER);
  if (hostToken) {
    if (hostToken === room.hostToken) return true;
    return rejectRoomAuth(res, room, 'host_capability', 'Invalid host token', 403, req);
  }

  const userToken = req.get(USER_TOKEN_HEADER);
  if (userToken) {
    const identity = verifyUserToken(userToken);
    if (!identity) return rejectRoomAuth(res, room, 'host_capability', 'Invalid user token', 403, req);
    if (room.hostUserId && identity.user_id === room.hostUserId) return true;
    return rejectRoomAuth(res, room, 'host_capability', 'Host identity required', 403, req);
  }

  const message = room.hostUserId ? 'Host token or host identity required' : 'Host token required';
  return rejectRoomAuth(res, room, 'host_capability', message, 403, req);
}

function requireExpectedUserIdentity(req, res, expectedUserId) {
  const token = req.get(USER_TOKEN_HEADER);
  if (!token) {
    res.status(403).json({ error: 'User token required' });
    return null;
  }

  const identity = verifyUserToken(token);
  if (!identity) {
    res.status(403).json({ error: 'Invalid user token' });
    return null;
  }
  if (expectedUserId && identity.user_id !== expectedUserId) {
    res.status(403).json({ error: 'User token does not match session' });
    return null;
  }

  req.userIdentity = identity;
  return identity;
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

function recordReplayIntegrity(report) {
  observability.increment('replay_integrity.checks');
  if (report.ok) return;
  observability.increment('replay_integrity.failures');
  observability.recordError('replay_integrity', new Error('Room replay integrity mismatch'), {
    room_code: report.room_code,
    mismatch_paths: report.mismatches.map((mismatch) => mismatch.path),
    last_sequence: report.last_sequence,
  });
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
    host_user_id: room.hostUserId || null,
    durability_error: room.durabilityError || null,
    settled: replay.settled || room.settled,
    settlement: replay.settlement || room.settlement,
    event_sequence: replay.last_sequence,
    draft_audit: replay.draft_audit || room.draftAudit || null,
  };
}

// ─── Persist trade to Neon ──────────────────────────────────────────

async function persistTrade(marketId, trade, shares) {
  if (!marketId) return;
  try {
    await sql`INSERT INTO trades (market_id, outcome, shares, wager, payout, prob_over_after, prob_under_after, source)
              VALUES (${marketId}, ${trade.outcome}, ${shares}, ${trade.wager}, ${trade.payout}, ${trade.prob_over_after}, ${trade.prob_under_after}, ${trade.source})`;
  } catch (e) {
    observability.recordError('database', e, { operation: 'persist_trade' });
    console.error('Failed to persist trade:', e.message);
  }
}

async function updateMarketState(marketId, market) {
  if (!marketId) return;
  try {
    await sql`UPDATE market_state SET q_over=${market.q_over}, q_under=${market.q_under}, total_trades=${market.total_trades}, total_wagered=${market.total_wagered}, updated_at=now() WHERE market_id=${marketId}`;
  } catch (e) {
    observability.recordError('database', e, { operation: 'update_market_state' });
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
    observability.observeRequest(req, res, durationMs);
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

function safeCompareSecrets(provided, expected) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getProvidedOpsToken(req) {
  const auth = String(req.get('authorization') || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.get(OPS_TOKEN_HEADER) || '').trim();
}

function requireOpsAccess(req, res) {
  const configuredToken = String(process.env.FAIRVALUE_OPS_TOKEN || '').trim();
  if (!configuredToken) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({
        error: 'Ops token is required',
        message: 'Set FAIRVALUE_OPS_TOKEN before exposing operational metrics in production.',
      });
      return false;
    }
    return true;
  }

  if (!safeCompareSecrets(getProvidedOpsToken(req), configuredToken)) {
    res.status(403).json({ error: 'Ops token required' });
    return false;
  }
  return true;
}

app.get('/healthz', (req, res) => {
  res.json(observability.health());
});

app.get('/readyz', (req, res) => {
  const payload = observability.readiness({ roomPersistence, roomEventLog, sql });
  res.status(payload.ready ? 200 : 503).json(payload);
});

app.get('/api/ops/metrics', (req, res) => {
  if (!requireOpsAccess(req, res)) return;
  res.json(observability.snapshot({ rooms, roomPersistence, roomEventLog, sql }));
});

app.get('/metrics', (req, res) => {
  if (!requireOpsAccess(req, res)) return;
  res
    .type('text/plain; version=0.0.4; charset=utf-8')
    .send(observability.prometheusMetrics({ rooms, roomPersistence, roomEventLog, sql }));
});

app.post('/api/identity', limitRequests('identity:create', { max: 60 }), (req, res) => {
  const userId = generateUserId();
  res.json({
    user_id: userId,
    user_token: createUserToken(userId),
  });
});

// ─── Server-side Cognee AI boundary ─────────────────────────────────

const COGNEE_BASE_URL = process.env.COGNEE_BASE_URL || 'https://api.cognee.ai';

function cogneeUnavailable(res, payload = {}) {
  observability.increment('ai.degraded_responses');
  return res.status(payload.statusCode || 200).json({
    degraded: true,
    error: 'AI analyst unavailable',
    message: 'COGNEE_API_KEY is not configured; using local room-state analysis where possible.',
    ...payload,
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatMoney(value) {
  return `$${Math.round(numberOrZero(value)).toLocaleString('en-US')}`;
}

function formatPercent(value) {
  return `${Math.round(clampNumber(numberOrZero(value), 0, 1) * 100)}%`;
}

function normalizeAnalystContext(rawContext = {}) {
  const context = rawContext && typeof rawContext === 'object' ? rawContext : {};
  const probabilityOver = clampNumber(
    numberOrZero(context.probability_over ?? context.prob_over ?? context.probOver),
    0,
    1
  );
  const askingPrice = numberOrZero(context.asking_price ?? context.askingPrice);
  const impliedFairValue = numberOrZero(
    context.implied_fair_value ?? context.fair_value ?? context.fairValue
  );
  const totalTrades = Math.max(0, Math.round(numberOrZero(context.total_trades ?? context.totalTrades)));
  const totalWagered = Math.max(0, numberOrZero(context.total_wagered ?? context.totalWagered));
  const playerCount = Math.max(0, Math.round(numberOrZero(context.player_count ?? context.playerCount)));
  const recentBets = Array.isArray(context.recent_bets)
    ? context.recent_bets.slice(-5).map((bet) => ({
      nickname: String(bet?.nickname || 'Participant'),
      outcome: String(bet?.outcome || 'unknown').toUpperCase(),
      wager: Math.max(0, numberOrZero(bet?.wager)),
    }))
    : [];

  return {
    probabilityOver,
    askingPrice,
    impliedFairValue,
    totalTrades,
    totalWagered,
    playerCount,
    recentBets,
    timestamp: String(context.timestamp || new Date().toISOString()),
  };
}

function buildLocalAnalystResponse(propertyId, query, rawContext) {
  const context = normalizeAnalystContext(rawContext);
  const overPercent = formatPercent(context.probabilityOver);
  const lean = context.probabilityOver > 0.55
    ? 'leans OVER'
    : context.probabilityOver < 0.45
      ? 'leans UNDER'
      : 'is close to neutral';
  const recentFlow = context.recentBets.length
    ? context.recentBets.map((bet) => `${bet.nickname} ${bet.outcome} ${formatMoney(bet.wager)}`).join('; ')
    : 'No recent bets are in the local room snapshot yet.';

  return {
    local_analysis: true,
    content:
      `Local AI analyst: Cognee is not configured, so this answer is generated from the live room snapshot only.\n\n` +
      `The market ${lean}: ${overPercent} of the LMSR probability is on OVER, with ` +
      `${context.totalTrades} trade${context.totalTrades === 1 ? '' : 's'} and ` +
      `${formatMoney(context.totalWagered)} in simulated volume. The room-implied fair value is ` +
      `${formatMoney(context.impliedFairValue)} against a ${formatMoney(context.askingPrice)} asking price. ` +
      `Recent flow: ${recentFlow}\n\n` +
      `Question handled: ${String(query).slice(0, 240)}`,
    citations: [
      {
        id: 'room-market-snapshot',
        label: 'Room market snapshot',
        detail: `${overPercent} OVER, ${context.totalTrades} trades, ${formatMoney(context.totalWagered)} simulated volume, captured ${context.timestamp}.`,
      },
      {
        id: 'lmsr-fair-value-formula',
        label: 'LMSR fair-value formula',
        detail: 'asking_price + (prob_over - 0.5) * 2 * asking_price * 0.10.',
      },
      {
        id: 'recent-room-flow',
        label: 'Recent room flow',
        detail: recentFlow,
      },
    ],
    limitations: [
      'Cognee is not configured, so no external comps, neighborhood data, listing documents, or knowledge graph memory were queried.',
      'This is a simulated-credit market summary, not an appraisal, investment recommendation, or real-money trading instruction.',
      `The analysis is scoped to property market ${propertyId} and the current submitted room state.`,
    ],
  };
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
  observability.increment('ai.integration_errors');
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

  if (!process.env.COGNEE_API_KEY) {
    return cogneeUnavailable(res, buildLocalAnalystResponse(propertyId, query, req.body.market_context));
  }

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

  const { host_user_id, draft_audit, ...house } = validated.value;
  if (host_user_id && !requireExpectedUserIdentity(req, res, host_user_id)) return;

  try {
    const room = await createRoom(house, undefined, { hostUserId: host_user_id, draftAudit: draft_audit });
    observability.increment('room_lifecycle.created');
    res.json({ room_code: room.code, host_token: room.hostToken, house, draft_audit: room.draftAudit });
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
  if (!(await requireMatchingUserIdentity(req, res, room, session_id, 'join'))) return;

  let player = room.players[session_id];
  let joinBroadcast = null;
  let persistence = null;
  let joinLifecycleCounter = null;
  if (player) {
    player.nickname = nickname;
    joinLifecycleCounter = 'room_lifecycle.reconnected';
    ({ persistence } = appendRoomEvent(room, EVENT_TYPES.RECONNECT, {
      session_id,
      nickname,
      player: cloneJson(player),
      source: 'join',
    }, req));
  } else {
    player = { session_id, nickname, balance: 1000, bets: [] };
    room.players[session_id] = player;
    joinLifecycleCounter = 'room_lifecycle.joined';
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
  if (joinLifecycleCounter) observability.increment(joinLifecycleCounter);

  const state = getRoomStatePayload(room);
  res.json({
    player,
    market: state.market,
    players: state.players,
    house: state.house,
    activity: state.activity,
    host_user_id: state.host_user_id,
    draft_audit: state.draft_audit,
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

app.get('/api/rooms/:code/events', async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!(await requireHostCapability(req, res, room))) return;

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

app.get('/api/rooms/:code/replay', async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!(await requireHostCapability(req, res, room))) return;

  const events = roomEventStore.list(room.code);
  res.json({
    room_code: room.code,
    replay: replayRoomEvents(events),
  });
});

app.get('/api/rooms/:code/replay/verify', async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!(await requireHostCapability(req, res, room))) return;

  const report = createReplayIntegrityReport(room, roomEventStore.list(room.code));
  recordReplayIntegrity(report);
  res.status(report.ok ? 200 : 409).json(report);
});

app.get('/api/rooms/:code/public-verification', (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;

  const events = roomEventStore.list(room.code);
  const report = createReplayIntegrityReport(room, events);
  recordReplayIntegrity(report);
  const artifact = createPublicVerificationArtifact(room, events, { integrityReport: report });

  if (!artifact.settled) {
    return res.status(409).json({
      error: 'Public verification is available after settlement',
      ...artifact,
    });
  }

  res.status(artifact.replay.live_match ? 200 : 409).json(artifact);
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
  if (!(await requireMatchingUserIdentity(req, res, room, session_id, 'bet'))) return;

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
  const { event, activityEntry, persistence } = appendRoomEvent(room, EVENT_TYPES.BET_PLACED, {
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
    await waitForRoomPersistence(combinePersistenceResults(persistence, persistRoom(room)));
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
  observability.increment('room_lifecycle.bets');

  res.json(response);
});

app.post('/api/rooms/:code/settle', limitRequests('rooms:settle', { max: 20 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!(await requireHostCapability(req, res, room))) return;

  const validated = validateSettlePayload(req.body);
  if (validated.error) {
    recordRoomError(room, 'settle', validated.error, 400, req);
    return validationError(res, validated.error);
  }

  if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  room.aiEnabled = false;
  room.settled = true;

  const { actual_price, evidence_packet } = validated.value;
  const winningOutcome = getWinningOutcome(actual_price, room.house.asking_price);
  const settlement = settlePlayers(Object.values(room.players), winningOutcome);
  for (const player of settlement.players) {
    room.players[player.session_id] = player;
  }
  const { results } = settlement;

  room.settlement = { winning_outcome: winningOutcome, actual_price, results, evidence_packet };
  const { event, activityEntry, persistence } = appendRoomEvent(room, EVENT_TYPES.SETTLEMENT_COMPLETED, {
    actual_price,
    winning_outcome: winningOutcome,
    evidence_packet,
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
  observability.increment('room_lifecycle.settlements');

  res.json({ ...room.settlement, event_sequence: event.sequence });
});

app.post('/api/rooms/:code/toggle-ai', limitRequests('rooms:toggle-ai', { max: 20 }), async (req, res) => {
  const room = getRoomFromCodeParam(req, res);
  if (!room) return;
  if (!(await requireHostCapability(req, res, room))) return;
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
    observability.recordError('database', e, { operation: 'list_markets' });
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
    observability.recordError('database', e, { operation: 'market_charts' });
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
    observability.recordError('database', e, { operation: 'property_chart' });
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
    observability.recordError('database', e, { operation: 'get_market' });
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/:id/history', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM trades WHERE market_id = ${req.params.id} ORDER BY created_at`;
    res.json(rows);
  } catch (e) {
    observability.recordError('database', e, { operation: 'market_history' });
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
    observability.recordError('database', e, { operation: 'start_simulations' });
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
    observability.increment('websocket.rejected_connections');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const roomCode = normalizeRoomCode(req.url.replace('/ws/', ''));
  if (!roomCode) {
    observability.increment('websocket.rejected_connections');
    ws.close(4000);
    return;
  }
  const room = rooms[roomCode];
  if (!room) {
    observability.increment('websocket.rejected_connections');
    ws.close(4004);
    return;
  }

  room.connections.push(ws);
  observability.increment('websocket.current_connections');
  observability.increment('websocket.total_connections');
  appendRoomEvent(room, EVENT_TYPES.RECONNECT, {
    source: 'websocket',
    connection_count: room.connections.length,
  });
  ws.on('close', () => {
    room.connections = room.connections.filter(c => c !== ws);
    observability.increment('websocket.current_connections', -1);
    observability.increment('websocket.total_disconnects');
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
  generateUserId,
  createUserToken,
  verifyUserToken,
  runAiBotTick,
  requireHostCapability,
  roomEventStore,
  roomEventLog: () => roomEventLog,
  roomPersistence: () => roomPersistence,
  observability,
  configureRoomPersistence,
  loadPersistedRooms,
  persistRooms,
  replayRoomEvents,
  createReplayIntegrityReport,
  createPublicVerificationArtifact,
  EVENT_TYPES,
  startSimulations,
};
