const DEFAULT_STATE = () => ({
  startedAtMs: Date.now(),
  requests: {
    total: 0,
    by_status_class: {},
    by_status_code: {},
    by_method: {},
    by_route: {},
    latency_ms: {
      count: 0,
      total: 0,
      max: 0,
    },
  },
  room_lifecycle: {
    created: 0,
    joined: 0,
    reconnected: 0,
    bets: 0,
    settlements: 0,
    ai_trades: 0,
    room_errors: 0,
    durability_failures: 0,
  },
  websocket: {
    current_connections: 0,
    total_connections: 0,
    total_disconnects: 0,
    rejected_connections: 0,
    broadcasts: 0,
    broadcast_recipients: 0,
  },
  rate_limits: {
    rejected: 0,
  },
  persistence: {
    failures: 0,
    last_failure: null,
  },
  database: {
    errors: 0,
    last_error: null,
  },
  ai: {
    degraded_responses: 0,
    integration_errors: 0,
  },
});

let state = DEFAULT_STATE();

function increment(target, amount = 1) {
  const parts = target.split('.');
  let cursor = state;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part]) cursor[part] = {};
    cursor = cursor[part];
  }

  const leaf = parts[parts.length - 1];
  cursor[leaf] = Math.max(0, Number(cursor[leaf] || 0) + amount);
}

function routeKeyFromRequest(req) {
  if (req.baseUrl || req.route?.path) return `${req.baseUrl || ''}${req.route?.path || ''}` || 'unknown';
  const path = String(req.originalUrl || req.url || 'unknown').split('?')[0];
  return path
    .replace(/\/api\/rooms\/[A-Z0-9]{4}(?=\/|$)/gi, '/api/rooms/:code')
    .replace(/\/api\/markets\/by-property\/[^/]+\/chart(?=\/|$)/gi, '/api/markets/by-property/:propertyId/chart')
    .replace(/\/api\/markets\/[^/]+\/history(?=\/|$)/gi, '/api/markets/:id/history')
    .replace(/\/api\/markets\/[^/]+(?=\/|$)/gi, '/api/markets/:id')
    .replace(/\/ws\/[A-Z0-9]{4}(?=\/|$)/gi, '/ws/:code');
}

function observeRequest(req, res, durationMs) {
  const statusCode = Number(res.statusCode || 0);
  const statusClass = statusCode ? `${Math.floor(statusCode / 100)}xx` : 'unknown';
  const method = String(req.method || 'UNKNOWN').toUpperCase();
  const routeKey = routeKeyFromRequest(req);

  state.requests.total += 1;
  increment(`requests.by_status_class.${statusClass}`);
  increment(`requests.by_status_code.${statusCode || 'unknown'}`);
  increment(`requests.by_method.${method}`);
  increment(`requests.by_route.${routeKey}`);
  state.requests.latency_ms.count += 1;
  state.requests.latency_ms.total += durationMs;
  state.requests.latency_ms.max = Math.max(state.requests.latency_ms.max, durationMs);
}

function recordError(bucket, error, extra = {}) {
  const message = error?.message || String(error || 'Unknown error');
  const entry = {
    message,
    at: new Date().toISOString(),
    ...extra,
  };

  if (bucket === 'persistence') {
    state.persistence.last_failure = entry;
    return;
  }

  if (!state[bucket]) state[bucket] = { errors: 0, last_error: null };
  if (typeof state[bucket].errors === 'number') state[bucket].errors += 1;
  state[bucket].last_error = entry;
}

function roomSummary(rooms) {
  const list = Object.values(rooms || {});
  return {
    active_rooms: list.length,
    settled_rooms: list.filter((room) => room?.settled).length,
    active_ai_rooms: list.filter((room) => room?.aiEnabled).length,
    total_players: list.reduce((sum, room) => sum + Object.keys(room?.players || {}).length, 0),
    total_connections: list.reduce((sum, room) => sum + (room?.connections || []).length, 0),
    durability_error_rooms: list.filter((room) => room?.durabilityError).length,
  };
}

function persistenceSummary(roomPersistence) {
  return {
    enabled: Boolean(roomPersistence?.enabled),
    kind: roomPersistence?.kind || 'unknown',
    table: roomPersistence?.tableName || null,
    retention_days: roomPersistence?.retentionDays ?? null,
    reason: roomPersistence?.enabled ? null : roomPersistence?.reason || null,
  };
}

function databaseSummary(sql) {
  return {
    configured: sql?.isConfigured !== false,
  };
}

function latencySummary() {
  const latency = state.requests.latency_ms;
  return {
    count: latency.count,
    avg: latency.count ? Math.round((latency.total / latency.count) * 100) / 100 : 0,
    max: latency.max,
  };
}

function snapshot({ rooms, roomPersistence, sql } = {}) {
  return {
    service: 'fairvalue',
    started_at: new Date(state.startedAtMs).toISOString(),
    uptime_seconds: Math.round((Date.now() - state.startedAtMs) / 1000),
    requests: {
      ...state.requests,
      latency_ms: latencySummary(),
    },
    room_lifecycle: { ...state.room_lifecycle },
    rooms: roomSummary(rooms),
    websocket: { ...state.websocket },
    rate_limits: { ...state.rate_limits },
    persistence: {
      ...persistenceSummary(roomPersistence),
      failures: state.persistence.failures,
      last_failure: state.persistence.last_failure,
    },
    database: {
      ...databaseSummary(sql),
      errors: state.database.errors,
      last_error: state.database.last_error,
    },
    ai: { ...state.ai },
  };
}

function readiness({ roomPersistence, sql } = {}) {
  const postgresPersistenceRequired = roomPersistence?.kind === 'postgres';
  const databaseRequired = postgresPersistenceRequired ||
    ['1', 'true', 'yes', 'on'].includes(String(process.env.FAIRVALUE_REQUIRE_DATABASE_URL || '').toLowerCase());

  const checks = {
    process: {
      ok: true,
      uptime_seconds: Math.round((Date.now() - state.startedAtMs) / 1000),
    },
    database: {
      ok: !databaseRequired || sql?.isConfigured !== false,
      configured: sql?.isConfigured !== false,
      required: databaseRequired,
    },
    room_persistence: {
      ok: !postgresPersistenceRequired || Boolean(roomPersistence?.enabled),
      ...persistenceSummary(roomPersistence),
    },
  };

  const ready = Object.values(checks).every((check) => check.ok);
  return {
    service: 'fairvalue',
    ready,
    status: ready ? 'ready' : 'degraded',
    checks,
  };
}

function health() {
  return {
    service: 'fairvalue',
    status: 'ok',
    uptime_seconds: Math.round((Date.now() - state.startedAtMs) / 1000),
  };
}

function resetObservability() {
  state = DEFAULT_STATE();
}

module.exports = {
  health,
  increment,
  observeRequest,
  readiness,
  recordError,
  resetObservability,
  snapshot,
};
