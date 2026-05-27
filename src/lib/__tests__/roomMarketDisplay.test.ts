import { describe, expect, it } from 'vitest';
import {
  formatOutcomeLabel,
  leadingOutcome,
  outcomeProbability,
  rangeSettlementOutcome,
  rentYieldSettlementOutcome,
  rentYieldThresholdLabel,
  roomOutcomeIds,
} from '../roomMarketDisplay';
import type { Market, RoomMarketConfig } from '../../types';

const rangeConfig: RoomMarketConfig = {
  market_format: 'range_price_band',
  band_low: 760000,
  band_high: 840000,
  outcomes: ['below_band', 'inside_band', 'above_band'],
};

const rangeMarket = {
  prob_over: 0,
  prob_under: 0,
  q_over: 0,
  q_under: 0,
  outcomes: [
    { id: 'below_band', q: 0, probability: 0.2 },
    { id: 'inside_band', q: 3, probability: 0.55 },
    { id: 'above_band', q: 0, probability: 0.25 },
  ],
  probabilities: {
    below_band: 0.2,
    inside_band: 0.55,
    above_band: 0.25,
  },
  total_trades: 1,
  total_wagered: 75,
  avg_bet_size: 75,
  b: 100,
} as Market;

const rentYieldConfig: RoomMarketConfig = {
  market_format: 'rent_yield_over_under',
  yield_threshold: 0.05,
  outcomes: ['over', 'under'],
};

describe('roomMarketDisplay', () => {
  it('labels and ranks range market outcomes', () => {
    expect(formatOutcomeLabel('inside_band')).toBe('Inside band');
    expect(roomOutcomeIds(rangeMarket, rangeConfig)).toEqual(['below_band', 'inside_band', 'above_band']);
    expect(outcomeProbability(rangeMarket, 'inside_band')).toBe(0.55);
    expect(leadingOutcome(rangeMarket, rangeConfig)).toEqual({ id: 'inside_band', probability: 0.55 });
  });

  it('maps actual price to range settlement outcome', () => {
    expect(rangeSettlementOutcome(740000, rangeConfig)).toBe('below_band');
    expect(rangeSettlementOutcome(800000, rangeConfig)).toBe('inside_band');
    expect(rangeSettlementOutcome(860000, rangeConfig)).toBe('above_band');
  });

  it('labels and maps rent yield settlement outcomes', () => {
    expect(rentYieldThresholdLabel(rentYieldConfig)).toBe('5%');
    expect(rentYieldSettlementOutcome(48_000, 800_000, rentYieldConfig)).toBe('over');
    expect(rentYieldSettlementOutcome(35_000, 800_000, rentYieldConfig)).toBe('under');
  });
});
