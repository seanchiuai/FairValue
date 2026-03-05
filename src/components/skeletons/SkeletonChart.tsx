import React from 'react';
import SkeletonPulse from './SkeletonPulse';

export default function SkeletonChart() {
  return (
    <div style={s.card}>
      <div style={s.header}>
        <SkeletonPulse width={150} height={16} />
        <SkeletonPulse width={100} height={12} />
      </div>
      <SkeletonPulse height={200} borderRadius={8} />
      <div style={s.stats}>
        <SkeletonPulse height={50} borderRadius={8} />
        <SkeletonPulse height={50} borderRadius={8} />
        <SkeletonPulse height={50} borderRadius={8} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginTop: 4,
  },
};
