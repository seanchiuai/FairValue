const fs = require('fs');
const path = require('path');

const SNAPSHOT_VERSION = 1;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createJsonRoomPersistence({ filePath } = {}) {
  const enabled = Boolean(filePath);
  const resolvedPath = filePath ? path.resolve(filePath) : null;

  function load() {
    if (!enabled) return { version: SNAPSHOT_VERSION, rooms: {} };
    if (!fs.existsSync(resolvedPath)) return { version: SNAPSHOT_VERSION, rooms: {} };

    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
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

  function clear() {
    if (!enabled || !fs.existsSync(resolvedPath)) return;
    fs.rmSync(resolvedPath, { force: true });
  }

  return {
    enabled,
    filePath: resolvedPath,
    load,
    save,
    clear,
  };
}

module.exports = {
  SNAPSHOT_VERSION,
  createJsonRoomPersistence,
};
