const marketEngine = require('./marketEngine');

export const DEFAULT_B: number = marketEngine.DEFAULT_B;

export type Outcome = 'over' | 'under';

export interface ExecuteBuyResult {
  cost: number;
  newQOver: number;
  newQUnder: number;
  newProbOver: number;
}

export function costFunction(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return marketEngine.costFunction(qOver, qUnder, b);
}

export function priceOver(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return marketEngine.priceOver(qOver, qUnder, b);
}

export function priceUnder(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return marketEngine.priceUnder(qOver, qUnder, b);
}

export function calculateImpliedPrice(probOver: number, askingPrice: number): number {
  return marketEngine.calculateImpliedPrice(probOver, askingPrice);
}

export function buyWithBudget(
  outcome: Outcome,
  budget: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): number {
  return marketEngine.buyWithBudget(outcome, budget, qOver, qUnder, b);
}

export function executeBuy(
  outcome: Outcome,
  shares: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): ExecuteBuyResult {
  return marketEngine.executeBuy(outcome, shares, qOver, qUnder, b);
}
