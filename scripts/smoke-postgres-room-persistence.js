#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const postgres = require('postgres');
const { createPostgresRoomPersistence } = require('../server/roomPersistence');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed\n${details}`);
  }
  return result.stdout.trim();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error('Could not allocate a free port'));
        else resolve(port);
      });
    });
  });
}

async function waitForPostgres(sql) {
  const deadline = Date.now() + 45_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Timed out waiting for disposable Postgres: ${lastError?.message || 'unknown error'}`);
}

async function main() {
  run('docker', ['info']);

  const port = await getFreePort();
  const containerName = `fairvalue-room-postgres-${process.pid}`;
  const image = process.env.FAIRVALUE_POSTGRES_IMAGE || 'postgres:16-alpine';
  const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${port}/fairvalue`;
  let sql = null;

  try {
    run('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      containerName,
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_PASSWORD=postgres',
      '-e',
      'POSTGRES_DB=fairvalue',
      '-p',
      `127.0.0.1:${port}:5432`,
      image,
    ]);

    sql = postgres(databaseUrl, { max: 1 });
    await waitForPostgres(sql);

    const persistence = createPostgresRoomPersistence({ sql });
    await persistence.clear();
    await persistence.save({
      rooms: {
        LIVE: {
          code: 'LIVE',
          hostToken: 'live-host-token',
          house: { address: '1 Disposable Postgres Way', asking_price: 500000 },
          market: { total_trades: 1 },
          players: { player1: { session_id: 'player1', nickname: 'Live Player' } },
          betReceipts: [['live-bet-001', { response: { ok: true } }]],
          events: [{ sequence: 1, type: 'room_created' }],
          settled: false,
        },
      },
    });

    let loaded = await persistence.load();
    assert.equal(loaded.rooms.LIVE.hostToken, 'live-host-token');
    assert.equal(loaded.rooms.LIVE.players.player1.nickname, 'Live Player');
    assert.equal(loaded.rooms.LIVE.betReceipts[0][0], 'live-bet-001');

    await persistence.save({
      rooms: {
        NEXT: {
          code: 'NEXT',
          hostToken: 'next-host-token',
          house: { address: '2 Disposable Postgres Way', asking_price: 600000 },
          market: { total_trades: 2 },
          players: {},
          betReceipts: [],
          events: [{ sequence: 1, type: 'room_created' }],
          settled: true,
        },
      },
    });

    loaded = await persistence.load();
    assert.deepEqual(Object.keys(loaded.rooms), ['NEXT']);
    assert.equal(loaded.rooms.NEXT.settled, true);

    await persistence.clear();
    loaded = await persistence.load();
    assert.deepEqual(loaded.rooms, {});

    console.log(JSON.stringify({
      ok: true,
      adapter: persistence.kind,
      table: persistence.tableName,
      image,
      port,
    }));
  } finally {
    if (sql) await sql.end({ timeout: 1 }).catch(() => {});
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
