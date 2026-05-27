import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PlayerReputationPanel from '../player/PlayerReputationPanel';
import type { UserReputation } from '../../types';

const reputation: UserReputation = {
  schema_version: 'fairvalue.userReputation.v1',
  user_id: 'usr_private',
  nickname: 'Ada',
  rooms_played: 2,
  total_bets: 3,
  correct_bets: 2,
  accuracy: 0.667,
  reason_count: 2,
  total_wagered: 125,
  total_payout: 72,
  average_brier_score: 0.24,
  average_calibration_score: 76,
  market_formats: { binary_over_under: 2 },
  last_settled_at: 1779876000,
  limitations: [],
  recent_rooms: [
    {
      room_code: 'AB12',
      market_format: 'binary_over_under',
      settled_at: 1779876000,
      nickname: 'Ada',
      winning_outcome: 'over',
      bet_count: 2,
      correct_bets: 1,
      reason_count: 1,
      total_wagered: 75,
      payout: 40,
      average_brier_score: 0.25,
      calibration_score: 75,
    },
  ],
};

describe('PlayerReputationPanel', () => {
  it('renders private cross-room reputation without exposing the user id', async () => {
    const onRefresh = vi.fn();
    render(
      <PlayerReputationPanel
        reputation={reputation}
        loading={false}
        error=""
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText('My prediction record')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('76/100')).toBeInTheDocument();
    expect(screen.getByText('AB12')).toBeInTheDocument();
    expect(screen.getByText('1/2 correct')).toBeInTheDocument();
    expect(screen.queryByText('usr_private')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh private reputation' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the empty settled-room state', () => {
    render(
      <PlayerReputationPanel
        reputation={{ ...reputation, rooms_played: 0, recent_rooms: [], total_bets: 0, accuracy: null }}
        loading={false}
        error=""
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('No settled rooms yet.')).toBeInTheDocument();
  });
});
