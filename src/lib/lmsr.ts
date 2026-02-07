/**
 * Shared LMSR (Logarithmic Market Scoring Rule) math utilities.
 * All functions are pure/stateless with `b` defaulting to DEFAULT_B.
 */

export const DEFAULT_B = 100.0;

export function costFunction(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return b * Math.log(Math.exp(qOver / b) + Math.exp(qUnder / b));
}

export function priceOver(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  const expOver = Math.exp(qOver / b);
  const expUnder = Math.exp(qUnder / b);
  return expOver / (expOver + expUnder);
}

export function priceUnder(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return 1.0 - priceOver(qOver, qUnder, b);
}

export function calculateImpliedPrice(probOver: number, askingPrice: number): number {
  return askingPrice + (probOver - 0.5) * 2 * askingPrice * 0.10;
}

export function buyWithBudget(
  outcome: 'over' | 'under',
  budget: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): number {
  let lo = 0.0;
  let hi = budget * 10;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    let cost: number;

    if (outcome === 'over') {
      cost = costFunction(qOver + mid, qUnder, b) - costFunction(qOver, qUnder, b);
    } else {
      cost = costFunction(qOver, qUnder + mid, b) - costFunction(qOver, qUnder, b);
    }

    if (Math.abs(cost - budget) < 0.001) {
      return mid;
    }

    if (cost < budget) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

export interface ExecuteBuyResult {
  cost: number;
  newQOver: number;
  newQUnder: number;
  newProbOver: number;
}

export function executeBuy(
  outcome: 'over' | 'under',
  shares: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): ExecuteBuyResult {
  const oldCost = costFunction(qOver, qUnder, b);
  const newQOver = outcome === 'over' ? qOver + shares : qOver;
  const newQUnder = outcome === 'under' ? qUnder + shares : qUnder;
  const newCost = costFunction(newQOver, newQUnder, b);
  const cost = newCost - oldCost;
  const newProbOver = priceOver(newQOver, newQUnder, b);

  return { cost, newQOver, newQUnder, newProbOver };
}
