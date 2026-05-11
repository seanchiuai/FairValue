import fs from 'fs';
import path from 'path';
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
    jest.restoreAllMocks();
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
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            degraded: true,
            message: 'Set COGNEE_API_KEY on the server to enable Cognee analysis.',
          }),
      })
    ) as jest.Mock;

    await expect(searchMarketInsights('summarize this room', 'ROOM1')).resolves.toContain(
      'COGNEE_API_KEY'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai/cognee/markets/ROOM1/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
});
