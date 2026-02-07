/**
 * Client-side contrarian bot engine.
 * Ports the Python AI agent logic from sean/main.py (lines 401-444) to TypeScript.
 */

import { priceOver, executeBuy, ExecuteBuyResult } from './lmsr';

export interface BotConfig {
  intervalMs: number;
  contrarianStrength: number;
  noiseStdDev: number;
  b: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  intervalMs: 5000,
  contrarianStrength: 0.6,
  noiseStdDev: 0.15,
  b: 100,
};

export interface BotTradeResult extends ExecuteBuyResult {
  outcome: 'over' | 'under';
  shares: number;
}

/** Box-Muller transform for Gaussian random numbers. */
function gaussianRandom(mean: number, stdDev: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

const SHARE_SIZES = [1, 2, 3, 5, 8, 10, 15, 20];
const SHARE_WEIGHTS = [25, 20, 15, 12, 8, 8, 7, 5];

function weightedRandomChoice(values: number[], weights: number[]): number {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

/** Pure function: compute a single bot trade given current LMSR state. */
export function computeBotTrade(
  qOver: number,
  qUnder: number,
  config: BotConfig = DEFAULT_BOT_CONFIG
): BotTradeResult {
  const probOver = priceOver(qOver, qUnder, config.b);

  // Mean-reversion contrarian logic (matches Python exactly)
  const noise = gaussianRandom(0, config.noiseStdDev);
  let pBetOver =
    (1.0 - probOver) * config.contrarianStrength +
    0.5 * (1.0 - config.contrarianStrength) +
    noise;
  pBetOver = Math.max(0.05, Math.min(0.95, pBetOver));

  const outcome: 'over' | 'under' = Math.random() < pBetOver ? 'over' : 'under';
  const shares = weightedRandomChoice(SHARE_SIZES, SHARE_WEIGHTS);

  const result = executeBuy(outcome, shares, qOver, qUnder, config.b);
  return { ...result, outcome, shares };
}

/** Start bot engine on an interval. Returns a cleanup function. */
export function startBotEngine(
  getState: () => { qOver: number; qUnder: number },
  onTrade: (trade: BotTradeResult) => void,
  config: BotConfig = DEFAULT_BOT_CONFIG
): () => void {
  const interval = setInterval(() => {
    const { qOver, qUnder } = getState();
    const trade = computeBotTrade(qOver, qUnder, config);
    onTrade(trade);
  }, config.intervalMs);

  return () => clearInterval(interval);
}
