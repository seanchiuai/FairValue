const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../index');

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

async function request(path, { method = 'GET', body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function assertSecurityHeaders(res) {
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(
    res.headers.get('permissions-policy'),
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  assert.equal(res.headers.get('x-powered-by'), null);
}

before(listen);
after(close);

test('security headers are present on successful health responses', async () => {
  const res = await request('/healthz');
  assert.equal(res.status, 200);
  assertSecurityHeaders(res);
});

test('security headers are present on validation errors', async () => {
  const res = await request('/api/rooms', {
    method: 'POST',
    body: { address: '', asking_price: 0 },
  });
  assert.equal(res.status, 400);
  assertSecurityHeaders(res);
});

test('security headers are present on unknown routes', async () => {
  const res = await request('/api/not-a-real-route');
  assert.equal(res.status, 404);
  assertSecurityHeaders(res);
});
