const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { server, rooms } = require('../index');

let baseUrl;
let wsBaseUrl;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      wsBaseUrl = `ws://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

function openSocket(code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/${code}`);
    const timer = setTimeout(() => reject(new Error(`Timed out opening socket for ${code}`)), 3000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForMessage(ws, predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${label}`));
    }, 3000);

    function onMessage(raw) {
      const data = JSON.parse(raw.toString());
      if (!predicate(data)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(data);
    }

    ws.on('message', onMessage);
  });
}

function closeSocket(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', resolve);
    ws.close();
    setTimeout(resolve, 100);
  });
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '789 Multiplayer Flow Way', asking_price: 800000 },
  });
  assert.equal(created.status, 200);
  return created.data;
}

before(listen);

afterEach(() => {
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) {
    delete rooms[code];
  }
});

after(close);

test('multiplayer API and WebSocket flow covers joins, bets, leaderboard, settlement, and state recovery', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;
  const hostSocket = await openSocket(code);
  const playerSocket = await openSocket(code);

  try {
    const playerOneJoinEvent = waitForMessage(
      hostSocket,
      (message) => message.type === 'join' && message.player?.session_id === 'player-1',
      'player one join broadcast'
    );
    const playerOneJoin = await request(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { session_id: 'player-1', nickname: 'Player One' },
    });
    assert.equal(playerOneJoin.status, 200);
    assert.equal(playerOneJoin.data.players.length, 1);
    assert.equal(playerOneJoin.data.activity.at(-1).type, 'join');

    const playerOneBroadcast = await playerOneJoinEvent;
    assert.equal(playerOneBroadcast.player_count, 1);
    assert.equal(playerOneBroadcast.activity.type, 'join');
    assert.equal(playerOneBroadcast.activity.nickname, 'Player One');

    const playerTwoJoinEvent = waitForMessage(
      playerSocket,
      (message) => message.type === 'join' && message.player?.session_id === 'player-2',
      'player two join broadcast'
    );
    const playerTwoJoin = await request(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { session_id: 'player-2', nickname: 'Player Two' },
    });
    assert.equal(playerTwoJoin.status, 200);
    assert.equal(playerTwoJoin.data.players.length, 2);

    const playerTwoBroadcast = await playerTwoJoinEvent;
    assert.equal(playerTwoBroadcast.player_count, 2);
    assert.equal(playerTwoBroadcast.activity.nickname, 'Player Two');

    const overBetEvent = waitForMessage(
      hostSocket,
      (message) => message.type === 'bet' && message.player?.session_id === 'player-1',
      'player one bet broadcast'
    );
    const overBet = await request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multiplayer-over-bet-001' },
      body: { session_id: 'player-1', outcome: 'over', wager: 25 },
    });
    assert.equal(overBet.status, 200);
    assert.equal(overBet.data.market.total_trades, 1);
    assert.equal(overBet.data.player.balance, 975);

    const overBetBroadcast = await overBetEvent;
    assert.equal(overBetBroadcast.activity.type, 'bet');
    assert.equal(overBetBroadcast.activity.outcome, 'over');
    assert.equal(overBetBroadcast.market.total_trades, 1);

    const underBet = await request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multiplayer-under-bet-001' },
      body: { session_id: 'player-2', outcome: 'under', wager: 40 },
    });
    assert.equal(underBet.status, 200);
    assert.equal(underBet.data.market.total_trades, 2);
    assert.equal(underBet.data.player.balance, 960);

    const leaderboard = await request(`/api/rooms/${code}/leaderboard`);
    assert.equal(leaderboard.status, 200);
    assert.deepEqual(
      leaderboard.data.leaderboard.map((entry) => entry.nickname),
      ['Player One', 'Player Two']
    );

    await closeSocket(playerSocket);

    const settlementEvent = waitForMessage(
      hostSocket,
      (message) => message.type === 'settle',
      'settlement broadcast'
    );
    const settlement = await request(`/api/rooms/${code}/settle`, {
      method: 'POST',
      headers: { 'X-FairValue-Host-Token': room.host_token },
      body: { actual_price: 810000 },
    });
    assert.equal(settlement.status, 200);
    assert.equal(settlement.data.winning_outcome, 'over');
    assert.equal(settlement.data.results.length, 2);

    const settlementBroadcast = await settlementEvent;
    assert.equal(settlementBroadcast.winning_outcome, 'over');
    assert.equal(settlementBroadcast.activity.type, 'settle');

    const recoveredState = await request(`/api/rooms/${code}/state`);
    assert.equal(recoveredState.status, 200);
    assert.equal(recoveredState.data.settled, true);
    assert.equal(recoveredState.data.settlement.winning_outcome, 'over');
    assert.equal(recoveredState.data.players.length, 2);
    assert.equal(recoveredState.data.activity.at(-1).type, 'settle');
    assert.equal(recoveredState.data.market.total_trades, 2);
  } finally {
    await closeSocket(hostSocket);
    await closeSocket(playerSocket);
  }
});
