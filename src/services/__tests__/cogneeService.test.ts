import fs from 'fs';
import path from 'path';
import { vi } from 'vitest';
import { searchMarketInsights } from '../cogneeService';

const clientHeaderName = ['X-Api', 'Key'].join('-');
const leakedCogneeKey = ['eb6226f5d948d3a48e1c5867043fc5fba', '7573ec9db11a56f'].join('');

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

describe('Cognee client secret boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not keep the previously exposed secret literal in client source', () => {
    const srcRoot = path.resolve(__dirname, '../..');
    const offenders = collectSourceFiles(srcRoot).filter((file) => {
      if (file.endsWith('cogneeService.test.ts')) return false;
      return fs.readFileSync(file, 'utf8').includes(leakedCogneeKey);
    });

    expect(offenders).toEqual([]);
  });

  it('does not configure Cognee credential headers from browser code', () => {
    const srcRoot = path.resolve(__dirname, '../..');
    const offenders = collectSourceFiles(srcRoot).filter((file) => {
      if (file.endsWith('cogneeService.test.ts')) return false;
      return fs.readFileSync(file, 'utf8').includes(clientHeaderName);
    });

    expect(offenders).toEqual([]);
  });

  it('searches through the local server API and tolerates degraded AI mode', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            degraded: true,
            local_analysis: true,
            content: 'Local AI analyst: Cognee is not configured.',
            citations: [
              {
                label: 'Room market snapshot',
                detail: '60% OVER, 3 trades, $250 simulated volume.',
              },
            ],
            limitations: ['No external comps were queried.'],
          }),
      })
    ) as unknown as typeof fetch;

    await expect(searchMarketInsights('summarize this room', 'ROOM1')).resolves.toMatchObject({
      degraded: true,
      local_analysis: true,
      content: expect.stringContaining('Local AI analyst'),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai/cognee/markets/ROOM1/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('sends local room context for cited degraded analysis', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: 'ok' }),
      })
    ) as unknown as typeof fetch;

    await searchMarketInsights('summarize this room', 'ROOM1', 'GRAPH_COMPLETION', {
      probability_over: 0.6,
      total_trades: 3,
      total_wagered: 250,
      asking_price: 680000,
      implied_fair_value: 693600,
      player_count: 2,
      timestamp: '2026-05-11T13:00:00.000Z',
      recent_bets: [{ nickname: 'Ari', outcome: 'over', wager: 100 }],
    });

    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: 'summarize this room',
      market_context: {
        probability_over: 0.6,
        implied_fair_value: 693600,
        recent_bets: [{ nickname: 'Ari', outcome: 'over', wager: 100 }],
      },
    });
  });
});
