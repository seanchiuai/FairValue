import React from 'react';
import SkeletonPulse from './SkeletonPulse';

export default function SkeletonLeaderboard() {
  return (
    <div style={s.card}>
      <SkeletonPulse width={120} height={14} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={s.row}>
          <SkeletonPulse width={24} height={14} />
          <SkeletonPulse width="50%" height={14} />
          <SkeletonPulse width={60} height={14} />
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
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 0',
  },
};
