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
      if (Object.prototype.hasOwnProperty.call(body, 'ai_enabled') && typeof body.ai_enabled !== 'boolean') {
        return 'ai_enabled must be boolean when present';
      }
      return null;
    case EVENT_TYPES.SETTLEMENT_COMPLETED:
      if (!hasOutcome(body.winning_outcome)) return 'winning_outcome is required';
      if (!hasFiniteNumber(body.actual_price)) return 'actual_price is required';
      if (!isObject(body.settlement)) return 'settlement is required';
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
        state.phase = 'open';
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
        if (typeof payload.ai_enabled === 'boolean') state.ai_enabled = payload.ai_enabled;
        break;
      case EVENT_TYPES.SETTLEMENT_COMPLETED:
        state.settled = true;
        state.phase = 'settled';
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
  EVENT_TYPES,
  createInMemoryRoomEventStore,
  replayRoomEvents,
  roomEventToActivity,
  validateRoomEventPayload,
};
