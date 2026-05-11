const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT_VERSION = 1;
const DEFAULT_POSTGRES_TABLE = 'fairvalue_room_snapshots';
const ENCRYPTED_SNAPSHOT_FORMAT = 'fairvalue.roomSnapshot.encrypted.v1';
const DEFAULT_LOCAL_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDisabledRoomPersistence({ kind = 'disabled', reason = 'Room persistence is disabled' } = {}) {
  return {
    enabled: false,
    kind,
    reason,
    filePath: null,
    load() {
      return { version: SNAPSHOT_VERSION, rooms: {} };
    },
    loadRoom() {
      return null;
    },
    save() {},
    saveRoom() {},
    deleteRoom() {},
    clear() {},
  };
}

function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error(`Invalid room code for persistence: ${value}`);
  return code;
}

function resolveRetentionMs(value) {
  const rawValue = value === undefined || value === null || value === '' ? DEFAULT_LOCAL_RETENTION_DAYS : value;
  const normalized = String(rawValue).trim().toLowerCase();
  if (['0', 'false', 'off', 'disabled', 'none'].includes(normalized)) return 0;

  const days = Number(normalized);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(`Invalid room snapshot retention days: ${value}`);
  }
  return days * DAY_MS;
}

function timestampToMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function createJsonRoomPersistence({ filePath, encryptionSecret, retentionDays = DEFAULT_LOCAL_RETENTION_DAYS } = {}) {
  if (!filePath) return createDisabledRoomPersistence({ kind: 'json', reason: 'No room snapshot file configured' });

  const enabled = true;
  const resolvedPath = filePath ? path.resolve(filePath) : null;
  const snapshotSecret = typeof encryptionSecret === 'string' ? encryptionSecret.trim() : '';
  const retentionMs = resolveRetentionMs(retentionDays);

  function deriveEncryptionKey(salt) {
    return crypto.scryptSync(snapshotSecret, salt, 32);
  }

  function encryptSnapshotJson(snapshotJson) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = deriveEncryptionKey(salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(snapshotJson, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${JSON.stringify({
      format: ENCRYPTED_SNAPSHOT_FORMAT,
      version: 1,
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }, null, 2)}\n`;
  }

  function decryptSnapshotJson(envelope) {
    if (!snapshotSecret) {
      throw new Error('Room snapshot is encrypted but FAIRVALUE_ROOM_SNAPSHOT_SECRET is not configured');
    }

    try {
      const salt = Buffer.from(envelope.salt || '', 'base64');
      const iv = Buffer.from(envelope.iv || '', 'base64');
      const tag = Buffer.from(envelope.tag || '', 'base64');
      const ciphertext = Buffer.from(envelope.ciphertext || '', 'base64');
      const key = deriveEncryptionKey(salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
      throw new Error(`Encrypted room snapshot could not be decrypted: ${error.message}`);
    }
  }

  function isEncryptedSnapshot(parsed) {
    return parsed && typeof parsed === 'object' && parsed.format === ENCRYPTED_SNAPSHOT_FORMAT;
  }

  function normalizeLoadedSnapshot(parsed) {
    if (!parsed || typeof parsed !== 'object') return { version: SNAPSHOT_VERSION, rooms: {} };
    return {
      version: parsed.version || SNAPSHOT_VERSION,
      updated_at: parsed.updated_at,
      rooms: parsed.rooms && typeof parsed.rooms === 'object' ? cloneJson(parsed.rooms) : {},
    };
  }

  function roomLastActivityMs(roomSnapshot) {
    const timestamps = [];

    for (const event of roomSnapshot?.events || []) {
      const timestamp = timestampToMs(event?.timestamp);
      if (timestamp) timestamps.push(timestamp);
    }

    for (const activity of roomSnapshot?.activity || []) {
      const timestamp = timestampToMs(activity?.timestamp);
      if (timestamp) timestamps.push(timestamp);
    }

    return timestamps.length ? Math.max(...timestamps) : null;
  }

  function applyRetention(snapshot) {
    if (!retentionMs) return { snapshot, prunedRooms: [] };

    const cutoffMs = Date.now() - retentionMs;
    const rooms = {};
    const prunedRooms = [];

    for (const [code, roomSnapshot] of Object.entries(snapshot.rooms || {})) {
      if (!roomSnapshot?.settled) {
        rooms[code] = roomSnapshot;
        continue;
      }

      const lastActivityMs = roomLastActivityMs(roomSnapshot);
      if (lastActivityMs && lastActivityMs < cutoffMs) {
        prunedRooms.push(code);
      } else {
        rooms[code] = roomSnapshot;
      }
    }

    if (!prunedRooms.length) return { snapshot, prunedRooms };
    return { snapshot: { ...snapshot, rooms }, prunedRooms };
  }

  function writeSnapshotPayload(payload) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
    const snapshotJson = JSON.stringify(payload, null, 2);
    fs.writeFileSync(tempPath, snapshotSecret ? encryptSnapshotJson(snapshotJson) : `${snapshotJson}\n`);
    fs.renameSync(tempPath, resolvedPath);
  }

  function quarantineCorruptSnapshot(parseError) {
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
      const error = new Error(`Room snapshot is corrupt and could not be quarantined: ${quarantineError.message}`);
      error.cause = parseError;
      throw error;
    }

    console.warn(`Recovered from corrupt room snapshot; quarantined ${resolvedPath} to ${corruptPath}`);
    return {
      version: SNAPSHOT_VERSION,
      rooms: {},
      recovered_from_corruption: true,
      corrupt_path: corruptPath,
    };
  }

  function load() {
    if (!enabled) return { version: SNAPSHOT_VERSION, rooms: {} };
    if (!fs.existsSync(resolvedPath)) return { version: SNAPSHOT_VERSION, rooms: {} };

    const rawSnapshot = fs.readFileSync(resolvedPath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(rawSnapshot);
    } catch (error) {
      return quarantineCorruptSnapshot(error);
    }

    if (isEncryptedSnapshot(parsed)) parsed = JSON.parse(decryptSnapshotJson(parsed));

    const loadedSnapshot = normalizeLoadedSnapshot(parsed);
    const { snapshot, prunedRooms } = applyRetention(loadedSnapshot);
    if (prunedRooms.length) {
      console.warn(`Pruned ${prunedRooms.length} settled room snapshot(s) older than retention from ${resolvedPath}`);
      writeSnapshotPayload(snapshot);
    }
    return snapshot;
  }

  function save(snapshot) {
    if (!enabled) return;
    const payload = applyRetention({
      version: SNAPSHOT_VERSION,
      updated_at: new Date().toISOString(),
      rooms: cloneJson(snapshot?.rooms || {}),
    }).snapshot;

    writeSnapshotPayload(payload);
  }

  function loadRoom(roomCode) {
    const code = normalizeRoomCode(roomCode);
    const snapshot = load();
    return snapshot.rooms[code] ? cloneJson(snapshot.rooms[code]) : null;
  }

  function saveRoom(roomCode, roomSnapshot) {
    const code = normalizeRoomCode(roomCode);
    const snapshot = load();
    snapshot.rooms[code] = cloneJson(roomSnapshot);
    save(snapshot);
  }

  function deleteRoom(roomCode) {
    const code = normalizeRoomCode(roomCode);
    const snapshot = load();
    if (!snapshot.rooms[code]) return;
    delete snapshot.rooms[code];
    save(snapshot);
  }

  function clear() {
    if (!enabled || !fs.existsSync(resolvedPath)) return;
    fs.rmSync(resolvedPath, { force: true });
  }

  return {
    kind: 'json',
    enabled,
    filePath: resolvedPath,
    encrypted: Boolean(snapshotSecret),
    retentionDays: retentionMs ? retentionMs / DAY_MS : 0,
    load,
    loadRoom,
    save,
    saveRoom,
    deleteRoom,
    clear,
  };
}

function parseSnapshotJson(value) {
  if (!value) return {};
  if (typeof value === 'string') return JSON.parse(value);
  return cloneJson(value);
}

function createPostgresRoomPersistence({ sql } = {}) {
  if (!sql || sql.isConfigured === false) {
    return createDisabledRoomPersistence({
      kind: 'postgres',
      reason: 'DATABASE_URL is not configured',
    });
  }

  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await sql`
      CREATE TABLE IF NOT EXISTS fairvalue_room_snapshots (
        room_code text PRIMARY KEY,
        snapshot jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    schemaReady = true;
  }

  async function load() {
    await ensureSchema();
    const rows = await sql`
      SELECT room_code, snapshot, updated_at
      FROM fairvalue_room_snapshots
      ORDER BY room_code
    `;
    const rooms = {};
    let updatedAt = null;

    for (const row of rows || []) {
      const code = String(row.room_code || '').trim().toUpperCase();
      if (!code) continue;
      rooms[code] = parseSnapshotJson(row.snapshot);
      const rowUpdatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
      if (rowUpdatedAt && (!updatedAt || rowUpdatedAt > updatedAt)) updatedAt = rowUpdatedAt;
    }

    return { version: SNAPSHOT_VERSION, updated_at: updatedAt, rooms };
  }

  async function loadRoom(roomCode) {
    await ensureSchema();
    const code = normalizeRoomCode(roomCode);
    const rows = await sql`
      SELECT snapshot
      FROM fairvalue_room_snapshots
      WHERE room_code = ${code}
      LIMIT 1
    `;
    const row = rows?.[0];
    return row ? parseSnapshotJson(row.snapshot) : null;
  }

  async function saveRoom(roomCode, roomSnapshot) {
    await ensureSchema();
    const code = normalizeRoomCode(roomCode);
    await sql`
      INSERT INTO fairvalue_room_snapshots (room_code, snapshot, updated_at)
      VALUES (${code}, ${JSON.stringify(cloneJson(roomSnapshot))}::jsonb, now())
      ON CONFLICT (room_code) DO UPDATE
      SET snapshot = EXCLUDED.snapshot,
          updated_at = now()
    `;
  }

  async function deleteRoom(roomCode) {
    await ensureSchema();
    const code = normalizeRoomCode(roomCode);
    await sql`DELETE FROM fairvalue_room_snapshots WHERE room_code = ${code}`;
  }

  async function save(snapshot) {
    await ensureSchema();
    const rooms = cloneJson(snapshot?.rooms || {});
    const roomCodes = Object.keys(rooms);
    const existing = await sql`SELECT room_code FROM fairvalue_room_snapshots`;
    const nextCodes = new Set(roomCodes);

    for (const row of existing || []) {
      const roomCode = String(row.room_code || '').trim().toUpperCase();
      if (roomCode && !nextCodes.has(roomCode)) {
        await sql`DELETE FROM fairvalue_room_snapshots WHERE room_code = ${roomCode}`;
      }
    }

    for (const roomCode of roomCodes) {
      await saveRoom(roomCode, rooms[roomCode]);
    }
  }

  async function clear() {
    await ensureSchema();
    await sql`DELETE FROM fairvalue_room_snapshots`;
  }

  return {
    kind: 'postgres',
    enabled: true,
    tableName: DEFAULT_POSTGRES_TABLE,
    filePath: null,
    load,
    loadRoom,
    save,
    saveRoom,
    deleteRoom,
    clear,
  };
}

function createRoomPersistence({ mode = 'json', filePath, sql, encryptionSecret, retentionDays } = {}) {
  const normalizedMode = String(mode || 'json').trim().toLowerCase();
  if (['0', 'false', 'off', 'disabled', 'none'].includes(normalizedMode)) {
    return createDisabledRoomPersistence();
  }
  if (['postgres', 'neon', 'db', 'database'].includes(normalizedMode)) {
    return createPostgresRoomPersistence({ sql });
  }
  if (['json', 'file', 'local'].includes(normalizedMode)) {
    return createJsonRoomPersistence({ filePath, encryptionSecret, retentionDays });
  }
  throw new Error(`Unknown room persistence mode: ${mode}`);
}

module.exports = {
  SNAPSHOT_VERSION,
  DEFAULT_POSTGRES_TABLE,
  createDisabledRoomPersistence,
  createJsonRoomPersistence,
  createPostgresRoomPersistence,
  createRoomPersistence,
};
