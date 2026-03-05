import React from 'react';
import SkeletonPulse from './SkeletonPulse';

export default function SkeletonCard() {
  return (
    <div style={s.card}>
      <SkeletonPulse height={180} borderRadius={12} />
      <div style={s.body}>
        <SkeletonPulse width="60%" height={20} />
        <SkeletonPulse width="80%" height={14} />
        <SkeletonPulse width="40%" height={14} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
  },
  body: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
};
