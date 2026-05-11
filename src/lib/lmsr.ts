export const DEFAULT_B = 100.0;
const IMPLIED_VALUE_RANGE = 0.10;

function assertFiniteNumber(value: number, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

function assertNonNegativeNumber(value: number, name: string): number {
  const parsed = assertFiniteNumber(value, name);
  if (parsed < 0) throw new Error(`${name} must be non-negative`);
  return parsed;
}

function assertPositiveNumber(value: number, name: string): number {
  const parsed = assertFiniteNumber(value, name);
  if (parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function normalizeOutcome(outcome: Outcome): Outcome {
  const normalized = String(outcome || '').trim().toLowerCase();
  if (normalized !== 'over' && normalized !== 'under') {
    throw new Error("Outcome must be 'over' or 'under'");
  }
  return normalized;
}

export type Outcome = 'over' | 'under';

export interface ExecuteBuyResult {
  cost: number;
  newQOver: number;
  newQUnder: number;
  newProbOver: number;
}

export function costFunction(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  const over = assertFiniteNumber(qOver, 'qOver');
  const under = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const scaledOver = over / liquidity;
  const scaledUnder = under / liquidity;
  const maxScaled = Math.max(scaledOver, scaledUnder);
  return liquidity * (maxScaled + Math.log(Math.exp(scaledOver - maxScaled) + Math.exp(scaledUnder - maxScaled)));
}

export function priceOver(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  const over = assertFiniteNumber(qOver, 'qOver');
  const under = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const diff = (under - over) / liquidity;
  if (diff > 709) return 0;
  if (diff < -709) return 1;
  return 1 / (1 + Math.exp(diff));
}

export function priceUnder(qOver: number, qUnder: number, b: number = DEFAULT_B): number {
  return 1 - priceOver(qOver, qUnder, b);
}

export function calculateImpliedPrice(probOver: number, askingPrice: number): number {
  const probability = assertFiniteNumber(probOver, 'probOver');
  const asking = assertPositiveNumber(askingPrice, 'askingPrice');
  if (probability < 0 || probability > 1) throw new Error('probOver must be between 0 and 1');
  return asking + (probability - 0.5) * 2 * asking * IMPLIED_VALUE_RANGE;
}

export function buyWithBudget(
  outcome: Outcome,
  budget: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): number {
  const normalizedOutcome = normalizeOutcome(outcome);
  const spend = assertNonNegativeNumber(budget, 'budget');
  const currentQOver = assertFiniteNumber(qOver, 'qOver');
  const currentQUnder = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  if (spend === 0) return 0;

  let lo = 0;
  let hi = spend * 10;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const cost = normalizedOutcome === 'over'
      ? costFunction(currentQOver + mid, currentQUnder, liquidity) - costFunction(currentQOver, currentQUnder, liquidity)
      : costFunction(currentQOver, currentQUnder + mid, liquidity) - costFunction(currentQOver, currentQUnder, liquidity);

    if (Math.abs(cost - spend) < 0.001) return mid;
    if (cost < spend) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function executeBuy(
  outcome: Outcome,
  shares: number,
  qOver: number,
  qUnder: number,
  b: number = DEFAULT_B
): ExecuteBuyResult {
  const normalizedOutcome = normalizeOutcome(outcome);
  const purchasedShares = assertNonNegativeNumber(shares, 'shares');
  const currentQOver = assertFiniteNumber(qOver, 'qOver');
  const currentQUnder = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const oldCost = costFunction(currentQOver, currentQUnder, liquidity);
  const newQOver = normalizedOutcome === 'over' ? currentQOver + purchasedShares : currentQOver;
  const newQUnder = normalizedOutcome === 'under' ? currentQUnder + purchasedShares : currentQUnder;
  const newCost = costFunction(newQOver, newQUnder, liquidity);
  const cost = newCost - oldCost;
  const newProbOver = priceOver(newQOver, newQUnder, liquidity);

  return { cost, newQOver, newQUnder, newProbOver };
}
