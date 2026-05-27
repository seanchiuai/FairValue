const fs = require('fs');
const path = require('path');

const USER_PROFILE_SCHEMA_VERSION = 'fairvalue.userProfile.v1';
const WATCHLIST_SCHEMA_VERSION = 'fairvalue.userWatchlist.v1';
const PROPERTY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const MAX_NOTE_LENGTH = 240;

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
    for (const [propertyId, item] of Object.entries(user.watchlist || {})) {
      const normalized = normalizeWatchlistItem(item, propertyId);
      if (!normalized) continue;
      watchlist[normalized.property_id] = normalized;
    }
    users[userId] = { user_id: userId, watchlist };
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
      'Saved thresholds are not notification delivery guarantees yet.',
      'Property details are resolved from the current FairValue property snapshot, not a live provider feed.',
    ],
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
    const user = state.users[userId] || { user_id: userId, watchlist: {} };
    state.users[userId] = user;
    return user;
  }

  function getWatchlist(userId) {
    return projectWatchlist(ensureUser(userId));
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
    save();
    return { value: projectWatchlist(user) };
  }

  load();

  return {
    kind: filePath ? 'json-user-profile' : 'memory-user-profile',
    filePath,
    load,
    save,
    clear,
    getWatchlist,
    upsertWatchlistItem,
    removeWatchlistItem,
    rawState: () => cloneJson(state),
  };
}

module.exports = {
  USER_PROFILE_SCHEMA_VERSION,
  WATCHLIST_SCHEMA_VERSION,
  createUserProfileStore,
};
