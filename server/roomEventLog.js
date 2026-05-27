const fs = require('fs');
const path = require('path');

const EVENT_LOG_SCHEMA_VERSION = 'fairvalue.roomEventLog.v1';
const DEFAULT_POSTGRES_EVENT_TABLE = 'fairvalue_room_events';
const EVENT_TYPES = Object.freeze({
  ROOM_CREATED: 'room_created',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  BET_PLACED: 'bet_placed',
  AI_TRADE: 'ai_trade',
  PHASE_CHANGED: 'phase_changed',
  SETTLEMENT_COMPLETED: 'settlement_completed',
  RECONNECT: 'reconnect',
  ERROR: 'error',
});

const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));
const ROOM_PHASE_LABELS = Object.freeze({
  open: 'Betting open',
  discussion: 'Discussion timer',
  locked: 'Betting locked',
  settled: 'Settled',
});
const VALID_ROOM_PHASE_STATUSES = new Set(Object.keys(ROOM_PHASE_LABELS));

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function hasOutcome(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'over' || normalized === 'under';
}

function createDefaultRoomPhase(overrides = {}) {
  const status = VALID_ROOM_PHASE_STATUSES.has(String(overrides.status || '').toLowerCase())
    ? String(overrides.status).toLowerCase()
    : 'open';
  const durationSeconds = Number(overrides.duration_seconds);
  const timerStartedAt = Number(overrides.timer_started_at);
  const timerEndsAt = Number(overrides.timer_ends_at);
  const updatedAt = Number(overrides.updated_at);

  return {
    status,
    label: typeof overrides.label === 'string' && overrides.label.trim()
      ? overrides.label.trim().slice(0, 80)
      : ROOM_PHASE_LABELS[status],
    betting_locked: typeof overrides.betting_locked === 'boolean'
      ? overrides.betting_locked
      : status === 'locked' || status === 'settled',
    duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : null,
    timer_started_at: Number.isFinite(timerStartedAt) && timerStartedAt > 0 ? timerStartedAt : null,
    timer_ends_at: Number.isFinite(timerEndsAt) && timerEndsAt > 0 ? timerEndsAt : null,
    updated_at: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : null,
  };
}

function normalizeRoomPhase(value) {
  if (typeof value === 'string') return createDefaultRoomPhase({ status: value });
  if (!isObject(value)) return createDefaultRoomPhase();
  return createDefaultRoomPhase(value);
}

function validateRoomEventPayload(type, payload = {}) {
  const body = isObject(payload) ? payload : {};

  switch (type) {
    case EVENT_TYPES.ROOM_CREATED:
      if (!isObject(body.house)) return 'house is required';
      if (!hasText(body.house.address)) return 'house.address is required';
      if (!hasFiniteNumber(body.house.asking_price)) return 'house.asking_price is required';
      if (!isObject(body.market)) return 'market is required';
      return null;
    case EVENT_TYPES.PLAYER_JOINED:
      if (!hasText(body.session_id || body.player?.session_id)) return 'session_id is required';
      if (!hasText(body.nickname || body.player?.nickname)) return 'nickname is required';
      if (!isObject(body.player)) return 'player is required';
      return null;
    case EVENT_TYPES.RECONNECT:
      if (!hasText(body.source) && !hasText(body.session_id || body.player?.session_id)) {
        return 'source or session_id is required';
      }
      return null;
    case EVENT_TYPES.PLAYER_LEFT:
      if (!hasText(body.source) && !hasText(body.session_id)) return 'source or session_id is required';
      return null;
    case EVENT_TYPES.BET_PLACED:
      if (!hasText(body.session_id || body.player?.session_id)) return 'session_id is required';
      if (!hasOutcome(body.outcome)) return 'outcome is required';
      if (!hasFiniteNumber(body.wager)) return 'wager is required';
      if (
        Object.prototype.hasOwnProperty.call(body, 'reason') &&
        body.reason !== null &&
        typeof body.reason !== 'string'
      ) {
        return 'reason must be text when present';
      }
      if (!isObject(body.market)) return 'market is required';
      if (!isObject(body.player)) return 'player is required';
      return null;
    case EVENT_TYPES.AI_TRADE:
      if (!hasOutcome(body.outcome)) return 'outcome is required';
      if (!hasFiniteNumber(body.wager)) return 'wager is required';
      if (!isObject(body.market)) return 'market is required';
      if (!isObject(body.trade)) return 'trade is required';
      return null;
    case EVENT_TYPES.PHASE_CHANGED:
      if (!hasText(body.phase)) return 'phase is required';
      if (Object.prototype.hasOwnProperty.call(body, 'room_phase') && !isObject(body.room_phase)) {
        return 'room_phase must be an object when present';
      }
      if (Object.prototype.hasOwnProperty.call(body, 'ai_enabled') && typeof body.ai_enabled !== 'boolean') {
        return 'ai_enabled must be boolean when present';
      }
      return null;
    case EVENT_TYPES.SETTLEMENT_COMPLETED:
      if (!hasOutcome(body.winning_outcome)) return 'winning_outcome is required';
      if (!hasFiniteNumber(body.actual_price)) return 'actual_price is required';
      if (!isObject(body.settlement)) return 'settlement is required';
      if (!isObject(body.evidence_packet || body.settlement?.evidence_packet)) return 'evidence_packet is required';
      return null;
    case EVENT_TYPES.ERROR:
      if (!hasText(body.action)) return 'action is required';
      if (!hasText(body.message)) return 'message is required';
      if (!hasFiniteNumber(body.status)) return 'status is required';
      return null;
    default:
      return null;
  }
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeEventRecord(event) {
  if (!isObject(event)) throw new Error('room event must be an object');
  if (!VALID_EVENT_TYPES.has(event.type)) throw new Error(`Unknown room event type: ${event.type}`);
  const roomCode = normalizeRoomCode(event.room_code);
  if (!roomCode) throw new Error('room event room_code is required');
  const sequence = Number(event.sequence);
  if (!Number.isInteger(sequence) || sequence <= 0) throw new Error('room event sequence must be a positive integer');

  const normalized = {
    id: typeof event.id === 'string' && event.id.trim()
      ? event.id.trim()
      : `${roomCode}-${String(sequence).padStart(8, '0')}`,
    room_code: roomCode,
    sequence,
    type: event.type,
    payload: isObject(event.payload) ? cloneJson(event.payload) : {},
    timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now() / 1000,
  };
  if (event.request_id) normalized.request_id = String(event.request_id);
  return normalized;
}

function parsePayloadJson(value) {
  if (!value) return {};
  if (typeof value === 'string') return JSON.parse(value);
  return cloneJson(value);
}

function timestampToSeconds(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime() / 1000;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value / 1000 : value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : Date.now() / 1000;
  }

  return Date.now() / 1000;
}

function createDisabledRoomEventLog({ kind = 'disabled', reason = 'Room event log persistence is disabled' } = {}) {
  return {
    enabled: false,
    kind,
    reason,
    filePath: null,
    append() {},
    load() {
      return [];
    },
    loadRoom() {
      return [];
    },
    clear() {},
  };
}

function dedupeAndSortEvents(events) {
  const seen = new Set();
  return events
    .map((event) => normalizeEventRecord(event))
    .filter((event) => {
      const key = event.id || `${event.room_code}:${event.sequence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.room_code.localeCompare(b.room_code) || a.sequence - b.sequence)
    .map((event) => cloneJson(event));
}

function createJsonRoomEventLog({ filePath } = {}) {
  if (!filePath) return createDisabledRoomEventLog({ kind: 'json', reason: 'No room event log file configured' });

  const resolvedPath = path.resolve(filePath);

  function quarantineCorruptEventLog(parseError) {
    const baseCorruptPath = `${resolvedPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let corruptPath = baseCorruptPath;
    let attempt = 0;

    while (fs.existsSync(corruptPath)) {
      attempt += 1;
      corruptPath = `${baseCorruptPath}-${attempt}`;
    }

    try {
      fs.renameSync(resolvedPath, corruptPath);
    } catch (quarantineError) {
      const error = new Error(`Room event log is corrupt and could not be quarantined: ${quarantineError.message}`);
      error.cause = parseError;
      throw error;
    }

    console.warn(`Recovered from corrupt room event log; quarantined ${resolvedPath} to ${corruptPath}`);
    return [];
  }

  function append(event) {
    const normalized = normalizeEventRecord(event);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.appendFileSync(resolvedPath, `${JSON.stringify({
      schema_version: EVENT_LOG_SCHEMA_VERSION,
      event: normalized,
    })}\n`);
  }

  function load({ roomCode } = {}) {
    if (!fs.existsSync(resolvedPath)) return [];
    const normalizedRoomCode = roomCode ? normalizeRoomCode(roomCode) : null;
    const lines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/).filter((line) => line.trim());
    const events = [];

    try {
      for (const line of lines) {
        const parsed = JSON.parse(line);
        const event = normalizeEventRecord(parsed.event || parsed);
        if (!normalizedRoomCode || event.room_code === normalizedRoomCode) events.push(event);
      }
    } catch (error) {
      return quarantineCorruptEventLog(error);
    }

    return dedupeAndSortEvents(events);
  }

  function loadRoom(roomCode) {
    return load({ roomCode });
  }

  function clear() {
    if (fs.existsSync(resolvedPath)) fs.rmSync(resolvedPath, { force: true });
  }

  return {
    kind: 'json',
    enabled: true,
    filePath: resolvedPath,
    append,
    load,
    loadRoom,
    clear,
  };
}

function createPostgresRoomEventLog({ sql } = {}) {
  if (!sql || sql.isConfigured === false) {
    return createDisabledRoomEventLog({
      kind: 'postgres-event-log',
      reason: 'DATABASE_URL is not configured',
    });
  }

  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await sql`
      CREATE TABLE IF NOT EXISTS fairvalue_room_events (
        event_id text PRIMARY KEY,
        room_code text NOT NULL,
        sequence integer NOT NULL CHECK (sequence > 0),
        type text NOT NULL,
        payload jsonb NOT NULL,
        request_id text,
        occurred_at timestamptz NOT NULL,
        schema_version text NOT NULL DEFAULT 'fairvalue.roomEventLog.v1',
        inserted_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (room_code, sequence)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS fairvalue_room_events_room_sequence_idx
      ON fairvalue_room_events (room_code, sequence)
    `;
    schemaReady = true;
  }

  function rowToEvent(row) {
    return normalizeEventRecord({
      id: row.event_id,
      room_code: row.room_code,
      sequence: row.sequence,
      type: row.type,
      payload: parsePayloadJson(row.payload),
      request_id: row.request_id,
      timestamp: timestampToSeconds(row.occurred_at),
    });
  }

  async function append(event) {
    const normalized = normalizeEventRecord(event);
    await ensureSchema();
    await sql`
      INSERT INTO fairvalue_room_events (
        event_id,
        room_code,
        sequence,
        type,
        payload,
        request_id,
        occurred_at,
        schema_version
      )
      VALUES (
        ${normalized.id},
        ${normalized.room_code},
        ${normalized.sequence},
        ${normalized.type},
        ${JSON.stringify(normalized.payload)}::jsonb,
        ${normalized.request_id || null},
        ${new Date(normalized.timestamp * 1000).toISOString()}::timestamptz,
        ${EVENT_LOG_SCHEMA_VERSION}
      )
    `;
  }

  async function load({ roomCode } = {}) {
    await ensureSchema();
    const normalizedRoomCode = roomCode ? normalizeRoomCode(roomCode) : null;
    const rows = normalizedRoomCode
      ? await sql`
        SELECT event_id, room_code, sequence, type, payload, request_id, occurred_at, schema_version
        FROM fairvalue_room_events
        WHERE room_code = ${normalizedRoomCode}
        ORDER BY sequence ASC
      `
      : await sql`
        SELECT event_id, room_code, sequence, type, payload, request_id, occurred_at, schema_version
        FROM fairvalue_room_events
        ORDER BY room_code ASC, sequence ASC
      `;

    return dedupeAndSortEvents((rows || []).map(rowToEvent));
  }

  function loadRoom(roomCode) {
    return load({ roomCode });
  }

  async function deleteRoom(roomCode) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) return;
    await ensureSchema();
    await sql`DELETE FROM fairvalue_room_events WHERE room_code = ${normalizedRoomCode}`;
  }

  async function clear() {
    await ensureSchema();
    await sql`DELETE FROM fairvalue_room_events`;
  }

  return {
    kind: 'postgres-event-log',
    enabled: true,
    tableName: DEFAULT_POSTGRES_EVENT_TABLE,
    filePath: null,
    append,
    load,
    loadRoom,
    deleteRoom,
    clear,
  };
}

function createInMemoryRoomEventStore() {
  const eventsByRoom = new Map();
  const cursorsByRoom = new Map();

  return {
    append({ roomCode, type, payload = {}, timestamp, requestId } = {}) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode) throw new Error('roomCode is required');
      if (!VALID_EVENT_TYPES.has(type)) throw new Error(`Unknown room event type: ${type}`);
      const payloadError = validateRoomEventPayload(type, payload);
      if (payloadError) throw new Error(`Invalid ${type} payload: ${payloadError}`);

      const nextSequence = (cursorsByRoom.get(normalizedRoomCode) || 0) + 1;
      cursorsByRoom.set(normalizedRoomCode, nextSequence);

      const event = {
        id: `${normalizedRoomCode}-${String(nextSequence).padStart(8, '0')}`,
        room_code: normalizedRoomCode,
        sequence: nextSequence,
        type,
        payload: cloneJson(payload),
        timestamp: timestamp || Date.now() / 1000,
      };
      if (requestId) event.request_id = requestId;

      const events = eventsByRoom.get(normalizedRoomCode) || [];
      events.push(event);
      eventsByRoom.set(normalizedRoomCode, events);

      return cloneJson(event);
    },

    list(roomCode, { afterSequence = 0 } = {}) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const events = eventsByRoom.get(normalizedRoomCode) || [];
      return events
        .filter((event) => event.sequence > afterSequence)
        .map((event) => cloneJson(event));
    },

    replace(roomCode, events = []) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode) throw new Error('roomCode is required');
      const normalizedEvents = events
        .map((event) => {
          if (!VALID_EVENT_TYPES.has(event.type)) {
            throw new Error(`Unknown room event type: ${event.type}`);
          }
          return {
            ...cloneJson(event),
            room_code: normalizedRoomCode,
            sequence: Number(event.sequence),
          };
        })
        .filter((event) => Number.isInteger(event.sequence) && event.sequence > 0)
        .sort((a, b) => a.sequence - b.sequence);

      eventsByRoom.set(normalizedRoomCode, normalizedEvents);
      cursorsByRoom.set(
        normalizedRoomCode,
        normalizedEvents.reduce((max, event) => Math.max(max, event.sequence), 0)
      );
    },

    clear(roomCode) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      eventsByRoom.delete(normalizedRoomCode);
      cursorsByRoom.delete(normalizedRoomCode);
    },

    clearAll() {
      eventsByRoom.clear();
      cursorsByRoom.clear();
    },
  };
}

function roomEventToActivity(event) {
  const payload = event.payload || {};
  switch (event.type) {
    case EVENT_TYPES.PLAYER_JOINED:
      return {
        type: 'join',
        nickname: payload.nickname || payload.player?.nickname,
        timestamp: event.timestamp,
        event_sequence: event.sequence,
      };
    case EVENT_TYPES.BET_PLACED:
      return {
        type: 'bet',
        nickname: payload.nickname || payload.player?.nickname,
        outcome: payload.outcome,
        wager: payload.wager,
        reason: typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : null,
        timestamp: event.timestamp,
        event_sequence: event.sequence,
      };
    case EVENT_TYPES.AI_TRADE:
      return {
        type: 'ai_trade',
        outcome: payload.outcome,
        wager: payload.wager,
        timestamp: event.timestamp,
        event_sequence: event.sequence,
      };
    case EVENT_TYPES.SETTLEMENT_COMPLETED:
      return {
        type: 'settle',
        actual_price: payload.actual_price,
        winning_outcome: payload.winning_outcome,
        timestamp: event.timestamp,
        event_sequence: event.sequence,
      };
    case EVENT_TYPES.PHASE_CHANGED:
      if (!payload.room_phase) return null;
      return {
        type: 'phase',
        phase_status: payload.room_phase.status,
        phase_label: payload.room_phase.label,
        betting_locked: payload.room_phase.betting_locked,
        timer_ends_at: payload.room_phase.timer_ends_at,
        timestamp: event.timestamp,
        event_sequence: event.sequence,
      };
    default:
      return null;
  }
}

function createReplayState() {
  return {
    room_code: null,
    house: null,
    draft_audit: null,
    market: null,
    players: {},
    activity: [],
    ai_enabled: false,
    settled: false,
    settlement: null,
    phase: 'open',
    room_phase: createDefaultRoomPhase(),
    event_count: 0,
    last_sequence: 0,
  };
}

function replayRoomEvents(events) {
  const state = createReplayState();
  const orderedEvents = [...events].sort((a, b) => a.sequence - b.sequence);

  for (const event of orderedEvents) {
    const payload = event.payload || {};
    state.room_code = event.room_code;
    state.event_count += 1;
    state.last_sequence = event.sequence;

    const activity = roomEventToActivity(event);
    if (activity) state.activity.push(activity);

    switch (event.type) {
      case EVENT_TYPES.ROOM_CREATED:
        state.house = cloneJson(payload.house || state.house);
        state.draft_audit = cloneJson(payload.draft_audit || state.draft_audit);
        state.market = cloneJson(payload.market || state.market);
        state.room_phase = normalizeRoomPhase(payload.room_phase || state.room_phase);
        state.phase = state.room_phase.status;
        break;
      case EVENT_TYPES.PLAYER_JOINED:
      case EVENT_TYPES.RECONNECT:
        if (payload.player?.session_id) {
          state.players[payload.player.session_id] = cloneJson(payload.player);
        }
        break;
      case EVENT_TYPES.PLAYER_LEFT:
        if (payload.session_id && state.players[payload.session_id]) {
          state.players[payload.session_id] = {
            ...state.players[payload.session_id],
            connected: false,
          };
        }
        break;
      case EVENT_TYPES.BET_PLACED:
        if (payload.market) state.market = cloneJson(payload.market);
        if (payload.player?.session_id) {
          state.players[payload.player.session_id] = cloneJson(payload.player);
        }
        break;
      case EVENT_TYPES.AI_TRADE:
        if (payload.market) state.market = cloneJson(payload.market);
        break;
      case EVENT_TYPES.PHASE_CHANGED:
        state.phase = payload.phase || state.phase;
        if (payload.room_phase) state.room_phase = normalizeRoomPhase(payload.room_phase);
        if (typeof payload.ai_enabled === 'boolean') state.ai_enabled = payload.ai_enabled;
        break;
      case EVENT_TYPES.SETTLEMENT_COMPLETED:
        state.settled = true;
        state.phase = 'settled';
        state.room_phase = normalizeRoomPhase(payload.room_phase || {
          status: 'settled',
          label: 'Settled',
          betting_locked: true,
          updated_at: event.timestamp,
        });
        state.ai_enabled = false;
        state.settlement = cloneJson(payload.settlement || {
          winning_outcome: payload.winning_outcome,
          actual_price: payload.actual_price,
          results: payload.results || [],
        });
        for (const player of payload.players || []) {
          if (player.session_id) state.players[player.session_id] = cloneJson(player);
        }
        break;
      default:
        break;
    }
  }

  return state;
}

module.exports = {
  DEFAULT_POSTGRES_EVENT_TABLE,
  EVENT_LOG_SCHEMA_VERSION,
  EVENT_TYPES,
  createDisabledRoomEventLog,
  createDefaultRoomPhase,
  createInMemoryRoomEventStore,
  createJsonRoomEventLog,
  createPostgresRoomEventLog,
  normalizeRoomPhase,
  replayRoomEvents,
  roomEventToActivity,
  validateRoomEventPayload,
};
