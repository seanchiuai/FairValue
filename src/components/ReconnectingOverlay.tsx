import React from 'react';
import type { ConnectionState } from '../hooks/useWebSocket';

interface Props {
  state: ConnectionState;
  wasConnected: boolean;
}

export default function ReconnectingOverlay({ state, wasConnected }: Props) {
  // Only show after a disconnect, not on initial connect
  if (!wasConnected) return null;
  if (state === 'connected') return null;

  const isFailed = state === 'failed';

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        {!isFailed && <div style={s.spinner} />}
        <div style={s.text}>
          {isFailed ? 'Connection lost' : 'Reconnecting...'}
        </div>
        {isFailed && (
          <button style={s.button} onClick={() => window.location.reload()}>
            Reload
          </button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '24px 32px',
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '3px solid var(--border-subtle)',
    borderTopColor: 'var(--accent-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  text: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  button: {
    padding: '8px 20px',
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
};
