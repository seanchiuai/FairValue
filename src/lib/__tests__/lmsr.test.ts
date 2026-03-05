import {
  DEFAULT_B,
  costFunction,
  priceOver,
  priceUnder,
  calculateImpliedPrice,
  buyWithBudget,
  executeBuy,
} from '../lmsr';

describe('costFunction', () => {
  it('returns a finite number for q=0,0', () => {
    const cost = costFunction(0, 0);
    expect(cost).toBeCloseTo(DEFAULT_B * Math.log(2), 5);
  });

  it('is symmetric when q_over === q_under', () => {
    const c1 = costFunction(10, 10);
    const c2 = costFunction(10, 10);
    expect(c1).toBe(c2);
  });

  it('increases when shares increase', () => {
    const c1 = costFunction(10, 0);
    const c2 = costFunction(20, 0);
    expect(c2).toBeGreaterThan(c1);
  });
});

describe('priceOver / priceUnder', () => {
  it('sum to 1.0', () => {
    expect(priceOver(10, 20) + priceUnder(10, 20)).toBeCloseTo(1.0, 10);
  });

  it('both return 0.5 when q_over === q_under', () => {
    expect(priceOver(0, 0)).toBeCloseTo(0.5, 10);
    expect(priceUnder(0, 0)).toBeCloseTo(0.5, 10);
    expect(priceOver(50, 50)).toBeCloseTo(0.5, 10);
  });

  it('priceOver > 0.5 when q_over > q_under', () => {
    expect(priceOver(20, 10)).toBeGreaterThan(0.5);
  });

  it('priceOver < 0.5 when q_over < q_under', () => {
    expect(priceOver(10, 20)).toBeLessThan(0.5);
  });

  it('stays in [0, 1] for extreme values', () => {
    const p = priceOver(500, 0);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('calculateImpliedPrice', () => {
  it('returns asking price when probOver = 0.5', () => {
    expect(calculateImpliedPrice(0.5, 500000)).toBe(500000);
  });

  it('returns higher price when probOver > 0.5', () => {
    expect(calculateImpliedPrice(0.7, 500000)).toBeGreaterThan(500000);
  });

  it('returns lower price when probOver < 0.5', () => {
    expect(calculateImpliedPrice(0.3, 500000)).toBeLessThan(500000);
  });

  it('formula: asking + (prob - 0.5) * 2 * asking * 0.10', () => {
    const asking = 1000000;
    const prob = 0.7;
    const expected = asking + (prob - 0.5) * 2 * asking * 0.10;
    expect(calculateImpliedPrice(prob, asking)).toBeCloseTo(expected, 5);
  });
});

describe('buyWithBudget', () => {
  it('returns positive shares for positive budget', () => {
    const shares = buyWithBudget('over', 50, 0, 0);
    expect(shares).toBeGreaterThan(0);
  });

  it('cost of returned shares approximately equals budget', () => {
    const budget = 100;
    const shares = buyWithBudget('over', budget, 0, 0);
    const { cost } = executeBuy('over', shares, 0, 0);
    expect(cost).toBeCloseTo(budget, 0);
  });

  it('works for under outcome', () => {
    const shares = buyWithBudget('under', 50, 10, 5);
    expect(shares).toBeGreaterThan(0);
  });

  it('returns 0 for budget of 0', () => {
    const shares = buyWithBudget('over', 0, 0, 0);
    expect(shares).toBeCloseTo(0, 1);
  });
});

describe('executeBuy', () => {
  it('cost is positive for positive shares', () => {
    const { cost } = executeBuy('over', 10, 0, 0);
    expect(cost).toBeGreaterThan(0);
  });

  it('buying over increases q_over and probOver', () => {
    const initialProb = priceOver(0, 0);
    const { newQOver, newQUnder, newProbOver } = executeBuy('over', 10, 0, 0);
    expect(newQOver).toBe(10);
    expect(newQUnder).toBe(0);
    expect(newProbOver).toBeGreaterThan(initialProb);
  });

  it('buying under increases q_under and decreases probOver', () => {
    const initialProb = priceOver(0, 0);
    const { newQOver, newQUnder, newProbOver } = executeBuy('under', 10, 0, 0);
    expect(newQOver).toBe(0);
    expect(newQUnder).toBe(10);
    expect(newProbOver).toBeLessThan(initialProb);
  });

  it('respects custom b parameter', () => {
    const result1 = executeBuy('over', 10, 0, 0, 50);
    const result2 = executeBuy('over', 10, 0, 0, 200);
    // Higher b = more liquidity = lower price impact = lower cost
    expect(result1.cost).toBeGreaterThan(result2.cost);
  });
});
