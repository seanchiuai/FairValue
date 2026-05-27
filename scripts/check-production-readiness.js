#!/usr/bin/env node
require('dotenv').config();

const DEFAULT_IDENTITY_SECRET = 'fairvalue-local-dev-identity-secret';
const POSTGRES_ROOM_STORES = new Set(['postgres', 'neon', 'db', 'database']);
const DISABLED_VALUES = new Set(['0', 'false', 'off', 'disabled', 'none']);

function normalized(value) {
  return String(value || '').trim();
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(normalized(value).toLowerCase());
}

function isDisabled(value) {
  return DISABLED_VALUES.has(normalized(value).toLowerCase());
}

function isPositiveDays(value) {
  const raw = normalized(value);
  if (!raw || isDisabled(raw)) return false;
  const days = Number(raw);
  return Number.isFinite(days) && days > 0;
}

function isLikelyPostgresUrl(value) {
  const url = normalized(value);
  return /^postgres(ql)?:\/\//i.test(url);
}

function isStrongSecret(value, minLength = 32) {
  return normalized(value).length >= minLength;
}

function createCheck({ id, ok, severity = 'failure', message }) {
  return { id, ok: Boolean(ok), severity, message };
}

function buildProductionReadinessReport(env = process.env) {
  const checks = [];
  const databaseUrl = normalized(env.DATABASE_URL);
  const roomStore = normalized(env.FAIRVALUE_ROOM_STORE || 'json').toLowerCase();
  const roomPersistence = normalized(env.FAIRVALUE_ROOM_PERSISTENCE || 'on').toLowerCase();
  const identitySecret = normalized(env.FAIRVALUE_IDENTITY_SECRET);
  const publicVerificationSecret = normalized(env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET);
  const opsToken = normalized(env.FAIRVALUE_OPS_TOKEN);
  const cogneeKey = normalized(env.COGNEE_API_KEY);

  checks.push(createCheck({
    id: 'node_env',
    ok: env.NODE_ENV === 'production',
    severity: 'warning',
    message: env.NODE_ENV === 'production'
      ? 'NODE_ENV is production.'
      : 'Set NODE_ENV=production in deployed environments so runtime dependencies use production behavior.',
  }));

  checks.push(createCheck({
    id: 'database_url',
    ok: Boolean(databaseUrl) && isLikelyPostgresUrl(databaseUrl),
    message: 'DATABASE_URL must be configured with a Postgres/Neon URL before deployment.',
  }));

  checks.push(createCheck({
    id: 'room_persistence_enabled',
    ok: !isDisabled(roomPersistence),
    message: 'FAIRVALUE_ROOM_PERSISTENCE must remain enabled before deployment.',
  }));

  checks.push(createCheck({
    id: 'room_store_postgres',
    ok: POSTGRES_ROOM_STORES.has(roomStore),
    message: 'Use FAIRVALUE_ROOM_STORE=postgres for deployment; local JSON snapshots are single-process runtime state.',
  }));

  checks.push(createCheck({
    id: 'postgres_retention',
    ok: POSTGRES_ROOM_STORES.has(roomStore) && isPositiveDays(env.FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS),
    message: 'Set FAIRVALUE_POSTGRES_ROOM_RETENTION_DAYS to a positive production retention window before enabling Postgres room snapshots.',
  }));

  checks.push(createCheck({
    id: 'identity_secret',
    ok: isStrongSecret(identitySecret) && identitySecret !== DEFAULT_IDENTITY_SECRET,
    message: 'FAIRVALUE_IDENTITY_SECRET must be a stable private value of at least 32 characters and must not use the local-dev default.',
  }));

  checks.push(createCheck({
    id: 'ops_token',
    ok: isStrongSecret(opsToken, 24),
    message: 'FAIRVALUE_OPS_TOKEN must be set to protect /api/ops/metrics before exposing the backend.',
  }));

  checks.push(createCheck({
    id: 'public_verification_secret',
    ok: isStrongSecret(publicVerificationSecret),
    message: 'FAIRVALUE_PUBLIC_VERIFICATION_SECRET must be set to emit signed public room verification artifacts before deployment.',
  }));

  checks.push(createCheck({
    id: 'database_required_flag',
    ok: isEnabled(env.FAIRVALUE_REQUIRE_DATABASE_URL) || POSTGRES_ROOM_STORES.has(roomStore),
    severity: 'warning',
    message: 'Set FAIRVALUE_REQUIRE_DATABASE_URL=1 for deployment checks unless FAIRVALUE_ROOM_STORE=postgres already makes the database mandatory.',
  }));

  checks.push(createCheck({
    id: 'cognee_api_key',
    ok: Boolean(cogneeKey),
    severity: 'warning',
    message: 'COGNEE_API_KEY is optional, but AI analyst routes will return degraded responses until it is configured server-side.',
  }));

  const failures = checks.filter((check) => check.severity === 'failure' && !check.ok);
  const warnings = checks.filter((check) => check.severity === 'warning' && !check.ok);

  return {
    check: 'fairvalue-production-readiness',
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    summary: {
      failures: failures.length,
      warnings: warnings.length,
      passed: checks.length - failures.length - warnings.length,
    },
    checks,
  };
}

function main() {
  const report = buildProductionReadinessReport();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  buildProductionReadinessReport,
};
