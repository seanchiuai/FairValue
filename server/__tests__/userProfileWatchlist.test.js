const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  server,
  configureUserProfilePersistence,
  configureAlertDelivery,
  configurePropertySnapshot,
} = require('../index');

let baseUrl;
let tempRoot;

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

async function request(pathname, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function createIdentity() {
  const identity = await request('/api/identity', { method: 'POST' });
  assert.equal(identity.status, 200);
  return identity.data;
}

before(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), 'fairvalue-user-profile-test-'));
  return listen();
});

afterEach(() => {
  configureUserProfilePersistence(null);
  configureAlertDelivery(null);
  configurePropertySnapshot(null);
});

after(async () => {
  await close();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('signed-in users persist private watchlist notes and alert thresholds', async () => {
  const profilePath = path.join(tempRoot, 'user-profile.json');
  configureUserProfilePersistence({ filePath: profilePath });
  const identity = await createIdentity();
  const userHeaders = { 'X-FairValue-User-Token': identity.user_token };

  const unauthenticated = await request('/api/me/watchlist');
  assert.equal(unauthenticated.status, 403);
  assert.match(unauthenticated.data.error, /User token/);

  const added = await request('/api/me/watchlist/12345', {
    method: 'PUT',
    headers: userHeaders,
    body: {
      note: '<b>Walk the permit history before bidding.</b>',
      alert_below: 850000,
      alert_above: -1,
    },
  });
  assert.equal(added.status, 200);
  assert.equal(added.data.schema_version, 'fairvalue.userWatchlist.v1');
  assert.equal(added.data.watchlist.length, 1);
  assert.equal(added.data.watchlist[0].property_id, '12345');
  assert.equal(added.data.watchlist[0].note, 'Walk the permit history before bidding.');
  assert.equal(added.data.watchlist[0].alert_below, 850000);
  assert.equal(added.data.watchlist[0].alert_above, null);
  assert.equal(JSON.stringify(added.data).includes(identity.user_token), false);

  const patched = await request('/api/me/watchlist/12345', {
    method: 'PATCH',
    headers: userHeaders,
    body: {
      note: 'Check insurance quote next.',
      alert_above: 920000,
    },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.watchlist[0].note, 'Check insurance quote next.');
  assert.equal(patched.data.watchlist[0].alert_below, 850000);
  assert.equal(patched.data.watchlist[0].alert_above, 920000);

  configureUserProfilePersistence({ filePath: profilePath });
  const restored = await request('/api/me/watchlist', { headers: userHeaders });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.watchlist[0].note, 'Check insurance quote next.');
  assert.equal(restored.data.watchlist[0].alert_above, 920000);

  const invalid = await request('/api/me/watchlist/not%20valid', {
    method: 'PUT',
    headers: userHeaders,
    body: { note: 'bad id' },
  });
  assert.equal(invalid.status, 400);

  const removed = await request('/api/me/watchlist/12345', {
    method: 'DELETE',
    headers: userHeaders,
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.watchlist.length, 0);
});

test('signed-in users get a deduped in-app alert queue from saved thresholds', async () => {
  const profilePath = path.join(tempRoot, 'user-profile-alerts.json');
  configureUserProfilePersistence({ filePath: profilePath });
  configurePropertySnapshot({
    properties: [
      {
        zpid: 12345,
        streetAddress: '101 Alert Ave',
        city: 'San Francisco',
        state: 'CA',
        zipcode: '94110',
        price: 800000,
        listingDataSource: 'Fixture MLS',
        attributionInfo: { lastChecked: '2026-05-27' },
      },
    ],
  });
  const identity = await createIdentity();
  const userHeaders = { 'X-FairValue-User-Token': identity.user_token };

  const unauthenticated = await request('/api/me/alerts');
  assert.equal(unauthenticated.status, 403);

  const added = await request('/api/me/watchlist/12345', {
    method: 'PUT',
    headers: userHeaders,
    body: {
      note: 'Alert me if this starts to look cheap.',
      alert_below: 850000,
      alert_above: 900000,
    },
  });
  assert.equal(added.status, 200);

  const evaluated = await request('/api/me/alerts/evaluate', {
    method: 'POST',
    headers: userHeaders,
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.data.schema_version, 'fairvalue.userWatchlistAlerts.v1');
  assert.equal(evaluated.data.alerts.length, 1);
  assert.equal(evaluated.data.delivery_queue.length, 1);
  assert.equal(evaluated.data.outbound_delivery.provider_status, 'disabled');
  assert.equal(evaluated.data.outbound_delivery.attempts[0].status, 'skipped');
  assert.equal(evaluated.data.outbound_delivery.attempts[0].reason, 'webhook_not_configured');
  assert.equal(evaluated.data.alerts[0].alert_type, 'price_below');
  assert.equal(evaluated.data.alerts[0].property.address, '101 Alert Ave');
  assert.equal(evaluated.data.alerts[0].current_price, 800000);
  assert.equal(evaluated.data.alerts[0].threshold, 850000);
  assert.equal(evaluated.data.alerts[0].status, 'ready');
  assert.equal(JSON.stringify(evaluated.data).includes(identity.user_token), false);
  const alertId = evaluated.data.alerts[0].alert_id;

  const repeated = await request('/api/me/alerts/evaluate', {
    method: 'POST',
    headers: userHeaders,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.alerts.length, 1);
  assert.equal(repeated.data.alerts[0].alert_id, alertId);

  const acknowledged = await request(`/api/me/alerts/${alertId}`, {
    method: 'PATCH',
    headers: userHeaders,
  });
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.data.alerts[0].status, 'acknowledged');
  assert.equal(acknowledged.data.delivery_queue.length, 0);

  configureUserProfilePersistence({ filePath: profilePath });
  const restored = await request('/api/me/alerts', { headers: userHeaders });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.alerts[0].status, 'acknowledged');

  const invalid = await request('/api/me/alerts/not%20valid', {
    method: 'PATCH',
    headers: userHeaders,
  });
  assert.equal(invalid.status, 400);
});

test('signed-in alert evaluation sends configured redacted webhook delivery once', async () => {
  const profilePath = path.join(tempRoot, 'user-profile-alert-webhook.json');
  configureUserProfilePersistence({ filePath: profilePath });
  configurePropertySnapshot({
    properties: [
      {
        zpid: 12345,
        streetAddress: '101 Alert Ave',
        city: 'San Francisco',
        state: 'CA',
        zipcode: '94110',
        price: 800000,
        listingDataSource: 'Fixture MLS',
        attributionInfo: { lastChecked: '2026-05-27' },
      },
    ],
  });
  const deliveries = [];
  configureAlertDelivery({
    webhookUrl: 'https://alerts.example.test/fairvalue?tenant=local',
    webhookSecret: 'delivery-secret',
    nowSeconds: () => 1779864444,
    fetchImpl: async (url, init) => {
      deliveries.push({
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
        rawBody: init.body,
      });
      return { status: 202 };
    },
  });
  const identity = await createIdentity();
  const userHeaders = { 'X-FairValue-User-Token': identity.user_token };

  const added = await request('/api/me/watchlist/12345', {
    method: 'PUT',
    headers: userHeaders,
    body: {
      note: 'Webhook should never receive this private note.',
      alert_below: 850000,
    },
  });
  assert.equal(added.status, 200);

  const evaluated = await request('/api/me/alerts/evaluate', {
    method: 'POST',
    headers: userHeaders,
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.data.outbound_delivery.provider_status, 'configured');
  assert.equal(evaluated.data.outbound_delivery.attempts.length, 1);
  assert.equal(evaluated.data.outbound_delivery.attempts[0].status, 'delivered');
  assert.equal(evaluated.data.alerts[0].outbound_delivery.status, 'delivered');
  assert.equal(evaluated.data.alerts[0].outbound_delivery.http_status, 202);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].url, 'https://alerts.example.test/fairvalue?tenant=local');
  assert.equal(deliveries[0].body.property.address, '101 Alert Ave');
  assert.match(deliveries[0].body.user_ref, /^fvusr_[a-f0-9]{32}$/);
  assert.match(deliveries[0].headers['X-FairValue-Signature'], /^sha256=[a-f0-9]{64}$/);
  assert.equal(deliveries[0].rawBody.includes(identity.user_id), false);
  assert.equal(deliveries[0].rawBody.includes(identity.user_token), false);
  assert.equal(deliveries[0].rawBody.includes('Webhook should never receive this private note.'), false);

  const repeated = await request('/api/me/alerts/evaluate', {
    method: 'POST',
    headers: userHeaders,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.outbound_delivery.provider_status, 'configured');
  assert.equal(repeated.data.outbound_delivery.attempts.length, 0);
  assert.equal(repeated.data.alerts[0].outbound_delivery.status, 'delivered');
  assert.equal(deliveries.length, 1);
});
