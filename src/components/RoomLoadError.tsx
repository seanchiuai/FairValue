import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = {
  message?: string;
  roomCode?: string;
};

export default function RoomLoadError({ message = 'Room not found', roomCode }: Props) {
  const isNotFound = message === 'Room not found';
  const title = isNotFound ? 'Room not found' : 'Room temporarily unavailable';
  const detail = isNotFound
    ? 'Check the room code or ask the host to create a new room.'
    : message;

  return (
    <div style={s.page}>
      <div
        style={s.card}
        role="alert"
        aria-live="assertive"
        data-testid="room-load-error"
      >
        <AlertTriangle size={24} color="var(--accent-danger)" aria-hidden="true" />
        <div style={s.title}>{title}</div>
        {roomCode && <div style={s.roomCode}>{roomCode}</div>}
        <div style={s.detail}>{detail}</div>
        {!isNotFound && (
          <button style={s.retryButton} onClick={() => window.location.reload()}>
            <RefreshCw size={15} aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
    boxShadow: '0 14px 40px rgba(0,0,0,0.16)',
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
  },
  roomCode: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 4,
    color: 'var(--accent-primary)',
  },
  detail: {
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.45,
  },
  retryButton: {
    marginTop: 6,
    minHeight: 42,
    padding: '10px 16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
