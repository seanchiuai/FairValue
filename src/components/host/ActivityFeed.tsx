import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Bot, Users, Gavel } from 'lucide-react';
import type { ActivityEntry } from '../../types';

export default function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  const recentActivity = useMemo(
    () => [...activity].reverse().slice(0, 30),
    [activity]
  );

  return (
    <div style={s.card}>
      <div style={s.title}>Activity</div>
      <div style={s.list}>
        {recentActivity.length === 0 && (
          <div style={s.empty}>No activity yet</div>
        )}
        {recentActivity.map((a, i) => (
          <div key={i} style={s.item}>
            {a.type === 'bet' && (
              <>
                {a.outcome === 'over' ? (
                  <TrendingUp size={12} color="var(--accent-success)" />
                ) : (
                  <TrendingDown size={12} color="var(--accent-danger)" />
                )}
                <span>
                  <strong>{a.nickname}</strong> bet ${a.wager?.toFixed(0)} on{' '}
                  <span
                    style={{
                      color: a.outcome === 'over' ? 'var(--accent-success)' : 'var(--accent-danger)',
                      fontWeight: 700,
                    }}
                  >
                    {a.outcome?.toUpperCase()}
                  </span>
                </span>
              </>
            )}
            {a.type === 'ai_trade' && (
              <>
                <Bot size={12} color="var(--accent-primary)" />
                <span>
                  AI bet ${a.wager?.toFixed(0)} on{' '}
                  <span
                    style={{
                      color: a.outcome === 'over' ? 'var(--accent-success)' : 'var(--accent-danger)',
                      fontWeight: 700,
                    }}
                  >
                    {a.outcome?.toUpperCase()}
                  </span>
                </span>
              </>
            )}
            {a.type === 'join' && (
              <>
                <Users size={12} color="var(--text-muted)" />
                <span><strong>{a.nickname}</strong> joined</span>
              </>
            )}
            {a.type === 'settle' && (
              <>
                <Gavel size={12} color="var(--accent-warning)" />
                <span>
                  Market settled — <strong>{a.winning_outcome?.toUpperCase()}</strong> wins
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    padding: 16,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    flex: 1,
    overflow: 'hidden',
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 400,
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text-secondary)',
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
};
