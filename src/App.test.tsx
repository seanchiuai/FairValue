import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Markets from './pages/Markets';

// Mock the fetch for properties
beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    if (url.includes('properties.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    if (url.includes('/api/markets/charts')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders Markets page with FairValue branding', async () => {
  render(
    <MemoryRouter>
      <Markets />
    </MemoryRouter>
  );
  await waitFor(() => {
    expect(screen.getByText('FairValue')).toBeInTheDocument();
  });
  expect(screen.getByText('Map View')).toBeInTheDocument();
});
