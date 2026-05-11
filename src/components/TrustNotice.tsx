import React from 'react';
import { ShieldCheck } from 'lucide-react';

type TrustNoticeTone = 'light' | 'dark';

type TrustNoticeProps = {
  testId?: string;
  title?: string;
  tone?: TrustNoticeTone;
  compact?: boolean;
  points?: string[];
};

const DEFAULT_POINTS = [
  'Simulation credits only; no real-money trades or investment products.',
  'Fair value is market-implied, not an appraisal.',
  'Settlement should use actual sale or appraisal evidence and is preserved in the room event history.',
];

export default function TrustNotice({
  testId,
  title = 'FairValue trust note',
  tone = 'light',
  compact = false,
  points = DEFAULT_POINTS,
}: TrustNoticeProps) {
  const dark = tone === 'dark';
  return (
    <section
      style={{
        ...s.card,
        ...(dark ? s.cardDark : s.cardLight),
        padding: compact ? 12 : 14,
      }}
      aria-label={title}
      data-testid={testId}
    >
      <div style={s.header}>
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <ul style={{ ...s.list, gap: compact ? 4 : 6 }}>
        {points.map((point) => (
          <li key={point} style={s.item}>{point}</li>
        ))}
      </ul>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    width: '100%',
    textAlign: 'left',
    borderRadius: 10,
    border: '1px solid',
  },
  cardLight: {
    background: 'rgba(238, 246, 255, 0.74)',
    borderColor: 'rgba(0, 95, 204, 0.22)',
    color: '#18324A',
  },
  cardDark: {
    background: 'rgba(0, 95, 204, 0.08)',
    borderColor: 'rgba(0, 95, 204, 0.18)',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 7,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: 18,
    margin: 0,
  },
  item: {
    fontSize: 12,
    lineHeight: 1.45,
  },
};
