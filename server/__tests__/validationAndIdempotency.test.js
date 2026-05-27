const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms, configureRoomPersistence, roomEventStore, runAiBotTick } = require('../index');
const { publicLiveProjection } = require('../publicVerification');

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
  return { status: res.status, data, headers: res.headers };
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '456 Validation Loop', asking_price: 600000 },
  });
  assert.equal(created.status, 200);
  return created.data;
}

before(listen);

afterEach(() => {
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

test('room, join, bet, and settlement payloads are validated before mutation', async () => {
  const requestId = 'validation-test-request-001';
  const invalidCreate = await request('/api/rooms', {
    method: 'POST',
    headers: { 'X-Request-Id': requestId },
    body: { address: '   ', asking_price: 600000 },
  });
  assert.equal(invalidCreate.status, 400);
  assert.equal(invalidCreate.headers.get('x-request-id'), requestId);
  assert.match(invalidCreate.data.error, /Address/);
  assert.equal(Object.keys(rooms).length, 0);

  const invalidPrice = await request('/api/rooms', {
    method: 'POST',
    body: { address: 'Bad Price House', asking_price: -1 },
  });
  assert.equal(invalidPrice.status, 400);
  assert.match(invalidPrice.data.error, /Asking price/);

  const room = await createHostedRoom();
  const code = room.room_code;

  const invalidJoin = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: ' ', nickname: ' ' },
  });
  assert.equal(invalidJoin.status, 400);
  assert.equal(Object.keys(rooms[code].players).length, 0);

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: '<b>Ada</b>' },
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.player.nickname, 'Ada');

  const missingIdempotency = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    body: { session_id: 'player-1', outcome: 'over', wager: 25 },
  });
  assert.equal(missingIdempotency.status, 400);
  assert.match(missingIdempotency.data.error, /Idempotency-Key/);

  const invalidOutcome = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-bad-outcome-001' },
    body: { session_id: 'player-1', outcome: 'sideways', wager: 25 },
  });
  assert.equal(invalidOutcome.status, 400);
  assert.match(invalidOutcome.data.error, /Outcome/);

  const invalidWager = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-bad-wager-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 1001 },
  });
  assert.equal(invalidWager.status, 400);
  assert.match(invalidWager.data.error, /Wager/);

  const unknownPlayer = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-missing-player-001' },
    body: { session_id: 'missing-player', outcome: 'over', wager: 25 },
  });
  assert.equal(unknownPlayer.status, 404);
  assert.equal(rooms[code].market.total_trades, 0);

  const invalidSettle = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 'not-a-price' },
  });
  assert.equal(invalidSettle.status, 400);
  assert.equal(rooms[code].settled, false);

  const invalidEvidence = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: {
      actual_price: 650000,
      settlement_evidence: {
        items: [{ type: 'secret_pdf_upload', source: 'Mailbox' }],
      },
    },
  });
  assert.equal(invalidEvidence.status, 400);
  assert.match(invalidEvidence.data.error, /unsupported type/);
  assert.equal(rooms[code].settled, false);
});

test('settlement evidence packet is sanitized, replayed, and kept public-safe', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'evidence-player', nickname: 'Evidence Player' },
  });
  assert.equal(joined.status, 200);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: {
      actual_price: 650000,
      settlement_evidence: {
        summary: '<b>County sale record</b> and appraiser letter metadata.',
        items: [
          {
            type: 'sale_record',
            label: '<i>County record</i>',
            source: 'County recorder',
            reference: 'Document 9988',
            observed_at: '2026-05-25',
            confidence: 'high',
            notes: 'Public closing record metadata; no private PDF stored.',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.evidence_packet.schema_version, 'settlement-evidence/v1');
  assert.equal(settled.data.evidence_packet.status, 'metadata_attached');
  assert.equal(settled.data.evidence_packet.summary, 'County sale record and appraiser letter metadata.');
  assert.equal(settled.data.evidence_packet.items[0].label, 'County record');
  assert.equal(JSON.stringify(settled.data).includes('<b>'), false);
  assert.equal(JSON.stringify(settled.data).includes(room.host_token), false);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.settlement.evidence_packet.items[0].source, 'County recorder');

  const replay = await request(`/api/rooms/${code}/replay`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.settlement.evidence_packet.items[0].reference, 'Document 9988');
  assert.equal(JSON.stringify(replay.data).includes(room.host_token), false);
});

test('market studio draft metadata is server-validated and preserved for audit', async () => {
  const invalidDraft = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '3004 26th St',
      asking_price: 800000,
      market_draft: {
        source_type: 'existing_property',
        address: 'Different Address',
        asking_price: 800000,
      },
    },
  });
  assert.equal(invalidDraft.status, 400);
  assert.match(invalidDraft.data.error, /Market draft address/);
  assert.equal(Object.keys(rooms).length, 0);

  const sourceText = [
    '3004 26th St',
    'San Francisco, CA 94110',
    'Listed at $800,000',
    '3 beds, 2 baths, 1,200 sqft single-family home.',
  ].join('\n');
  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '3004 26th St',
      asking_price: 800000,
      market_draft: {
        source_type: 'existing_property',
        source_text: sourceText,
        property_id: '440298192',
        address: '3004 26th St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94110',
        asking_price: 800000,
        beds: 3,
        baths: 2,
        sqft: 1200,
        home_type: 'Single Family',
        provenance: {
          source: 'Local property dataset match',
          confidence: 'high',
          matchedSignals: ['existing property', 'street address', 'asking price'],
        },
        market_question: 'Will 3004 26th St appraise above $800,000?',
        market_format: 'binary_over_under',
        liquidity_b: 100,
        settlement_rule: 'Settle using final sale price, appraisal, or host-provided valuation evidence.',
        evidence_required: ['Final sale price, appraisal report, or signed valuation evidence.'],
        generated_summary: 'Matched local property draft.',
        warnings: ['Settlement still requires final evidence.'],
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.draft_audit.property_id, '440298192');
  assert.equal(created.data.draft_audit.validation.status, 'accepted');
  assert.equal(created.data.draft_audit.normalized_fields.address, '3004 26th St');
  assert.equal(created.data.draft_audit.provenance.source, 'Local property dataset match');
  assert.equal(created.data.draft_audit.source_text_length, sourceText.length);
  assert.match(created.data.draft_audit.source_text_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(created.data.draft_audit).includes(sourceText), false);

  const code = created.data.room_code;
  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.draft_audit.market_question, 'Will 3004 26th St appraise above $800,000?');

  const events = await request(`/api/rooms/${code}/events`, {
    headers: { 'X-FairValue-Host-Token': created.data.host_token },
  });
  assert.equal(events.status, 200);
  assert.equal(events.data.events[0].payload.draft_audit.property_id, '440298192');

  const replay = await request(`/api/rooms/${code}/replay`, {
    headers: { 'X-FairValue-Host-Token': created.data.host_token },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.draft_audit.property_id, '440298192');
});

test('room phase changes are host-authorized, replayed, and lock betting', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': room.host_token };

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'phase-player', nickname: 'Phase Player' },
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.phase.status, 'open');

  const deniedPhase = await request(`/api/rooms/${code}/phase`, {
    method: 'POST',
    body: { phase: 'locked' },
  });
  assert.equal(deniedPhase.status, 403);
  assert.match(deniedPhase.data.error, /Host token/);

  const invalidPhase = await request(`/api/rooms/${code}/phase`, {
    method: 'POST',
    headers: hostHeaders,
    body: { phase: 'afterparty' },
  });
  assert.equal(invalidPhase.status, 400);
  assert.match(invalidPhase.data.error, /open, discussion, or locked/);

  const discussion = await request(`/api/rooms/${code}/phase`, {
    method: 'POST',
    headers: hostHeaders,
    body: { phase: 'discussion', timer_seconds: 300 },
  });
  assert.equal(discussion.status, 200);
  assert.equal(discussion.data.phase.status, 'discussion');
  assert.equal(discussion.data.phase.betting_locked, false);
  assert.equal(discussion.data.phase.duration_seconds, 300);
  assert.ok(discussion.data.phase.timer_ends_at > discussion.data.phase.timer_started_at);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.phase.status, 'discussion');
  assert.equal(state.data.activity.at(-1).type, 'phase');

  const replay = await request(`/api/rooms/${code}/replay`, {
    headers: hostHeaders,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.room_phase.status, 'discussion');
  assert.equal(replay.data.replay.activity.at(-1).phase_label, 'Discussion timer');

  const locked = await request(`/api/rooms/${code}/phase`, {
    method: 'POST',
    headers: hostHeaders,
    body: { phase: 'locked' },
  });
  assert.equal(locked.status, 200);
  assert.equal(locked.data.phase.betting_locked, true);

  const lockedBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'phase-locked-bet-001' },
    body: { session_id: 'phase-player', outcome: 'over', wager: 25 },
  });
  assert.equal(lockedBet.status, 423);
  assert.equal(lockedBet.data.error, 'Betting is locked by the host');
  assert.equal(rooms[code].market.total_trades, 0);

  const lockedAi = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: hostHeaders,
  });
  assert.equal(lockedAi.status, 400);
  assert.equal(lockedAi.data.error, 'Betting is locked by the host');

  const reopened = await request(`/api/rooms/${code}/phase`, {
    method: 'POST',
    headers: hostHeaders,
    body: { phase: 'open' },
  });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data.phase.status, 'open');
  assert.equal(reopened.data.phase.betting_locked, false);

  const openBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'phase-open-bet-001' },
    body: { session_id: 'phase-player', outcome: 'over', wager: 25 },
  });
  assert.equal(openBet.status, 200);
  assert.equal(openBet.data.market.total_trades, 1);
});

test('bet idempotency replays duplicates without mutating the room twice', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });

  const firstBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 50 },
  });
  assert.equal(firstBet.status, 200);
  assert.equal(firstBet.data.market.total_trades, 1);
  assert.equal(firstBet.data.player.balance, 950);

  const replay = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'over', wager: 50 },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  assert.equal(replay.data.idempotent_replay, true);
  assert.equal(replay.data.market.total_trades, 1);
  assert.equal(replay.data.player.balance, 950);
  assert.equal(rooms[code].activity.filter((entry) => entry.type === 'bet').length, 1);
  assert.equal(rooms[code].players['player-1'].bets.length, 1);

  const conflict = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-001' },
    body: { session_id: 'player-1', outcome: 'under', wager: 50 },
  });
  assert.equal(conflict.status, 409);
  assert.equal(rooms[code].market.total_trades, 1);

  const secondBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'duplicate-bet-key-002' },
    body: { session_id: 'player-1', outcome: 'under', wager: 25 },
  });
  assert.equal(secondBet.status, 200);
  assert.equal(secondBet.data.market.total_trades, 2);
});

test('bet reasons are sanitized, idempotent, replayed, and public-projected', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': room.host_token };

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'reason-player', nickname: 'Reason Player' },
  });
  assert.equal(joined.status, 200);

  const invalidReason = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'reason-bad-type-001' },
    body: { session_id: 'reason-player', outcome: 'over', wager: 25, reason: { text: 'too structured' } },
  });
  assert.equal(invalidReason.status, 400);
  assert.match(invalidReason.data.error, /reason must be text/i);

  const reason = 'Recent comp supports OVER after touring the block.';
  const firstBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'reason-bet-001' },
    body: {
      session_id: 'reason-player',
      outcome: 'over',
      wager: 25,
      reason: `<b>${reason}</b>`,
    },
  });
  assert.equal(firstBet.status, 200);
  assert.equal(firstBet.data.player.bets[0].reason, reason);
  assert.equal(JSON.stringify(firstBet.data).includes('<b>'), false);

  const duplicate = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'reason-bet-001' },
    body: {
      session_id: 'reason-player',
      outcome: 'over',
      wager: 25,
      bet_reason: reason,
    },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.headers.get('idempotent-replay'), 'true');
  assert.equal(duplicate.data.player.bets[0].reason, reason);

  const conflict = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'reason-bet-001' },
    body: {
      session_id: 'reason-player',
      outcome: 'over',
      wager: 25,
      rationale: 'A different reason changes the canonical bet.',
    },
  });
  assert.equal(conflict.status, 409);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.activity.at(-1).reason, reason);
  assert.equal(state.data.players.find((player) => player.session_id === 'reason-player').bets[0].reason, reason);

  const events = await request(`/api/rooms/${code}/events`, { headers: hostHeaders });
  assert.equal(events.status, 200);
  const betEvent = events.data.events.find((event) => event.type === 'bet_placed');
  assert.equal(betEvent.payload.reason, reason);
  assert.equal(betEvent.payload.player.bets[0].reason, reason);

  const replay = await request(`/api/rooms/${code}/replay`, { headers: hostHeaders });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.activity.at(-1).reason, reason);
  assert.equal(replay.data.replay.players['reason-player'].bets[0].reason, reason);

  const projection = publicLiveProjection(rooms[code]);
  assert.equal(projection.activity.at(-1).reason, reason);
  assert.equal(projection.players.find((player) => player.nickname === 'Reason Player').reason_count, 1);
});

test('concurrent bet requests reconcile through the authoritative server market', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-1', nickname: 'Player One' },
  });
  await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'player-2', nickname: 'Player Two' },
  });

  const [overBet, underBet] = await Promise.all([
    request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'concurrent-over-bet-001' },
      body: { session_id: 'player-1', outcome: 'over', wager: 25 },
    }),
    request(`/api/rooms/${code}/bet`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'concurrent-under-bet-001' },
      body: { session_id: 'player-2', outcome: 'under', wager: 40 },
    }),
  ]);

  assert.equal(overBet.status, 200);
  assert.equal(underBet.status, 200);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.market.total_trades, 2);
  assert.equal(state.data.players.find((player) => player.session_id === 'player-1').balance, 975);
  assert.equal(state.data.players.find((player) => player.session_id === 'player-2').balance, 960);
  assert.equal(rooms[code].activity.filter((entry) => entry.type === 'bet').length, 2);
});

test('join route rate limits repeated submissions', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;
  let limited;

  for (let i = 0; i < 35; i += 1) {
    const response = await request(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { session_id: 'rate-limited-player', nickname: `Player ${i}` },
    });
    if (response.status === 429) {
      limited = response;
      break;
    }
  }

  assert.ok(limited, 'expected join submissions to hit the rate limit');
  const retryAfter = Number(limited.headers.get('retry-after'));
  assert.ok(retryAfter >= 1 && retryAfter <= 60);
  assert.match(limited.data.error, /Too many/);
});

function createFailingPersistenceSql() {
  async function sql(strings) {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    if (query.startsWith('CREATE TABLE')) return [];
    if (query.startsWith('SELECT room_code')) return [];
    if (query.startsWith('INSERT INTO fairvalue_room_snapshots')) {
      throw new Error('forced durable write failure');
    }
    return [];
  }
  sql.isConfigured = true;
  return sql;
}

test('configured durable room persistence failures return a 503 for critical mutations', async () => {
  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const failedCreate = await request('/api/rooms', {
    method: 'POST',
    body: { address: '503 Persistence Lane', asking_price: 600000 },
  });
  assert.equal(failedCreate.status, 503);
  assert.equal(failedCreate.data.error, 'Room persistence failed');

  configureRoomPersistence(null);
  const room = await createHostedRoom();
  const code = room.room_code;

  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const failedJoin = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'durability-player', nickname: 'Durable Player' },
  });
  assert.equal(failedJoin.status, 503);
  assert.equal(failedJoin.data.error, 'Room persistence failed');

  configureRoomPersistence(null);
  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'durability-player', nickname: 'Durable Player' },
  });
  assert.equal(joined.status, 200);

  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const failedBet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'durability-failure-bet' },
    body: { session_id: 'durability-player', outcome: 'over', wager: 25 },
  });
  assert.equal(failedBet.status, 503);
  assert.equal(failedBet.data.error, 'Room persistence failed');

  configureRoomPersistence(null);
  const cleanRoom = await createHostedRoom();
  const cleanJoin = await request(`/api/rooms/${cleanRoom.room_code}/join`, {
    method: 'POST',
    body: { session_id: 'settle-player', nickname: 'Settle Player' },
  });
  assert.equal(cleanJoin.status, 200);

  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const failedSettle = await request(`/api/rooms/${cleanRoom.room_code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': cleanRoom.host_token },
    body: { actual_price: 650000 },
  });
  assert.equal(failedSettle.status, 503);
  assert.equal(failedSettle.data.error, 'Room persistence failed');
});

test('host-only audit errors report durable persistence failures before returning auth status', async () => {
  const room = await createHostedRoom();
  const code = room.room_code;

  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const deniedAudit = await request(`/api/rooms/${code}/events`);
  assert.equal(deniedAudit.status, 503);
  assert.equal(deniedAudit.data.error, 'Room persistence failed');
  assert.match(deniedAudit.data.message, /could not save/);
});

test('AI bot interval trades stop and surface durability status when room persistence fails', async () => {
  const roomResponse = await createHostedRoom();
  const code = roomResponse.room_code;
  const room = rooms[code];
  room.aiEnabled = true;

  configureRoomPersistence({ mode: 'postgres', sql: createFailingPersistenceSql() });
  const result = await runAiBotTick(room);
  assert.equal(result.ok, false);
  assert.equal(room.aiEnabled, false);
  assert.equal(room.aiInterval, null);
  assert.equal(room.durabilityError.action, 'ai_trade');
  assert.equal(room.durabilityError.error, 'Room persistence failed');

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.ai_enabled, false);
  assert.equal(state.data.durability_error.action, 'ai_trade');
  assert.equal(state.data.durability_error.error, 'Room persistence failed');
});
