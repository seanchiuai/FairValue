const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ALERT_DELIVERY_SCHEMA_VERSION,
  ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION,
  createAlertDeliveryAdapter,
} = require('../alertDeliveryAdapter');

const sampleAlert = {
  alert_id: 'alrt_sample',
  alert_type: 'price_below',
  property_id: '12345',
  threshold: 850000,
  current_price: 800000,
  triggered_at: 1779860000,
  status: 'ready',
  delivery_channel: 'in_app_profile',
  private_note: 'never send this',
  property: {
    property_id: '12345',
    address: '101 Alert Ave',
    city: 'San Francisco',
    state: 'CA',
    zip_code: '94110',
    provider_source: 'Fixture MLS',
    observed_at: '2026-05-27',
  },
  message: '101 Alert Ave is at or below $850,000 in the current snapshot ($800,000).',
};

test('disabled alert delivery adapter reports skipped webhook attempts without sending', async () => {
  let called = false;
  const adapter = createAlertDeliveryAdapter({
    webhookUrl: '',
    fetchImpl: async () => {
      called = true;
      return { status: 200 };
    },
  });

  const delivery = await adapter.deliverAlerts({
    userId: 'usr_secret_identity',
    alerts: [sampleAlert],
    nowSeconds: 1779861111,
  });

  assert.equal(delivery.schema_version, ALERT_DELIVERY_SCHEMA_VERSION);
  assert.equal(delivery.provider_status, 'disabled');
  assert.equal(delivery.outbound_channel, 'none');
  assert.equal(delivery.attempts.length, 1);
  assert.equal(delivery.attempts[0].status, 'skipped');
  assert.equal(delivery.attempts[0].reason, 'webhook_not_configured');
  assert.equal(called, false);
});

test('configured alert delivery adapter sends signed redacted webhook payloads', async () => {
  const deliveries = [];
  const adapter = createAlertDeliveryAdapter({
    webhookUrl: 'https://alerts.example.test/fairvalue?tenant=local#fragment',
    webhookSecret: 'delivery-secret',
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

  const delivery = await adapter.deliverAlerts({
    userId: 'usr_secret_identity',
    alerts: [sampleAlert],
    nowSeconds: 1779862222,
  });

  assert.equal(delivery.provider_status, 'configured');
  assert.equal(delivery.endpoint_origin, 'https://alerts.example.test');
  assert.equal(delivery.attempts.length, 1);
  assert.equal(delivery.attempts[0].status, 'delivered');
  assert.equal(delivery.attempts[0].http_status, 202);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].url, 'https://alerts.example.test/fairvalue?tenant=local');
  assert.equal(deliveries[0].body.schema_version, ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION);
  assert.equal(deliveries[0].body.event_type, 'watchlist_alert.triggered');
  assert.match(deliveries[0].body.user_ref, /^fvusr_[a-f0-9]{32}$/);
  assert.match(deliveries[0].headers['X-FairValue-Signature'], /^sha256=[a-f0-9]{64}$/);
  assert.equal(deliveries[0].headers['X-FairValue-Alert-Schema'], ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION);
  assert.equal(deliveries[0].body.property.address, '101 Alert Ave');
  assert.equal(deliveries[0].rawBody.includes('usr_secret_identity'), false);
  assert.equal(deliveries[0].rawBody.includes('never send this'), false);
});

test('webhook URLs must use https outside localhost', async () => {
  const adapter = createAlertDeliveryAdapter({
    webhookUrl: 'http://alerts.example.test/fairvalue',
    fetchImpl: async () => ({ status: 200 }),
  });

  const delivery = await adapter.deliverAlerts({
    userId: 'usr_secret_identity',
    alerts: [sampleAlert],
    nowSeconds: 1779863333,
  });

  assert.equal(delivery.provider_status, 'misconfigured');
  assert.match(delivery.configuration_error, /https/);
  assert.equal(delivery.attempts[0].status, 'skipped');
  assert.equal(delivery.attempts[0].reason, 'invalid_webhook_configuration');
});
