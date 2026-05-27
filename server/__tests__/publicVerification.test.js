const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { server, rooms, configureRoomPersistence, roomEventStore } = require('../index');
const {
  createPublicVerificationArtifact,
  verifyPublicVerificationArtifactSignature,
} = require('../publicVerification');

let baseUrl;
let previousVerificationSecret;

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
  return { status: res.status, data, headers: res.headers };
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '77 Verification Way', asking_price: 720000 },
  });
  assert.equal(created.status, 200);
  return created.data;
}

before(() => {
  previousVerificationSecret = process.env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET;
  return listen();
});

afterEach(() => {
  if (previousVerificationSecret === undefined) {
    delete process.env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET;
  } else {
    process.env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET = previousVerificationSecret;
  }
  configureRoomPersistence(null);
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) {
    delete rooms[code];
  }
});

after(close);

test('public verification waits for settlement and remains unauthenticated', async () => {
  const room = await createHostedRoom();

  const early = await request(`/api/rooms/${room.room_code}/public-verification`);
  assert.equal(early.status, 409);
  assert.equal(early.data.error, 'Public verification is available after settlement');
  assert.equal(early.data.status, 'unsettled');
  assert.equal(early.data.signature.status, 'unsigned_local');
  assert.equal(JSON.stringify(early.data).includes(room.host_token), false);
});

test('public verification artifact is signed, replay-backed, and share-safe', async () => {
  process.env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET = 'public-verification-secret-with-at-least-32-chars';
  const room = await createHostedRoom();
  const code = room.room_code;

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'verification-session-1', nickname: 'Verify Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'public-verify-bet-001' },
    body: { session_id: 'verification-session-1', outcome: 'over', wager: 50 },
  });
  assert.equal(bet.status, 200);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: {
      actual_price: 735000,
      settlement_evidence: {
        summary: 'Signed public sale metadata.',
        items: [
          {
            type: 'sale_record',
            label: 'County sale record',
            source: 'County recorder',
            reference: 'Doc 735',
            observed_at: '2026-05-25',
            confidence: 'high',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);

  const verification = await request(`/api/rooms/${code}/public-verification`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.schema_version, 'public-room-verification/v1');
  assert.equal(verification.data.status, 'verified');
  assert.equal(verification.data.replay.live_match, true);
  assert.equal(verification.data.event_stream.last_sequence, verification.data.event_stream.event_count);
  assert.match(verification.data.replay.replay_hash, /^[a-f0-9]{64}$/);
  assert.match(verification.data.public_recap.digest_hash, /^[a-f0-9]{64}$/);
  assert.match(verification.data.settlement.evidence_packet_hash, /^[a-f0-9]{64}$/);
  assert.equal(verification.data.settlement.evidence_item_count, 1);
  assert.equal(verification.data.settlement.reputation_schema_version, 'room-reputation/v1');
  assert.equal(verification.data.settlement.reputation_player_count, 1);
  assert.equal(verification.data.settlement.reputation_eligible_player_count, 1);
  assert.equal(typeof verification.data.settlement.reputation_average_calibration_score, 'number');
  assert.equal(verification.data.settlement.reputation_top_players[0].nickname, 'Verify Player');
  assert.equal(verification.data.signature.status, 'signed');
  assert.equal(verification.data.signature.algorithm, 'HMAC-SHA256');
  assert.equal(verification.data.signature.key_hint, 'FAIRVALUE_PUBLIC_VERIFICATION_SECRET');
  assert.match(verification.data.signature.payload_hash, /^[a-f0-9]{64}$/);
  assert.match(verification.data.signature.value, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(verification.data);
  assert.equal(serialized.includes(room.host_token), false);
  assert.equal(serialized.includes('verification-session-1'), false);
});

test('public verification module marks local artifacts honestly when no signing secret exists', async () => {
  delete process.env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET;
  const room = await createHostedRoom();
  const code = room.room_code;

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 735000 },
  });
  assert.equal(settled.status, 200);

  const artifact = createPublicVerificationArtifact(rooms[code], roomEventStore.list(code), {
    generatedAt: '2026-05-26T00:00:00.000Z',
    env: {},
  });
  assert.equal(artifact.signature.status, 'unsigned_local');
  assert.equal(artifact.signature.value, null);
  assert.match(artifact.signature.payload_hash, /^[a-f0-9]{64}$/);
  assert.match(artifact.signature.reason, /FAIRVALUE_PUBLIC_VERIFICATION_SECRET/);
});

test('public verification fixture is signed and safe for external consumers', () => {
  const fixturePath = path.join(__dirname, '../../docs/fixtures/public-room-verification-v1.json');
  const artifact = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const fixtureSecret = 'fixture-public-verification-secret-with-32-characters';

  assert.equal(artifact.schema_version, 'public-room-verification/v1');
  assert.equal(artifact.room_code, 'FVX1');
  assert.equal(artifact.status, 'verified');
  assert.equal(artifact.signature.status, 'signed');
  assert.equal(verifyPublicVerificationArtifactSignature(artifact, fixtureSecret), true);
  assert.match(artifact.public_recap.digest_hash, /^[a-f0-9]{64}$/);
  assert.match(artifact.settlement.evidence_packet_hash, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(artifact);
  assert.equal(serialized.includes('host_token'), false);
  assert.equal(serialized.includes('session_id'), false);
  assert.equal(serialized.includes(fixtureSecret), false);
});
