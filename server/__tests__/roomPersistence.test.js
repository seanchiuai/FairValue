const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SNAPSHOT_VERSION,
  createJsonRoomPersistence,
  createPostgresRoomPersistence,
  createRoomPersistence,
} = require('../roomPersistence');

function createFakeSql() {
  const rows = new Map();
  const calls = [];

  async function sql(strings, ...values) {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ query, values });

    if (query.startsWith('CREATE TABLE IF NOT EXISTS fairvalue_room_snapshots')) return [];
    if (query.startsWith('SELECT room_code, snapshot, updated_at FROM fairvalue_room_snapshots')) {
      return Array.from(rows.entries()).map(([room_code, row]) => ({
        room_code,
        snapshot: row.snapshot,
        updated_at: row.updated_at,
      }));
    }
    if (query.startsWith('SELECT snapshot FROM fairvalue_room_snapshots WHERE room_code')) {
      const row = rows.get(values[0]);
      return row ? [{ snapshot: row.snapshot }] : [];
    }
    if (query.startsWith('SELECT room_code FROM fairvalue_room_snapshots')) {
      return Array.from(rows.keys()).map((room_code) => ({ room_code }));
    }
    if (query.startsWith('INSERT INTO fairvalue_room_snapshots')) {
      rows.set(values[0], {
        snapshot: JSON.parse(values[1]),
        updated_at: new Date('2026-05-10T12:00:00.000Z'),
      });
      return [];
    }
    if (query.startsWith('DELETE FROM fairvalue_room_snapshots WHERE room_code')) {
      rows.delete(values[0]);
      return [];
    }
    if (query.startsWith('DELETE FROM fairvalue_room_snapshots')) {
      rows.clear();
      return [];
    }

    throw new Error(`Unexpected fake SQL query: ${query}`);
  }

  sql.isConfigured = true;
  sql.rows = rows;
  sql.calls = calls;
  return sql;
}

test('room persistence factory keeps JSON local as the default adapter', () => {
  const disabled = createRoomPersistence({ mode: 'json' });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.kind, 'json');
  assert.deepEqual(disabled.load(), { version: SNAPSHOT_VERSION, rooms: {} });

  const fileBacked = createRoomPersistence({ mode: 'json', filePath: '/tmp/fairvalue-test-rooms.json' });
  assert.equal(fileBacked.enabled, true);
  assert.equal(fileBacked.kind, 'json');
  assert.equal(fileBacked.filePath, '/tmp/fairvalue-test-rooms.json');

  const explicitOff = createRoomPersistence({ mode: 'off' });
  assert.equal(explicitOff.enabled, false);
});

test('postgres room persistence saves, loads, deletes stale rooms, and clears', async () => {
  const sql = createFakeSql();
  const persistence = createPostgresRoomPersistence({ sql });

  assert.equal(persistence.enabled, true);
  assert.equal(persistence.kind, 'postgres');

  await persistence.save({
    rooms: {
      AB12: { code: 'AB12', hostToken: 'host-1', events: [{ sequence: 1, type: 'room_created' }] },
      CD34: { code: 'CD34', hostToken: 'host-2', events: [] },
    },
  });

  let loaded = await persistence.load();
  assert.equal(loaded.version, SNAPSHOT_VERSION);
  assert.deepEqual(Object.keys(loaded.rooms).sort(), ['AB12', 'CD34']);
  assert.equal(loaded.rooms.AB12.hostToken, 'host-1');
  assert.equal(loaded.updated_at, '2026-05-10T12:00:00.000Z');

  await persistence.save({
    rooms: {
      AB12: { code: 'AB12', hostToken: 'host-1b', events: [{ sequence: 2, type: 'bet_placed' }] },
    },
  });

  loaded = await persistence.load();
  assert.deepEqual(Object.keys(loaded.rooms), ['AB12']);
  assert.equal(loaded.rooms.AB12.hostToken, 'host-1b');
  assert.equal(loaded.rooms.AB12.events[0].type, 'bet_placed');

  await persistence.clear();
  loaded = await persistence.load();
  assert.deepEqual(loaded.rooms, {});
  assert.equal(sql.calls.filter((call) => call.query.startsWith('CREATE TABLE')).length, 1);
});

test('postgres room persistence supports targeted room read, write, and delete', async () => {
  const sql = createFakeSql();
  const persistence = createPostgresRoomPersistence({ sql });

  await persistence.save({
    rooms: {
      KEEP: { code: 'KEEP', hostToken: 'keep-host', events: [] },
    },
  });

  await persistence.saveRoom('tmp1', {
    code: 'TMP1',
    hostToken: 'temp-host',
    events: [{ sequence: 1, type: 'room_created' }],
  });

  let loaded = await persistence.load();
  assert.deepEqual(Object.keys(loaded.rooms).sort(), ['KEEP', 'TMP1']);
  assert.equal(loaded.rooms.TMP1.hostToken, 'temp-host');

  const targeted = await persistence.loadRoom('TMP1');
  assert.equal(targeted.hostToken, 'temp-host');
  assert.equal(targeted.events[0].type, 'room_created');

  await persistence.deleteRoom('TMP1');
  loaded = await persistence.load();
  assert.deepEqual(Object.keys(loaded.rooms), ['KEEP']);
  assert.equal(loaded.rooms.KEEP.hostToken, 'keep-host');
  assert.equal(await persistence.loadRoom('TMP1'), null);
});

test('postgres room persistence disables cleanly when the database is unavailable', async () => {
  const persistence = createPostgresRoomPersistence({
    sql: Object.assign(async () => [], { isConfigured: false }),
  });

  assert.equal(persistence.enabled, false);
  assert.equal(persistence.kind, 'postgres');
  assert.deepEqual(await persistence.load(), { version: SNAPSHOT_VERSION, rooms: {} });
});

test('json room persistence can still be created directly for local snapshots', () => {
  const persistence = createJsonRoomPersistence({ filePath: '/tmp/fairvalue-direct-json.json' });
  assert.equal(persistence.enabled, true);
  assert.equal(persistence.kind, 'json');
  assert.equal(persistence.filePath, '/tmp/fairvalue-direct-json.json');
});

test('json room persistence supports targeted room read, write, and delete', () => {
  const filePath = `/tmp/fairvalue-json-targeted-${process.pid}-${Date.now()}.json`;
  const persistence = createJsonRoomPersistence({ filePath });

  persistence.save({ rooms: { KEEP: { code: 'KEEP', hostToken: 'keep-host' } } });
  persistence.saveRoom('tmp2', { code: 'TMP2', hostToken: 'temp-host' });

  assert.equal(persistence.loadRoom('TMP2').hostToken, 'temp-host');
  assert.deepEqual(Object.keys(persistence.load().rooms).sort(), ['KEEP', 'TMP2']);

  persistence.deleteRoom('TMP2');
  assert.equal(persistence.loadRoom('TMP2'), null);
  assert.deepEqual(Object.keys(persistence.load().rooms), ['KEEP']);

  persistence.clear();
});

test('json room persistence quarantines malformed snapshots and can save again', () => {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fairvalue-corrupt-room-'));
  const filePath = path.join(dirPath, 'rooms.json');
  const malformedSnapshot = '{"version":1,"rooms":';
  fs.writeFileSync(filePath, malformedSnapshot);

  try {
    const persistence = createJsonRoomPersistence({ filePath });
    const loaded = persistence.load();

    assert.equal(loaded.version, SNAPSHOT_VERSION);
    assert.equal(loaded.recovered_from_corruption, true);
    assert.deepEqual(loaded.rooms, {});
    assert.equal(fs.existsSync(filePath), false);

    const quarantinedFiles = fs.readdirSync(dirPath).filter((name) => name.startsWith('rooms.json.corrupt-'));
    assert.equal(quarantinedFiles.length, 1);
    assert.equal(fs.readFileSync(path.join(dirPath, quarantinedFiles[0]), 'utf8'), malformedSnapshot);

    persistence.saveRoom('SAFE', { code: 'SAFE', hostToken: 'safe-host' });
    assert.equal(persistence.loadRoom('SAFE').hostToken, 'safe-host');
  } finally {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
});
