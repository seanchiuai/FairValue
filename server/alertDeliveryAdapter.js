const crypto = require('crypto');

const ALERT_DELIVERY_SCHEMA_VERSION = 'fairvalue.alertDeliveryAdapter.v1';
const ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION = 'fairvalue.alertWebhookPayload.v1';
const DEFAULT_TIMEOUT_MS = 5000;

function hashValue(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function resolveNowSeconds(value) {
  const raw = typeof value === 'function' ? value() : value;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  return Math.floor(Date.now() / 1000);
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeWebhookUrl(rawValue) {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!raw) return { url: null, error: null };
  try {
    const parsed = new URL(raw);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp = parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
    if (!isHttps && !isLocalHttp) {
      return { url: null, error: 'FAIRVALUE_ALERT_WEBHOOK_URL must use https outside localhost.' };
    }
    parsed.hash = '';
    return { url: parsed.toString(), error: null };
  } catch {
    return { url: null, error: 'FAIRVALUE_ALERT_WEBHOOK_URL is not a valid URL.' };
  }
}

function summarizeEndpoint(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function createUserRef(userId) {
  return `fvusr_${hashValue(userId, 32)}`;
}

function createDeliveryId(userId, alert) {
  return `dlv_${hashValue([
    userId,
    alert?.alert_id,
    alert?.property_id,
    alert?.triggered_at,
  ].join('|'), 28)}`;
}

function compactProperty(property = {}, fallbackPropertyId = null) {
  return {
    property_id: String(property.property_id || fallbackPropertyId || '').slice(0, 80),
    address: String(property.address || '').slice(0, 160),
    city: String(property.city || '').slice(0, 80),
    state: String(property.state || '').slice(0, 24),
    zip_code: String(property.zip_code || '').slice(0, 24),
    provider_source: String(property.provider_source || 'FairValue property snapshot').slice(0, 120),
    observed_at: property.observed_at ? String(property.observed_at).slice(0, 80) : null,
  };
}

function buildWebhookPayload({ userId, alert, attemptedAt }) {
  const property = compactProperty(alert?.property, alert?.property_id);
  return {
    schema_version: ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION,
    event_type: 'watchlist_alert.triggered',
    delivery_id: createDeliveryId(userId, alert),
    user_ref: createUserRef(userId),
    attempted_at: attemptedAt,
    alert: {
      alert_id: String(alert?.alert_id || '').slice(0, 120),
      alert_type: String(alert?.alert_type || '').slice(0, 40),
      property_id: String(alert?.property_id || '').slice(0, 80),
      threshold: Number(alert?.threshold),
      current_price: Number(alert?.current_price),
      triggered_at: Number(alert?.triggered_at),
      status: String(alert?.status || '').slice(0, 32),
      in_app_channel: String(alert?.delivery_channel || 'in_app_profile').slice(0, 40),
      message: alert?.message ? String(alert.message).slice(0, 240) : null,
    },
    property,
    limitations: [
      'This webhook payload is a redacted signed-user alert event, not a public market signal.',
      'It does not include user tokens, host tokens, private watchlist notes, raw evidence, or player session identifiers.',
      'The trigger was evaluated against the current FairValue static property snapshot, not a live provider push event.',
    ],
  };
}

function signBody(body, secret) {
  if (!secret) return null;
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

function createAlertDeliveryAdapter({
  webhookUrl = process.env.FAIRVALUE_ALERT_WEBHOOK_URL,
  webhookSecret = process.env.FAIRVALUE_ALERT_WEBHOOK_SECRET,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  nowSeconds = null,
} = {}) {
  const normalizedWebhook = normalizeWebhookUrl(webhookUrl);
  const configuredUrl = normalizedWebhook.url;
  const signingSecret = typeof webhookSecret === 'string' ? webhookSecret : '';

  function status() {
    const providerStatus = normalizedWebhook.error
      ? 'misconfigured'
      : configuredUrl
        ? 'configured'
        : 'disabled';
    return {
      schema_version: ALERT_DELIVERY_SCHEMA_VERSION,
      provider_status: providerStatus,
      outbound_channel: configuredUrl ? 'webhook' : 'none',
      endpoint_origin: summarizeEndpoint(configuredUrl),
      signing_configured: Boolean(signingSecret),
      limitations: [
        configuredUrl
          ? 'Webhook delivery is enabled only for threshold alerts selected by the private signed-user evaluator.'
          : 'Outbound alert delivery is disabled until FAIRVALUE_ALERT_WEBHOOK_URL is configured.',
        'The in-app alert inbox remains the canonical user-visible queue.',
        'This adapter does not send email, SMS, push, broker, lender, appraisal, fraud, or provider notifications.',
        'Webhook payloads are redacted and do not include user tokens, host tokens, private watchlist notes, or raw evidence.',
      ],
      ...(normalizedWebhook.error ? { configuration_error: normalizedWebhook.error } : {}),
    };
  }

  function projection(attempts = []) {
    return {
      ...status(),
      attempts,
    };
  }

  async function deliverAlert({ userId, alert, nowSeconds: attemptNowSeconds = null } = {}) {
    const attemptedAt = resolveNowSeconds(attemptNowSeconds ?? nowSeconds);
    const baseAttempt = {
      alert_id: String(alert?.alert_id || '').slice(0, 120),
      property_id: String(alert?.property_id || '').slice(0, 80),
      alert_type: String(alert?.alert_type || '').slice(0, 40),
      channel: 'webhook',
      delivery_id: createDeliveryId(userId, alert),
      attempted_at: attemptedAt,
    };

    if (!alert || alert.status !== 'ready') {
      return { ...baseAttempt, status: 'skipped', reason: 'alert_not_ready' };
    }
    if (normalizedWebhook.error) {
      return { ...baseAttempt, status: 'skipped', reason: 'invalid_webhook_configuration' };
    }
    if (!configuredUrl) {
      return { ...baseAttempt, status: 'skipped', reason: 'webhook_not_configured' };
    }
    if (typeof fetchImpl !== 'function') {
      return { ...baseAttempt, status: 'failed', reason: 'fetch_unavailable' };
    }

    const payload = buildWebhookPayload({ userId, alert, attemptedAt });
    const body = JSON.stringify(payload);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const signature = signBody(body, signingSecret);
      const headers = {
        'Content-Type': 'application/json',
        'X-FairValue-Alert-Schema': ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION,
        'X-FairValue-Delivery-Id': payload.delivery_id,
      };
      if (signature) headers['X-FairValue-Signature'] = signature;
      const response = await fetchImpl(configuredUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller?.signal,
      });
      const httpStatus = Number(response?.status) || 0;
      if (httpStatus >= 200 && httpStatus < 300) {
        return { ...baseAttempt, status: 'delivered', http_status: httpStatus };
      }
      return { ...baseAttempt, status: 'failed', reason: 'http_error', http_status: httpStatus };
    } catch {
      return { ...baseAttempt, status: 'failed', reason: 'request_failed' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function deliverAlerts({ userId, alerts = [], nowSeconds: attemptNowSeconds = null } = {}) {
    const attempts = [];
    for (const alert of alerts) {
      attempts.push(await deliverAlert({ userId, alert, nowSeconds: attemptNowSeconds }));
    }
    return projection(attempts);
  }

  return {
    schemaVersion: ALERT_DELIVERY_SCHEMA_VERSION,
    payloadSchemaVersion: ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION,
    status,
    projection,
    deliverAlert,
    deliverAlerts,
    buildWebhookPayload: ({ userId, alert, attemptedAt = resolveNowSeconds(nowSeconds) }) =>
      buildWebhookPayload({ userId, alert, attemptedAt }),
  };
}

module.exports = {
  ALERT_DELIVERY_SCHEMA_VERSION,
  ALERT_WEBHOOK_PAYLOAD_SCHEMA_VERSION,
  createAlertDeliveryAdapter,
  buildWebhookPayload,
};
