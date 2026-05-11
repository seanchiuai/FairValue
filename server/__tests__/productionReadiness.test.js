const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProductionReadinessReport } = require('../../scripts/check-production-readiness');

function baseProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://fairvalue:secret@db.example.com/fairvalue',
    FAIRVALUE_ROOM_STORE: 'postgres',
    FAIRVALUE_ROOM_PERSISTENCE: 'on',
    FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS: '30',
    FAIRVALUE_IDENTITY_SECRET: 'identity-secret-with-at-least-thirty-two-characters',
    FAIRVALUE_OPS_TOKEN: 'ops-token-with-at-least-24-chars',
    FAIRVALUE_REQUIRE_DATABASE_URL: '1',
    ...overrides,
  };
}

function failedIds(report) {
  return report.checks
    .filter((check) => check.severity === 'failure' && !check.ok)
    .map((check) => check.id)
    .sort();
}

test('production readiness rejects local defaults and does not echo secret values', () => {
  const env = baseProductionEnv({
    DATABASE_URL: '',
    FAIRVALUE_ROOM_STORE: 'json',
    FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS: '0',
    FAIRVALUE_IDENTITY_SECRET: 'tiny-secret-value',
    FAIRVALUE_OPS_TOKEN: 'tiny-token',
  });

  const report = buildProductionReadinessReport(env);
  assert.equal(report.ok, false);
  assert.deepEqual(failedIds(report), [
    'database_url',
    'identity_secret',
    'ops_token',
    'postgres_retention',
    'room_store_postgres',
  ]);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(env.FAIRVALUE_IDENTITY_SECRET), false);
  assert.equal(serialized.includes(env.FAIRVALUE_OPS_TOKEN), false);
});

test('production readiness accepts durable Postgres config with optional AI warning', () => {
  const report = buildProductionReadinessReport(baseProductionEnv({
    COGNEE_API_KEY: '',
  }));

  assert.equal(report.ok, true);
  assert.equal(report.summary.failures, 0);
  assert.equal(report.summary.warnings, 1);
  assert.equal(report.checks.find((check) => check.id === 'cognee_api_key').ok, false);
});

test('production readiness fails when room persistence is disabled', () => {
  const report = buildProductionReadinessReport(baseProductionEnv({
    FAIRVALUE_ROOM_PERSISTENCE: 'off',
  }));

  assert.equal(report.ok, false);
  assert.deepEqual(failedIds(report), ['room_persistence_enabled']);
});
