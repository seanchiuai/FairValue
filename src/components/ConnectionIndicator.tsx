import React from 'react';
import type { ConnectionState } from '../hooks/useWebSocket';

const CONFIG: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: 'var(--accent-success)', label: 'Connected' },
  connecting: { color: 'var(--accent-warning)', label: 'Reconnecting...' },
  disconnected: { color: 'var(--accent-warning)', label: 'Reconnecting...' },
  failed: { color: 'var(--accent-danger)', label: 'Disconnected' },
};

export default function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const { color, label } = CONFIG[state];

  return (
    <div style={s.pill} role="status" aria-live="polite">
      <span style={{ ...s.dot, background: color }} />
      <span style={s.label}>{label}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 980,
    background: 'var(--bg-input)',
    fontSize: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
};
