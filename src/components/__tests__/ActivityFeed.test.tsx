import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ActivityFeed from '../host/ActivityFeed';

describe('ActivityFeed', () => {
  it('renders public bet reasons under bet activity', () => {
    render(
      <ActivityFeed
        activity={[
          {
            type: 'bet',
            nickname: 'Ada',
            outcome: 'over',
            wager: 50,
            reason: 'Local comps support the ask.',
            timestamp: 1,
          },
        ]}
      />
    );

    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText('"Local comps support the ask."')).toBeInTheDocument();
  });
});
