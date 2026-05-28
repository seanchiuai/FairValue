const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRoomReputationSummary,
  publicReputationProjection,
} = require('../playerReputation');

test('room reputation scores settled player bets without exposing session IDs', () => {
  const summary = createRoomReputationSummary([
    {
      session_id: 'secret-session-ada',
      nickname: 'Ada',
      balance: 998.2,
      bets: [
        {
          outcome: 'over',
          wager: 50,
          shares: 48.2,
          prob_at_entry: 0.7,
          timestamp: 1,
          reason: 'Recent comps support the ask.',
        },
        {
          outcome: 'under',
          wager: 30,
          shares: 28.1,
          prob_at_entry: 0.6,
          timestamp: 2,
        },
      ],
    },
    {
      session_id: 'secret-session-lin',
      nickname: 'Lin',
      balance: 1018,
      bets: [
        {
          outcome: 'over',
          wager: 40,
          shares: 38,
          prob_at_entry: 0.8,
          timestamp: 3,
          reason: 'Appraisal trail looks stronger than list.',
        },
      ],
    },
  ], {
    winning_outcome: 'over',
    actual_price: 735000,
    results: [
      { nickname: 'Ada', payout: 48.2, final_balance: 998.2 },
      { nickname: 'Lin', payout: 38, final_balance: 1018 },
    ],
  });

  assert.equal(summary.schema_version, 'room-reputation/v1');
  assert.equal(summary.scoring_model, 'single-room-brier-v1');
  assert.equal(summary.status, 'settled');
  assert.equal(summary.player_count, 2);
  assert.equal(summary.eligible_player_count, 2);
  assert.equal(summary.total_bets, 3);
  assert.equal(summary.reason_count, 2);
  assert.equal(summary.correct_bets, 2);
  assert.equal(summary.accuracy, 0.667);
  assert.equal(summary.average_calibration_score, 84);

  const ada = summary.players.find((player) => player.nickname === 'Ada');
  assert.equal(ada.bet_count, 2);
  assert.equal(ada.correct_bets, 1);
  assert.equal(ada.reason_count, 1);
  assert.equal(ada.average_entry_confidence, 0.65);
  assert.equal(ada.average_brier_score, 0.225);
  assert.equal(ada.calibration_score, 78);
  assert.equal(ada.payout, 48.2);

  assert.equal(summary.top_players[0].nickname, 'Lin');
  assert.equal(summary.top_players[0].calibration_score, 96);
  assert.equal(JSON.stringify(summary).includes('secret-session'), false);
  assert.equal(summary.limitations.some((line) => line.includes('Session IDs')), true);
});

test('public reputation projection keeps the export compact and share-safe', () => {
  const summary = createRoomReputationSummary({
    'private-session-id': {
      session_id: 'private-session-id',
      nickname: 'Maya',
      balance: 980,
      bets: [
        {
          outcome: 'under',
          wager: 20,
          shares: 19,
          prob_at_entry: 0.55,
          timestamp: 1,
          reason: 'Rent comps are soft.',
        },
      ],
    },
  }, {
    winning_outcome: 'under',
    results: [{ nickname: 'Maya', payout: 19, final_balance: 999 }],
  });

  const projection = publicReputationProjection(summary);
  assert.equal(projection.schema_version, 'room-reputation/v1');
  assert.equal(projection.player_count, 1);
  assert.equal(projection.eligible_player_count, 1);
  assert.equal(projection.top_players[0].nickname, 'Maya');
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'players'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'limitations'), false);
  assert.equal(JSON.stringify(projection).includes('private-session-id'), false);
});
