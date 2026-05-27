const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_PROFILE_SCHEMA_VERSION = 'fairvalue.userProfile.v1';
const WATCHLIST_SCHEMA_VERSION = 'fairvalue.userWatchlist.v1';
const ALERTS_SCHEMA_VERSION = 'fairvalue.userWatchlistAlerts.v1';
const PROPERTY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const ALERT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const MAX_NOTE_LENGTH = 240;
const ALERT_TYPES = new Set(['price_below', 'price_above']);
const ALERT_STATUSES = new Set(['ready', 'acknowledged']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return {
    schema_version: USER_PROFILE_SCHEMA_VERSION,
    users: {},
  };
}

function sanitizePropertyId(value) {
  const propertyId = typeof value === 'string' ? value.trim() : '';
  return PROPERTY_ID_PATTERN.test(propertyId) ? propertyId : null;
}

function sanitizeNote(value) {
  if (typeof value !== 'string') return null;
  const note = value.trim().replace(/<[^>]*>/g, '').slice(0, MAX_NOTE_LENGTH);
  return note || null;
}

function sanitizeAlert(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100_000_000) return null;
  return Math.round(number * 100) / 100;
}

function sanitizeAlertId(value) {
  const alertId = typeof value === 'string' ? value.trim() : '';
  return ALERT_ID_PATTERN.test(alertId) ? alertId : null;
}

function sanitizeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function createAlertId(dedupeKey) {
  const digest = crypto.createHash('sha256').update(String(dedupeKey)).digest('hex').slice(0, 24);
  return `alrt_${digest}`;
}

function formatMoney(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function normalizeAlertProperty(raw, fallbackPropertyId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const propertyId = sanitizePropertyId(raw.property_id || fallbackPropertyId);
  if (!propertyId) return null;
  return {
    property_id: propertyId,
    address: typeof raw.address === 'string' ? raw.address.trim().slice(0, 160) : '',
    city: typeof raw.city === 'string' ? raw.city.trim().slice(0, 80) : '',
    state: typeof raw.state === 'string' ? raw.state.trim().slice(0, 24) : '',
    zip_code: typeof raw.zip_code === 'string' ? raw.zip_code.trim().slice(0, 24) : '',
    provider_source: typeof raw.provider_source === 'string' ? raw.provider_source.trim().slice(0, 120) : 'FairValue property snapshot',
    observed_at: typeof raw.observed_at === 'string' && raw.observed_at.trim() ? raw.observed_at.trim().slice(0, 80) : null,
  };
}

function normalizeWatchlistAlert(raw, fallbackAlertId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const alertId = sanitizeAlertId(raw.alert_id || fallbackAlertId);
  const propertyId = sanitizePropertyId(raw.property_id);
  const alertType = ALERT_TYPES.has(raw.alert_type) ? raw.alert_type : null;
  const threshold = sanitizeAlert(raw.threshold);
  const currentPrice = sanitizeAlert(raw.current_price);
  if (!alertId || !propertyId || !alertType || threshold == null || currentPrice == null) return null;
  const status = ALERT_STATUSES.has(raw.status) ? raw.status : 'ready';
  const dedupeKey = typeof raw.dedupe_key === 'string' && raw.dedupe_key.trim()
    ? raw.dedupe_key.trim().slice(0, 320)
    : `${propertyId}:${alertType}:${threshold}:${currentPrice}`;
  return {
    alert_id: alertId,
    dedupe_key: dedupeKey,
    alert_type: alertType,
    property_id: propertyId,
    threshold,
    current_price: currentPrice,
    triggered_at: sanitizeTimestamp(raw.triggered_at) || Math.floor(Date.now() / 1000),
    status,
    acknowledged_at: status === 'acknowledged' ? sanitizeTimestamp(raw.acknowledged_at) : null,
    delivery_channel: 'in_app_profile',
    property: normalizeAlertProperty(raw.property, propertyId),
    message: typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim().slice(0, 240) : null,
  };
}

function publicAlert(alert) {
  const projected = cloneJson(alert);
  delete projected.dedupe_key;
  return projected;
}

function normalizeWatchlistItem(raw, fallbackPropertyId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const propertyId = sanitizePropertyId(raw.property_id || fallbackPropertyId);
  if (!propertyId) return null;
  const addedAt = Number(raw.added_at);
  return {
    property_id: propertyId,
    added_at: Number.isFinite(addedAt) && addedAt > 0 ? Math.floor(addedAt) : Math.floor(Date.now() / 1000),
    note: sanitizeNote(raw.note),
    alert_below: sanitizeAlert(raw.alert_below),
    alert_above: sanitizeAlert(raw.alert_above),
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const users = {};
  for (const [userId, user] of Object.entries(state.users || {})) {
    if (!userId || !user || typeof user !== 'object') continue;
    const watchlist = {};
    const alerts = {};
    for (const [propertyId, item] of Object.entries(user.watchlist || {})) {
      const normalized = normalizeWatchlistItem(item, propertyId);
      if (!normalized) continue;
      watchlist[normalized.property_id] = normalized;
    }
    for (const [alertId, alert] of Object.entries(user.alerts || {})) {
      const normalized = normalizeWatchlistAlert(alert, alertId);
      if (!normalized) continue;
      alerts[normalized.alert_id] = normalized;
    }
    users[userId] = { user_id: userId, watchlist, alerts };
  }
  return {
    schema_version: USER_PROFILE_SCHEMA_VERSION,
    users,
  };
}

function projectWatchlist(user) {
  const items = Object.values(user?.watchlist || {})
    .map((item) => cloneJson(item))
    .sort((left, right) => right.added_at - left.added_at || left.property_id.localeCompare(right.property_id));
  return {
    schema_version: WATCHLIST_SCHEMA_VERSION,
    user_id: user?.user_id || null,
    watchlist: items,
    limitations: [
      'Watchlist items, notes, and thresholds are private signed-user profile state.',
      'Saved thresholds are evaluated into an in-app alert queue only; email, push, and SMS delivery are not enabled.',
      'Property details are resolved from the current FairValue property snapshot, not a live provider feed.',
    ],
  };
}

function projectAlerts(user) {
  const alerts = Object.values(user?.alerts || {})
    .map(publicAlert)
    .sort((left, right) => right.triggered_at - left.triggered_at || left.alert_id.localeCompare(right.alert_id));
  const deliveryQueue = alerts
    .filter((alert) => alert.status === 'ready')
    .map((alert) => ({
      alert_id: alert.alert_id,
      property_id: alert.property_id,
      alert_type: alert.alert_type,
      channel: alert.delivery_channel,
      queued_at: alert.triggered_at,
      status: alert.status,
    }));
  return {
    schema_version: ALERTS_SCHEMA_VERSION,
    user_id: user?.user_id || null,
    alerts,
    delivery_queue: deliveryQueue,
    limitations: [
      'Alerts are private signed-user profile state.',
      'The delivery queue is in-app only and does not send email, SMS, push, or broker notifications.',
      'Thresholds are evaluated against the current static FairValue property snapshot, not a live provider feed.',
    ],
  };
}

function buildAlert({ item, property, alertType, threshold, currentPrice, nowSeconds }) {
  const propertySnapshot = normalizeAlertProperty({
    property_id: item.property_id,
    address: property.address,
    city: property.city,
    state: property.state,
    zip_code: property.zip_code,
    provider_source: property.provider_source,
    observed_at: property.observed_at,
  }, item.property_id);
  const dedupeKey = [
    item.property_id,
    alertType,
    threshold,
    currentPrice,
    propertySnapshot?.observed_at || 'snapshot',
  ].join('|');
  const propertyLabel = propertySnapshot?.address || `Property ${item.property_id}`;
  const direction = alertType === 'price_below' ? 'at or below' : 'at or above';
  return {
    alert_id: createAlertId(dedupeKey),
    dedupe_key: dedupeKey,
    alert_type: alertType,
    property_id: item.property_id,
    threshold,
    current_price: currentPrice,
    triggered_at: nowSeconds,
    status: 'ready',
    acknowledged_at: null,
    delivery_channel: 'in_app_profile',
    property: propertySnapshot,
    message: `${propertyLabel} is ${direction} ${formatMoney(threshold)} in the current snapshot (${formatMoney(currentPrice)}).`,
  };
}

function createUserProfileStore({ filePath = null } = {}) {
  let state = emptyState();

  function load() {
    if (!filePath) return state;
    try {
      if (!fs.existsSync(filePath)) {
        state = emptyState();
        return state;
      }
      state = normalizeState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      state = emptyState();
    }
    return state;
  }

  function save() {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
  }

  function clear() {
    state = emptyState();
    if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }

  function ensureUser(userId) {
    const user = state.users[userId] || { user_id: userId, watchlist: {}, alerts: {} };
    if (!user.alerts) user.alerts = {};
    state.users[userId] = user;
    return user;
  }

  function getWatchlist(userId) {
    return projectWatchlist(ensureUser(userId));
  }

  function getAlerts(userId) {
    return projectAlerts(ensureUser(userId));
  }

  function upsertWatchlistItem(userId, propertyId, patch = {}) {
    const normalizedPropertyId = sanitizePropertyId(propertyId);
    if (!normalizedPropertyId) return { error: 'Property ID is invalid' };
    const user = ensureUser(userId);
    const existing = user.watchlist[normalizedPropertyId];
    const next = normalizeWatchlistItem({
      property_id: normalizedPropertyId,
      added_at: existing?.added_at || patch.added_at,
      note: Object.prototype.hasOwnProperty.call(patch, 'note') ? patch.note : existing?.note,
      alert_below: Object.prototype.hasOwnProperty.call(patch, 'alert_below') ? patch.alert_below : existing?.alert_below,
      alert_above: Object.prototype.hasOwnProperty.call(patch, 'alert_above') ? patch.alert_above : existing?.alert_above,
    });
    user.watchlist[normalizedPropertyId] = next;
    save();
    return { value: projectWatchlist(user) };
  }

  function removeWatchlistItem(userId, propertyId) {
    const normalizedPropertyId = sanitizePropertyId(propertyId);
    if (!normalizedPropertyId) return { error: 'Property ID is invalid' };
    const user = ensureUser(userId);
    delete user.watchlist[normalizedPropertyId];
    for (const [alertId, alert] of Object.entries(user.alerts || {})) {
      if (alert.property_id === normalizedPropertyId) delete user.alerts[alertId];
    }
    save();
    return { value: projectWatchlist(user) };
  }

  function evaluateWatchlistAlerts(userId, { getProperty, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
    const user = ensureUser(userId);
    if (typeof getProperty !== 'function') return { error: 'Property snapshot resolver is unavailable' };
    for (const item of Object.values(user.watchlist || {})) {
      const property = getProperty(item.property_id);
      const currentPrice = sanitizeAlert(property?.price);
      if (!property || currentPrice == null) continue;
      const checks = [
        ['price_below', item.alert_below, currentPrice <= item.alert_below],
        ['price_above', item.alert_above, currentPrice >= item.alert_above],
      ];
      for (const [alertType, threshold, triggered] of checks) {
        if (threshold == null || !triggered) continue;
        const alert = buildAlert({ item, property, alertType, threshold, currentPrice, nowSeconds });
        if (!user.alerts[alert.alert_id]) user.alerts[alert.alert_id] = alert;
      }
    }
    save();
    return { value: projectAlerts(user) };
  }

  function acknowledgeWatchlistAlert(userId, alertId, nowSeconds = Math.floor(Date.now() / 1000)) {
    const normalizedAlertId = sanitizeAlertId(alertId);
    if (!normalizedAlertId) return { error: 'Alert ID is invalid', statusCode: 400 };
    const user = ensureUser(userId);
    const alert = user.alerts[normalizedAlertId];
    if (!alert) return { error: 'Alert not found', statusCode: 404 };
    alert.status = 'acknowledged';
    alert.acknowledged_at = nowSeconds;
    save();
    return { value: projectAlerts(user) };
  }

  load();

  return {
    kind: filePath ? 'json-user-profile' : 'memory-user-profile',
    filePath,
    load,
    save,
    clear,
    getWatchlist,
    getAlerts,
    upsertWatchlistItem,
    removeWatchlistItem,
    evaluateWatchlistAlerts,
    acknowledgeWatchlistAlert,
    rawState: () => cloneJson(state),
  };
}

module.exports = {
  USER_PROFILE_SCHEMA_VERSION,
  WATCHLIST_SCHEMA_VERSION,
  ALERTS_SCHEMA_VERSION,
  createUserProfileStore,
};
