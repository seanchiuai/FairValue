const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  server,
  configureUserProfilePersistence,
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
