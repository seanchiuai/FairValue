import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './ProfilePage';
import type { UserReputation } from '../types';

const reputation: UserReputation = {
  schema_version: 'fairvalue.userReputation.v1',
  user_id: 'usr_profile_private',
  nickname: 'Profile Ada',
  rooms_played: 1,
  total_bets: 1,
  correct_bets: 1,
  accuracy: 1,
  reason_count: 1,
  total_wagered: 25,
  total_payout: 18,
  average_brier_score: 0.12,
  average_calibration_score: 88,
  market_formats: { binary_over_under: 1 },
  last_settled_at: 1779876000,
  limitations: [],
  recent_rooms: [
    {
      room_code: 'PRF1',
      market_format: 'binary_over_under',
      settled_at: 1779876000,
      nickname: 'Profile Ada',
      winning_outcome: 'over',
      bet_count: 1,
      correct_bets: 1,
      reason_count: 1,
      total_wagered: 25,
      payout: 18,
      average_brier_score: 0.12,
      calibration_score: 88,
    },
  ],
};

let reputationFetchCount = 0;

function createStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  };
}

describe('ProfilePage', () => {
  beforeEach(() => {
    reputationFetchCount = 0;
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    localStorage.setItem(
      'fv_identity_v1',
      JSON.stringify({
        user_id: 'usr_profile_private',
        user_token: 'profile-token',
        nickname: 'Profile Ada',
      })
    );
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me/reputation')) {
        reputationFetchCount += 1;
        expect(init?.headers).toMatchObject({ 'X-FairValue-User-Token': 'profile-token' });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(reputation),
        } as Response);
      }
      if (url.includes('properties.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders private reputation history without exposing identity secrets', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'My prediction profile' })).toBeInTheDocument();
    expect(screen.getAllByText('Profile Ada').length).toBeGreaterThan(0);
    expect(screen.getByTestId('profile-history')).toHaveTextContent('PRF1');
    expect(screen.getByTestId('profile-history')).toHaveTextContent('OVER');
    expect(screen.getByTestId('profile-history')).toHaveTextContent('1/1 correct');
    expect(screen.queryByText('usr_profile_private')).not.toBeInTheDocument();
    expect(screen.queryByText('profile-token')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(reputationFetchCount).toBe(2));
  });
});
