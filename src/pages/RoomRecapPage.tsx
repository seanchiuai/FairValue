import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, ListChecks, RadioTower, ShieldCheck, Sparkles } from 'lucide-react';
import RoomLoadError from '../components/RoomLoadError';
import { generatePublicRoomRecap } from '../lib/publicRoomRecap';
import {
  getRoomStateError,
  readRoomMutationResponse,
  type RoomMutationResponse,
} from '../lib/roomResponses';

export default function RoomRecapPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [roomState, setRoomState] = useState<RoomMutationResponse | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    setLoadingState(true);
    setLoadError('');

    fetch(`/api/rooms/${roomCode}/state`)
      .then(async (response) => {
        const data = await readRoomMutationResponse(response);
        const error = getRoomStateError(response, data);
        if (cancelled) return;
        if (error) {
          setLoadError(error);
          return;
        }
        setRoomState(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Room state unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoadingState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  const recap = useMemo(() => {
    if (!roomCode || !roomState?.house || !roomState.market || !Array.isArray(roomState.players)) {
      return null;
    }
    return generatePublicRoomRecap({
      roomCode,
      house: roomState.house,
      market: roomState.market,
      players: roomState.players,
      activity: roomState.activity || [],
      draftAudit: roomState.draft_audit || null,
      settled: Boolean(roomState.settled),
      settlement: roomState.settlement || null,
    });
  }, [roomCode, roomState]);

  if (loadingState) {
    return (
      <main style={s.page} role="status" aria-live="polite">
        <div style={s.loading}>Loading public recap...</div>
      </main>
    );
  }

  if (loadError || !recap) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  return (
    <main style={s.page} data-testid="room-public-recap-page">
      <header style={s.header}>
        <div>
          <Link to={roomCode ? `/play/${roomCode}` : '/join'} style={s.backLink}>
            <ArrowLeft size={15} aria-hidden="true" /> Room
          </Link>
          <div style={s.kicker}>Public Recap</div>
          <h1 style={s.title}>{recap.headline}</h1>
          <p style={s.summary} data-testid="room-public-recap-summary">{recap.summary}</p>
        </div>
        <div style={s.statusRail}>
          <span style={{
            ...s.statusPill,
            ...(recap.status === 'settled' ? s.statusSettled : s.statusLive),
          }}>
            {recap.status}
          </span>
          <span style={s.roomCode}>{roomCode}</span>
        </div>
      </header>

      <section style={s.heroPanel} aria-label="Recap highlights" data-testid="room-public-recap-highlights">
        <h2 style={s.panelTitle}>
          <Sparkles size={17} aria-hidden="true" /> Share-safe highlights
        </h2>
        <ul style={s.highlightList}>
          {recap.highlights.map((item, index) => (
            <li key={`highlight-${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </section>

      <div style={s.contentGrid}>
        <section style={s.panel} aria-label="Public evidence" data-testid="room-public-recap-evidence">
          <h2 style={s.panelTitle}>
            <ClipboardCheck size={17} aria-hidden="true" /> Public evidence
          </h2>
          <div style={s.evidenceList}>
            {recap.evidence.map((item) => (
              <article key={item.label} style={s.evidenceItem}>
                <span style={s.evidenceLabel}>{item.label}</span>
                <strong style={s.evidenceValue}>{item.value}</strong>
                <p style={s.evidenceDetail}>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={s.panel} aria-label="Public timeline" data-testid="room-public-recap-timeline">
          <h2 style={s.panelTitle}>
            <RadioTower size={17} aria-hidden="true" /> Public timeline
          </h2>
          <ol style={s.timeline}>
            {recap.timeline.map((item, index) => (
              <li key={`timeline-${index}-${item.label}-${item.detail}`} style={s.timelineItem}>
                <span style={s.sequence}>#{index + 1}</span>
                <div>
                  <strong style={s.timelineLabel}>{item.label}</strong>
                  <p style={s.timelineDetail}>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section style={s.panel} aria-label="Recap guardrails" data-testid="room-public-recap-guardrails">
          <h2 style={s.panelTitle}>
            <ShieldCheck size={17} aria-hidden="true" /> Guardrails
          </h2>
          <ul style={s.guardrailList}>
            {recap.guardrails.map((item, index) => (
              <li key={`guardrail-${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <section style={s.footerNote} aria-label="Share limits">
        <ListChecks size={15} aria-hidden="true" />
        Public recaps are generated from public room state only. Use the host operator review for private audit/event-log inspection.
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    padding: '22px 24px 32px',
  },
  loading: {
    minHeight: '70vh',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-secondary)',
  },
  header: {
    maxWidth: 1180,
    margin: '0 auto 16px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'start',
    gap: 20,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 14,
  },
  kicker: {
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  summary: {
    maxWidth: 820,
    margin: '8px 0 0',
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  statusRail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  statusPill: {
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  statusSettled: {
    background: 'rgba(11,111,50,0.12)',
    color: 'var(--accent-success)',
  },
  statusLive: {
    background: 'rgba(0,95,204,0.11)',
    color: 'var(--accent-primary)',
  },
  roomCode: {
    color: 'var(--accent-primary)',
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 4,
  },
  heroPanel: {
    maxWidth: 1180,
    margin: '0 auto 16px',
    padding: 16,
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
  },
  contentGrid: {
    maxWidth: 1180,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
  },
  panel: {
    padding: 16,
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    minWidth: 0,
  },
  panelTitle: {
    margin: '0 0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-primary)',
    fontSize: 15,
    fontWeight: 900,
  },
  highlightList: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.55,
  },
  evidenceList: {
    display: 'grid',
    gap: 10,
  },
  evidenceItem: {
    paddingBottom: 10,
    borderBottom: '1px solid var(--border-subtle)',
  },
  evidenceLabel: {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  evidenceValue: {
    display: 'block',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.35,
  },
  evidenceDetail: {
    margin: '4px 0 0',
    color: 'var(--text-secondary)',
    fontSize: 12,
    lineHeight: 1.45,
  },
  timeline: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 10,
  },
  timelineItem: {
    display: 'grid',
    gridTemplateColumns: '42px 1fr',
    gap: 10,
    alignItems: 'start',
  },
  sequence: {
    color: 'var(--accent-primary)',
    fontSize: 12,
    fontWeight: 900,
  },
  timelineLabel: {
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  timelineDetail: {
    margin: '2px 0 0',
    color: 'var(--text-secondary)',
    fontSize: 12,
    lineHeight: 1.4,
  },
  guardrailList: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1.55,
  },
  footerNote: {
    maxWidth: 1180,
    margin: '16px auto 0',
    padding: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-secondary)',
    fontSize: 12,
  },
};
