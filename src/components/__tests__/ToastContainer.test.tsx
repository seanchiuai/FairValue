import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ToastContainer from '../ToastContainer';
import { ToastProvider, useToast } from '../../contexts/ToastContext';

function ToastHarness() {
  const { showToast } = useToast();

  return (
    <>
      <button onClick={() => showToast('Room join failed', 'error', 60_000)}>
        Show error
      </button>
      <button onClick={() => showToast('Room synced', 'success', 60_000)}>
        Show success
      </button>
      <ToastContainer />
    </>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <ToastHarness />
    </ToastProvider>
  );
}

describe('ToastContainer', () => {
  it('announces error toasts assertively and exposes a specific dismiss control', () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Show error' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(within(alert).getByText('Room join failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error notification: Room join failed' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces non-error toasts politely', () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Show success' }));

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(within(status).getByText('Room synced')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss success notification: Room synced' })).toBeInTheDocument();
  });
});
