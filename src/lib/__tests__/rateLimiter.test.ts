import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T21:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks after the token bucket is empty and refills one token per second', () => {
    const limiter = new RateLimiter(2, 1);

    expect(limiter.canAct()).toBe(true);
    expect(limiter.canAct()).toBe(true);
    expect(limiter.canAct()).toBe(false);
    expect(limiter.timeUntilNext()).toBe(1000);

    vi.advanceTimersByTime(500);
    expect(limiter.canAct()).toBe(false);
    expect(limiter.timeUntilNext()).toBe(500);

    vi.advanceTimersByTime(500);
    expect(limiter.canAct()).toBe(true);
  });

  it('does not refill beyond the configured burst capacity', () => {
    const limiter = new RateLimiter(2, 1);

    expect(limiter.canAct()).toBe(true);
    vi.advanceTimersByTime(10_000);

    expect(limiter.canAct()).toBe(true);
    expect(limiter.canAct()).toBe(true);
    expect(limiter.canAct()).toBe(false);
  });
});
