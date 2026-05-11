import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { House } from '../../types';
import { buildHostAuthHeaders } from '../../lib/fairValueAuth';
import { useToast } from '../../contexts/ToastContext';

interface SettleModalProps {
  house: House;
  roomCode: string;
  hostToken: string;
  userToken?: string;
  onClose: () => void;
}

export default function SettleModal({ house, roomCode, hostToken, userToken, onClose }: SettleModalProps) {
  const [actualPrice, setActualPrice] = useState('');
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSettle = useCallback(async () => {
    if (!actualPrice) {
      setError('Actual price is required');
      return;
    }
    const price = parseFloat(actualPrice.replace(/,/g, ''));
    if (isNaN(price) || price <= 0 || price > 100_000_000) {
      setError('Enter a valid actual price (up to $100M)');
      return;
    }
    const authHeaders = buildHostAuthHeaders({ userToken, hostToken });
    if (!Object.keys(authHeaders).length) {
      setError('Host authority missing for this room');
      return;
    }
    setSettling(true);
    setError('');
    try {
      const res = await fetch(`/api/rooms/${roomCode}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ actual_price: price }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        showToast(data.error, 'error');
        return;
      }
      showToast('Market settled.', 'success');
      onClose();
    } catch {
      const message = 'Settlement failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSettling(false);
    }
  }, [roomCode, hostToken, userToken, actualPrice, onClose, showToast]);

  return (
    <div
      style={s.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settle-title"
      aria-describedby="settle-desc"
    >
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 id="settle-title" style={s.title}>Settle Market</h3>
        <p id="settle-desc" style={s.desc}>
          Enter the actual appraisal/sale price to determine the winner.
        </p>
        <div style={s.field}>
          <label style={s.label} htmlFor="settle-actual-price">Actual Price ($)</label>
          <input
            id="settle-actual-price"
            ref={inputRef}
            style={s.input}
            value={actualPrice}
            onChange={(e) => setActualPrice(e.target.value)}
            aria-label="Actual price"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'settle-error' : undefined}
            placeholder="450,000"
            inputMode="numeric"
            aria-required="true"
          />
        </div>
        <p style={s.hint}>
          Asking: ${house.asking_price.toLocaleString()} —{' '}
          {actualPrice && !isNaN(parseFloat(actualPrice.replace(/,/g, '')))
            ? parseFloat(actualPrice.replace(/,/g, '')) >= house.asking_price
              ? 'OVER wins'
              : 'UNDER wins'
            : 'enter a price'}
        </p>
        {error && <p id="settle-error" style={s.error} role="alert">{error}</p>}
        <div style={s.buttons}>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.confirm, opacity: settling ? 0.6 : 1 }}
            onClick={handleSettle}
            disabled={settling || (!hostToken && !userToken)}
          >
            {settling ? 'Settling...' : 'Confirm Settlement'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    padding: 24,
    width: 380,
    maxWidth: '90vw',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  desc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: '0 0 16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '12px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 18,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: {
    fontSize: 13,
    color: 'var(--text-muted)',
    margin: '0 0 16px',
  },
  error: {
    fontSize: 13,
    color: 'var(--accent-danger)',
    margin: '0 0 16px',
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
  cancel: {
    flex: 1,
    padding: '10px',
    background: '#FFFFFF',
    border: '1px solid rgba(0, 0, 0, 0.18)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirm: {
    flex: 1,
    padding: '10px',
    background: 'var(--accent-warning)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
