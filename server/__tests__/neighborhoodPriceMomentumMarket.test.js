const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms, configureRoomPersistence, configurePropertySnapshot, roomEventStore } = require('../index');

let baseUrl;

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

function configureFixtureSnapshot() {
  configurePropertySnapshot({
    properties: [
      {
        zpid: 101,
        streetAddress: '10 Momentum St',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94607',
        price: 700000,
        livingArea: 1000,
        rentZestimate: 3000,
        homeType: 'CONDO',
        homeStatus: 'FOR_SALE',
      },
      {
        zpid: 103,
        streetAddress: '30 Momentum Ct',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94607',
        price: 1200000,
        livingArea: 1500,
        rentZestimate: 5000,
        homeType: 'CONDO',
        homeStatus: 'RECENTLY_SOLD',
      },
    ],
    manifest: {
      schema_version: 'fairvalue.propertyDataManifest.v1',
      dataset_id: 'fixture-property-snapshot',
      source_kind: 'static_provider_snapshot',
      source_sha256: 'fixture-source-hash',
      latest_observed_at: '2026-05-22',
      provider_summary: [{ provider: 'Fixture MLS', count: 2 }],
    },
  });
}

before(listen);

afterEach(() => {
  configureRoomPersistence(null);
  configurePropertySnapshot(null);
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) delete rooms[code];
});

after(close);

test('neighborhood price-momentum rooms create, trade, settle, replay, and verify through the API', async () => {
  configureFixtureSnapshot();

  const templates = await request('/api/market-templates');
  assert.equal(templates.status, 200);
  const template = templates.data.templates.find((item) => item.market_format === 'neighborhood_price_momentum_over_under');
  assert.equal(template.status, 'playable');
  assert.equal(template.pricing_engine, 'lmsr_binary_v1');

  const draftEnvelope = await request('/api/neighborhoods/94607/market-drafts');
  assert.equal(draftEnvelope.status, 200);
  const priceMomentumDraft = draftEnvelope.data.drafts.find(
    (draft) => draft.market_format === 'neighborhood_price_momentum_over_under'
  );
  assert.equal(priceMomentumDraft.template_status, 'playable');
  assert.equal(priceMomentumDraft.default_config.baseline_median_price, 950000);

  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '10 Momentum St',
      asking_price: 700000,
      market_draft: {
        ...priceMomentumDraft,
        source_type: 'existing_property',
        address: '10 Momentum St',
        city: 'Oakland',
        state: 'CA',
        zip: '94607',
        asking_price: 700000,
        provenance: {
          source: 'Fixture ZIP aggregate',
          confidence: 'medium',
          matchedSignals: ['zip:94607'],
        },
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.market_format, 'neighborhood_price_momentum_over_under');
  assert.equal(created.data.market_config.schema_version, 'neighborhood-price-momentum-over-under-config/v1');
  assert.equal(created.data.market_config.baseline_median_price, 950000);
  assert.equal(created.data.market_config.price_momentum_threshold, 978500);
  assert.equal(created.data.market_config.zip_code, '94607');
  assert.equal(created.data.draft_audit.market_question, priceMomentumDraft.question);
  const code = created.data.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': created.data.host_token };

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'momentum-player', nickname: 'Momentum Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'neighborhood-momentum-bet-001' },
    body: {
      session_id: 'momentum-player',
      outcome: 'over',
      wager: 50,
      reason: 'The next public ZIP aggregate may clear the configured momentum threshold.',
    },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.player.bets[0].outcome, 'over');

  const aiToggle = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: hostHeaders,
  });
  assert.equal(aiToggle.status, 400);
  assert.match(aiToggle.data.error, /binary over\/under/);

  const missingFutureMedian = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {},
  });
  assert.equal(missingFutureMedian.status, 400);
  assert.match(missingFutureMedian.data.error, /Future median price/);
  assert.equal(rooms[code].settled, false);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {
      future_median_price: 990000,
      settlement_evidence: {
        summary: 'Public ZIP aggregate provider snapshot metadata.',
        items: [
          {
            type: 'public_record',
            label: 'ZIP median aggregate',
            source: 'Fixture MLS aggregate',
            reference: 'fixture://zip/94607/2026-q3',
            observed_at: '2026-08-22',
            confidence: 'high',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.winning_outcome, 'over');
  assert.equal(settled.data.actual_price, 990000);
  assert.equal(settled.data.future_median_price, 990000);
  assert.equal(settled.data.baseline_median_price, 950000);
  assert.equal(settled.data.price_momentum_threshold, 978500);
  assert.equal(settled.data.price_momentum_return, 0.0421);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.settlement.future_median_price, 990000);

  const replay = await request(`/api/rooms/${code}/replay`, { headers: hostHeaders });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.settlement.future_median_price, 990000);
  assert.equal(replay.data.replay.activity.at(-1).future_median_price, 990000);

  const verification = await request(`/api/rooms/${code}/public-verification`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.settlement.future_median_price, 990000);
  assert.equal(verification.data.settlement.price_momentum_threshold, 978500);
  assert.equal(verification.data.settlement.price_momentum_return, 0.0421);
  assert.equal(JSON.stringify(verification.data).includes(created.data.host_token), false);
});
