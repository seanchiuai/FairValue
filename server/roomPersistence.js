const fs = require('fs');
const path = require('path');

const SNAPSHOT_VERSION = 1;
const DEFAULT_POSTGRES_TABLE = 'fairvalue_room_snapshots';

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

function createJsonRoomPersistence({ filePath } = {}) {
  if (!filePath) return createDisabledRoomPersistence({ kind: 'json', reason: 'No room snapshot file configured' });

  const enabled = true;
  const resolvedPath = filePath ? path.resolve(filePath) : null;

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

    if (!parsed || typeof parsed !== 'object') return { version: SNAPSHOT_VERSION, rooms: {} };
    return {
      version: parsed.version || SNAPSHOT_VERSION,
      updated_at: parsed.updated_at,
      rooms: parsed.rooms && typeof parsed.rooms === 'object' ? cloneJson(parsed.rooms) : {},
    };
  }

  function save(snapshot) {
    if (!enabled) return;
    const payload = {
      version: SNAPSHOT_VERSION,
      updated_at: new Date().toISOString(),
      rooms: cloneJson(snapshot?.rooms || {}),
    };

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(tempPath, resolvedPath);
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

function createRoomPersistence({ mode = 'json', filePath, sql } = {}) {
  const normalizedMode = String(mode || 'json').trim().toLowerCase();
  if (['0', 'false', 'off', 'disabled', 'none'].includes(normalizedMode)) {
    return createDisabledRoomPersistence();
  }
  if (['postgres', 'neon', 'db', 'database'].includes(normalizedMode)) {
    return createPostgresRoomPersistence({ sql });
  }
  if (['json', 'file', 'local'].includes(normalizedMode)) {
    return createJsonRoomPersistence({ filePath });
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
