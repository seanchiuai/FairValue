#!/usr/bin/env node
require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const postgres = require('postgres');
const { neon } = require('@neondatabase/serverless');
const { createPostgresRoomPersistence } = require('../server/roomPersistence');
const { createPostgresRoomEventLog, EVENT_TYPES } = require('../server/roomEventLog');

const LIVE_WRITE_FLAG = 'FAIRVALUE_LIVE_POSTGRES_SMOKE';
const REQUIRE_DATABASE_FLAG = 'FAIRVALUE_REQUIRE_DATABASE_URL';
const DRIVER_ENV = 'FAIRVALUE_LIVE_POSTGRES_DRIVER';
const POSTGRES_STORE_MODES = new Set(['postgres', 'neon', 'db', 'database']);
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return 'configured';
  }
}

function chooseDriver(databaseUrl) {
  const requested = String(process.env[DRIVER_ENV] || '').trim().toLowerCase();
  if (requested) return requested;

  try {
    const hostname = new URL(databaseUrl).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'postgres';
    if (hostname.endsWith('.neon.tech')) return 'neon';
  } catch {
    // Fall through to the app's production driver.
  }

  return 'neon';
}

function createSqlClient(databaseUrl) {
  const driver = chooseDriver(databaseUrl);
  if (driver === 'postgres') {
    const sql = postgres(databaseUrl, { max: 1 });
    return {
      driver,
      sql,
      close: () => sql.end({ timeout: 1 }),
    };
  }

  if (driver !== 'neon') {
    throw new Error(`Unsupported ${DRIVER_ENV}: ${driver}`);
  }

  return {
    driver,
    sql: neon(databaseUrl),
    close: async () => {},
  };
}

function makeSmokeRoomCode() {
  let code = 'FV';
  while (code.length < 4) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

async function pickUnusedSmokeRoomCode(persistence) {
  const override = String(process.env.FAIRVALUE_LIVE_SMOKE_ROOM_CODE || '').trim().toUpperCase();
  if (override) {
    if (!/^[A-Z0-9]{4}$/.test(override)) throw new Error('FAIRVALUE_LIVE_SMOKE_ROOM_CODE must be a 4-character A-Z0-9 room code');
    if (await persistence.loadRoom(override)) throw new Error(`Refusing to overwrite existing smoke room ${override}`);
    return override;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const roomCode = makeSmokeRoomCode();
    if (!(await persistence.loadRoom(roomCode))) return roomCode;
  }

  throw new Error('Could not find an unused FV-prefixed room code for the live smoke');
}

async function tablePresence(sql, tableName) {
  const rows = await sql`SELECT to_regclass(${`public.${tableName}`})::text AS table_name`;
  return Boolean(rows?.[0]?.table_name);
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  const roomStore = String(process.env.FAIRVALUE_ROOM_STORE || '').trim().toLowerCase();
  const databaseRequired = isEnabled(process.env[REQUIRE_DATABASE_FLAG]) || POSTGRES_STORE_MODES.has(roomStore);

  if (!databaseUrl) {
    const report = {
      ok: !databaseRequired,
      check: 'live-postgres-room-persistence',
      ready: false,
      skipped: true,
      reason: 'DATABASE_URL is not configured',
      roomStore: roomStore || 'default-json',
      required: databaseRequired,
      next: `Set DATABASE_URL and ${LIVE_WRITE_FLAG}=1 to run the non-destructive live write/read/delete smoke.`,
    };
    console.log(JSON.stringify(report, null, 2));
    if (databaseRequired) process.exit(1);
    return;
  }

  const { driver, sql, close } = createSqlClient(databaseUrl);
  const persistence = createPostgresRoomPersistence({ sql });
  const eventLog = createPostgresRoomEventLog({ sql });
  let smokeRoomCode = null;
  let cleanupAttempted = false;

  try {
    const connectivityRows = await sql`SELECT 1 AS ok`;
    assert.equal(Number(connectivityRows?.[0]?.ok), 1);
    assert.equal(persistence.enabled, true);

    const writeEnabled = isEnabled(process.env[LIVE_WRITE_FLAG]);
    const report = {
      ok: true,
      check: 'live-postgres-room-persistence',
      ready: true,
      driver,
      database: redactDatabaseUrl(databaseUrl),
      table: persistence.tableName,
      eventTable: eventLog.tableName,
      roomStore: roomStore || 'default-json',
      connected: true,
      tablesPresentBeforeWrite: {
        snapshots: await tablePresence(sql, persistence.tableName),
        events: await tablePresence(sql, eventLog.tableName),
      },
      writeSmoke: writeEnabled ? 'pending' : `skipped; set ${LIVE_WRITE_FLAG}=1 to write, read, and delete one FV-prefixed room row`,
    };

    if (!writeEnabled) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    smokeRoomCode = await pickUnusedSmokeRoomCode(persistence);
    const marker = `fairvalue-live-smoke-${process.pid}-${Date.now()}`;
    const hostTokenMarker = `${marker}-host-token`;
    const smokeSnapshot = {
      code: smokeRoomCode,
      hostToken: hostTokenMarker,
      hostUserId: null,
      house: {
        address: 'FairValue Live Persistence Smoke',
        asking_price: 1,
      },
      market: { total_trades: 0 },
      players: {},
      betReceipts: [],
      aiEnabled: false,
      settled: false,
      settlement: null,
      durabilityError: null,
      activity: [],
      marketId: null,
      events: [{ sequence: 1, type: 'room_created', smoke: true, marker }],
    };

    await persistence.saveRoom(smokeRoomCode, smokeSnapshot);
    await eventLog.append({
      id: `${smokeRoomCode}-00000001`,
      room_code: smokeRoomCode,
      sequence: 1,
      type: EVENT_TYPES.ROOM_CREATED,
      payload: {
        house: smokeSnapshot.house,
        market: smokeSnapshot.market,
        smoke: true,
        marker,
      },
      timestamp: Date.now() / 1000,
    });

    const loadedRoom = await persistence.loadRoom(smokeRoomCode);
    assert.equal(loadedRoom.hostToken, hostTokenMarker);
    assert.equal(loadedRoom.house.address, 'FairValue Live Persistence Smoke');
    assert.equal(loadedRoom.events[0].marker, marker);

    const loadedSnapshot = await persistence.load();
    assert.equal(loadedSnapshot.rooms[smokeRoomCode].hostToken, hostTokenMarker);
    const loadedEvents = await eventLog.loadRoom(smokeRoomCode);
    assert.equal(loadedEvents.length, 1);
    assert.equal(loadedEvents[0].payload.marker, marker);
    assert.equal(JSON.stringify(loadedEvents).includes(loadedRoom.hostToken), false);

    await persistence.deleteRoom(smokeRoomCode);
    await eventLog.deleteRoom(smokeRoomCode);
    cleanupAttempted = true;
    assert.equal(await persistence.loadRoom(smokeRoomCode), null);
    assert.deepEqual(await eventLog.loadRoom(smokeRoomCode), []);

    report.tablesPresentAfterWrite = {
      snapshots: await tablePresence(sql, persistence.tableName),
      events: await tablePresence(sql, eventLog.tableName),
    };
    report.writeSmoke = 'passed';
    report.smokeRoomCode = smokeRoomCode;
    report.cleanup = 'passed';
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (smokeRoomCode && !cleanupAttempted) {
      await persistence.deleteRoom(smokeRoomCode).catch(() => {});
      await eventLog.deleteRoom(smokeRoomCode).catch(() => {});
    }
    await close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
