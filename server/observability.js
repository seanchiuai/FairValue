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

function prometheusMetricName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_');
}

function prometheusLabelValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function line(name, value, labels = {}) {
  const labelEntries = Object.entries(labels).filter(([, labelValue]) => labelValue !== undefined && labelValue !== null);
  const labelText = labelEntries.length
    ? `{${labelEntries.map(([key, labelValue]) => `${prometheusMetricName(key)}="${prometheusLabelValue(labelValue)}"`).join(',')}}`
    : '';
  const numeric = Number(value);
  return `${prometheusMetricName(name)}${labelText} ${Number.isFinite(numeric) ? numeric : 0}`;
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

function prometheusMetrics({ rooms, roomPersistence, sql } = {}) {
  const metrics = snapshot({ rooms, roomPersistence, sql });
  const lines = [
    '# HELP fairvalue_up FairValue process health indicator.',
    '# TYPE fairvalue_up gauge',
    line('fairvalue_up', 1),
    '# HELP fairvalue_uptime_seconds Process uptime in seconds.',
    '# TYPE fairvalue_uptime_seconds gauge',
    line('fairvalue_uptime_seconds', metrics.uptime_seconds),
    '# HELP fairvalue_http_requests_total HTTP requests observed by status class.',
    '# TYPE fairvalue_http_requests_total counter',
  ];

  for (const [statusClass, count] of Object.entries(metrics.requests.by_status_class || {})) {
    lines.push(line('fairvalue_http_requests_total', count, { status_class: statusClass }));
  }

  lines.push(
    '# HELP fairvalue_http_request_latency_ms Request latency summary in milliseconds.',
    '# TYPE fairvalue_http_request_latency_ms gauge',
    line('fairvalue_http_request_latency_ms', metrics.requests.latency_ms.avg, { statistic: 'avg' }),
    line('fairvalue_http_request_latency_ms', metrics.requests.latency_ms.max, { statistic: 'max' }),
    '# HELP fairvalue_rooms Current aggregate room state.',
    '# TYPE fairvalue_rooms gauge',
    line('fairvalue_rooms', metrics.rooms.active_rooms, { state: 'active' }),
    line('fairvalue_rooms', metrics.rooms.settled_rooms, { state: 'settled' }),
    '# HELP fairvalue_room_players Current aggregate joined players across rooms.',
    '# TYPE fairvalue_room_players gauge',
    line('fairvalue_room_players', metrics.rooms.total_players),
    '# HELP fairvalue_room_connections Current aggregate room connection count.',
    '# TYPE fairvalue_room_connections gauge',
    line('fairvalue_room_connections', metrics.rooms.total_connections),
    '# HELP fairvalue_room_lifecycle_total Room lifecycle events observed by this process.',
    '# TYPE fairvalue_room_lifecycle_total counter',
  );

  for (const [event, count] of Object.entries(metrics.room_lifecycle || {})) {
    lines.push(line('fairvalue_room_lifecycle_total', count, { event }));
  }

  lines.push(
    '# HELP fairvalue_websocket_connections Current websocket connections.',
    '# TYPE fairvalue_websocket_connections gauge',
    line('fairvalue_websocket_connections', metrics.websocket.current_connections),
    '# HELP fairvalue_websocket_events_total Websocket events observed by this process.',
    '# TYPE fairvalue_websocket_events_total counter',
    line('fairvalue_websocket_events_total', metrics.websocket.total_connections, { event: 'connect' }),
    line('fairvalue_websocket_events_total', metrics.websocket.total_disconnects, { event: 'disconnect' }),
    line('fairvalue_websocket_events_total', metrics.websocket.rejected_connections, { event: 'rejected' }),
    line('fairvalue_websocket_events_total', metrics.websocket.broadcasts, { event: 'broadcast' }),
    line('fairvalue_websocket_events_total', metrics.websocket.broadcast_recipients, { event: 'broadcast_recipient' }),
    '# HELP fairvalue_rate_limit_rejections_total Rate-limited requests.',
    '# TYPE fairvalue_rate_limit_rejections_total counter',
    line('fairvalue_rate_limit_rejections_total', metrics.rate_limits.rejected),
    '# HELP fairvalue_database_configured Whether DATABASE_URL is configured.',
    '# TYPE fairvalue_database_configured gauge',
    line('fairvalue_database_configured', metrics.database.configured ? 1 : 0),
    '# HELP fairvalue_database_errors_total Database errors observed by this process.',
    '# TYPE fairvalue_database_errors_total counter',
    line('fairvalue_database_errors_total', metrics.database.errors),
    '# HELP fairvalue_room_persistence_enabled Whether room persistence is enabled.',
    '# TYPE fairvalue_room_persistence_enabled gauge',
    line('fairvalue_room_persistence_enabled', metrics.persistence.enabled ? 1 : 0, { kind: metrics.persistence.kind }),
    '# HELP fairvalue_room_persistence_failures_total Room persistence failures observed by this process.',
    '# TYPE fairvalue_room_persistence_failures_total counter',
    line('fairvalue_room_persistence_failures_total', metrics.persistence.failures, { kind: metrics.persistence.kind }),
    '# HELP fairvalue_ai_events_total AI degraded responses and integration errors.',
    '# TYPE fairvalue_ai_events_total counter',
    line('fairvalue_ai_events_total', metrics.ai.degraded_responses, { event: 'degraded_response' }),
    line('fairvalue_ai_events_total', metrics.ai.integration_errors, { event: 'integration_error' }),
  );

  return `${lines.join('\n')}\n`;
}

function resetObservability() {
  state = DEFAULT_STATE();
}

module.exports = {
  health,
  increment,
  observeRequest,
  prometheusMetrics,
  readiness,
  recordError,
  resetObservability,
  snapshot,
};
