import React from 'react';
import { Trophy, DollarSign } from 'lucide-react';
import type { PlayerData } from '../../types';

export default function Leaderboard({ players }: { players: PlayerData[] }) {
  return (
    <div style={s.card}>
      <div style={s.title}>
        <Trophy size={14} color="var(--accent-warning)" /> Leaderboard
      </div>
      {players.length === 0 && (
        <div style={s.empty}>Waiting for players...</div>
      )}
      {players.map((p, i) => (
        <div key={p.session_id} style={s.row}>
          <span style={s.rank}>#{i + 1}</span>
          <span style={s.name}>{p.nickname}</span>
          <span style={s.balance}>
            <DollarSign size={12} />{p.balance.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    padding: 16,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  empty: {
    fontSize: 13,
    color: 'var(--text-muted)',
    padding: '8px 0',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 14,
  },
  rank: {
    fontWeight: 700,
    color: 'var(--text-muted)',
    minWidth: 24,
    fontSize: 12,
  },
  name: {
    flex: 1,
    fontWeight: 600,
  },
  balance: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontWeight: 700,
    color: 'var(--accent-warning)',
  },
};
