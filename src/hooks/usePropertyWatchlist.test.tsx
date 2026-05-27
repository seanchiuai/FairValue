import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROPERTY_WATCHLIST_STORAGE_KEY,
  readPropertyWatchlist,
  usePropertyWatchlist,
} from './usePropertyWatchlist';

function createStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  };
}

function WatchlistHarness({ userToken = '' }: { userToken?: string }) {
  const { watchlistItems, syncStatus, isWatched, toggleProperty, removeProperty } = usePropertyWatchlist({ userToken });
  const watched = isWatched('123');
  return (
    <div>
      <span data-testid="watchlist-count">{watchlistItems.length}</span>
      <span data-testid="sync-status">{syncStatus}</span>
      <span data-testid="watch-state">{watched ? 'watched' : 'not watched'}</span>
      <button type="button" onClick={() => toggleProperty('123')}>
        Toggle
      </button>
      <button type="button" onClick={() => removeProperty('123')}>
        Remove
      </button>
    </div>
  );
}

describe('usePropertyWatchlist', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes persisted items and deduplicates property ids', () => {
    localStorage.setItem(PROPERTY_WATCHLIST_STORAGE_KEY, JSON.stringify([
      { property_id: '123', added_at: 10 },
      { property_id: '123', added_at: 5 },
      { property_id: '', added_at: 8 },
      { property_id: '456', added_at: 20 },
    ]));

    expect(readPropertyWatchlist()).toEqual([
      { property_id: '456', added_at: 20, note: null, alert_below: null, alert_above: null },
      { property_id: '123', added_at: 10, note: null, alert_below: null, alert_above: null },
    ]);
  });

  it('toggles watched properties and persists the browser-local list', async () => {
    render(<WatchlistHarness />);

    expect(screen.getByTestId('watchlist-count')).toHaveTextContent('0');
    expect(screen.getByTestId('watch-state')).toHaveTextContent('not watched');

    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('watchlist-count')).toHaveTextContent('1');
    expect(screen.getByTestId('watch-state')).toHaveTextContent('watched');
    expect(localStorage.setItem).toHaveBeenCalledWith(
      PROPERTY_WATCHLIST_STORAGE_KEY,
      expect.stringContaining('"property_id":"123"')
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByTestId('watchlist-count')).toHaveTextContent('0');
    expect(screen.getByTestId('watch-state')).toHaveTextContent('not watched');
  });

  it('merges server-backed watchlist state and uploads local-only items', async () => {
    localStorage.setItem(PROPERTY_WATCHLIST_STORAGE_KEY, JSON.stringify([
      { property_id: '123', added_at: 10 },
    ]));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me/watchlist') {
        expect(init?.headers).toMatchObject({ 'X-FairValue-User-Token': 'signed-token' });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            watchlist: [
              { property_id: '999', added_at: 20, note: 'Server note', alert_above: 950000 },
            ],
          }),
        } as Response);
      }
      if (url === '/api/me/watchlist/123') {
        expect(init?.method).toBe('PUT');
        expect(init?.headers).toMatchObject({ 'X-FairValue-User-Token': 'signed-token' });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WatchlistHarness userToken="signed-token" />);

    await waitFor(() => expect(screen.getByTestId('sync-status')).toHaveTextContent('synced'));
    expect(screen.getByTestId('watchlist-count')).toHaveTextContent('2');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/me/watchlist/123',
      expect.objectContaining({ method: 'PUT' })
    ));
  });
});
