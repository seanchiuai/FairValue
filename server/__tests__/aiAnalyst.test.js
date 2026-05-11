const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../index');

let baseUrl;
const originalCogneeApiKey = process.env.COGNEE_API_KEY;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
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

before(listen);
after(close);
afterEach(() => {
  restoreEnv('COGNEE_API_KEY', originalCogneeApiKey);
});

test('missing Cognee key returns cited local analyst output instead of an uncited outage', async () => {
  delete process.env.COGNEE_API_KEY;

  const response = await request('/api/ai/cognee/markets/ROOM1/search', {
    method: 'POST',
    body: {
      query: 'Summarize this market',
      market_context: {
        probability_over: 0.61,
        total_trades: 4,
        total_wagered: 275,
        asking_price: 680000,
        implied_fair_value: 694960,
        player_count: 3,
        timestamp: '2026-05-11T13:00:00.000Z',
        recent_bets: [
          { nickname: 'Ari', outcome: 'over', wager: 100 },
          { nickname: 'Bea', outcome: 'under', wager: 75 },
        ],
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.degraded, true);
  assert.equal(response.data.local_analysis, true);
  assert.match(response.data.content, /Local AI analyst/);
  assert.match(response.data.content, /61%/);
  assert.match(response.data.content, /\$694,960/);
  assert.deepEqual(
    response.data.citations.map((citation) => citation.id),
    ['room-market-snapshot', 'lmsr-fair-value-formula', 'recent-room-flow']
  );
  assert.equal(response.data.limitations.length, 3);
});

test('missing Cognee key skips graph writes without browser-visible resource failures', async () => {
  delete process.env.COGNEE_API_KEY;

  const initialize = await request('/api/ai/cognee/markets/ROOM1/initialize', {
    method: 'POST',
    body: { asking_price: 680000 },
  });
  const state = await request('/api/ai/cognee/markets/ROOM1/state', {
    method: 'POST',
    body: {
      state: {
        qOver: 10,
        qUnder: 9,
        totalWagered: 120,
        totalTrades: 2,
        fairValue: 687000,
        askingPrice: 680000,
        timestamp: '2026-05-11T13:00:00.000Z',
      },
    },
  });

  assert.equal(initialize.status, 200);
  assert.equal(initialize.data.degraded, true);
  assert.equal(state.status, 200);
  assert.equal(state.data.degraded, true);
});
