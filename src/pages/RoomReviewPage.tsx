import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ClipboardCheck,
  FileSearch,
  Gauge,
  ListChecks,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import RoomLoadError from '../components/RoomLoadError';
import { useSession } from '../hooks/useSession';
import { buildHostAuthHeaders, readHostToken } from '../lib/fairValueAuth';
import { generateRoomReview } from '../lib/roomReview';
import {
  getRoomStateError,
  readRoomMutationResponse,
  type RoomMutationResponse,
} from '../lib/roomResponses';
import type { RoomEvent } from '../types';

type EventsResponse = {
  error?: string;
  events?: RoomEvent[];
  last_sequence?: number;
};

async function readEventsResponse(response: Response): Promise<EventsResponse> {
  return response.json().catch(() => ({}));
}

export default function RoomReviewPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { sessionId, userToken, identityReady } = useSession();
  const [roomState, setRoomState] = useState<RoomMutationResponse | null>(null);
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [loadingState, setLoadingState] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [eventsError, setEventsError] = useState('');

  const hostToken = useMemo(() => readHostToken(roomCode), [roomCode]);
  const canUseHostIdentity = Boolean(
    identityReady &&
    userToken &&
    roomState?.host_user_id &&
    roomState.host_user_id === sessionId
  );
  const hasHostAuthority = Boolean(hostToken || canUseHostIdentity);
  const hostAuthHeaders = useMemo(
    () => buildHostAuthHeaders({ userToken: canUseHostIdentity ? userToken : '', hostToken }),
    [canUseHostIdentity, userToken, hostToken]
  );

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

  useEffect(() => {
    if (!roomCode || !roomState?.house || !roomState.market) return;
    if (!hasHostAuthority) {
      if (identityReady || hostToken || !roomState.host_user_id) {
        setEvents([]);
        setEventsLoading(false);
        setEventsError('Host authority required to load event history.');
      }
      return;
    }

    let cancelled = false;
    setEventsLoading(true);
    setEventsError('');

    fetch(`/api/rooms/${roomCode}/events`, { headers: hostAuthHeaders })
      .then(async (response) => {
        const data = await readEventsResponse(response);
        if (cancelled) return;
        if (!response.ok || data.error) {
          setEvents([]);
          setEventsError(data.error || 'Event history unavailable');
          return;
        }
        if (!Array.isArray(data.events)) {
          setEvents([]);
          setEventsError('Event history response was invalid');
          return;
        }
        setEvents(data.events);
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setEventsError('Event history unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode, roomState, hasHostAuthority, identityReady, hostToken, hostAuthHeaders]);

  const review = useMemo(() => {
    if (!roomCode || !roomState?.house || !roomState.market || !Array.isArray(roomState.players)) {
      return null;
    }
    return generateRoomReview({
      roomCode,
      house: roomState.house,
      market: roomState.market,
      players: roomState.players,
      activity: roomState.activity || [],
      draftAudit: roomState.draft_audit || null,
      settled: Boolean(roomState.settled),
      settlement: roomState.settlement || null,
      events,
      eventSequence: roomState.event_sequence,
    });
  }, [roomCode, roomState, events]);

  if (loadingState) {
    return (
      <main style={s.page} role="status" aria-live="polite">
        <div style={s.loading}>Loading operator review...</div>
      </main>
    );
  }

  if (loadError || !review || !roomState?.house) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  return (
    <main style={s.page} data-testid="room-review-page">
      <header style={s.header}>
        <div>
          <Link to={`/host/${roomCode}`} style={s.backLink}>
            <ArrowLeft size={15} aria-hidden="true" /> Host room
          </Link>
          <div style={s.kicker}>Operator Review</div>
          <h1 style={s.title}>{review.headline}</h1>
          <p style={s.summary} data-testid="room-review-summary">{review.summary}</p>
        </div>
        <div style={s.statusRail}>
          <span style={{
            ...s.statusPill,
            ...(review.status === 'settled' ? s.statusSettled : review.status === 'ready_to_settle' ? s.statusReady : s.statusLive),
          }}>
            {review.status.replace(/_/g, ' ')}
          </span>
          <span style={s.roomCode}>{roomCode}</span>
        </div>
      </header>

      {eventsLoading && (
        <div style={s.notice} role="status" aria-live="polite">
          <Activity size={15} aria-hidden="true" /> Loading host-only event history...
        </div>
      )}

      {eventsError && (
        <div style={s.lockedNotice} role="status" data-testid="room-review-event-lock">
          <LockKeyhole size={16} aria-hidden="true" />
          <span>{eventsError} Public room state is still shown below.</span>
        </div>
      )}

      <section style={s.metricGrid} aria-label="Review metrics" data-testid="room-review-metrics">
        {review.metrics.map((metric) => (
          <article key={metric.label} style={s.metricCard}>
            <span style={s.metricLabel}>{metric.label}</span>
            <strong style={s.metricValue}>{metric.value}</strong>
            <span style={s.metricDetail}>{metric.detail}</span>
          </article>
        ))}
      </section>

      <div style={s.contentGrid}>
        <section style={s.panel} aria-label="Evidence comparison" data-testid="room-review-evidence">
          <h2 style={s.panelTitle}>
            <ClipboardCheck size={17} aria-hidden="true" /> Evidence comparison
          </h2>
          <div style={s.evidenceList}>
            {review.evidence.map((item) => (
              <article key={item.label} style={s.evidenceItem}>
                <span style={s.evidenceLabel}>{item.label}</span>
                <strong style={s.evidenceValue}>{item.value}</strong>
                <p style={s.evidenceDetail}>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={s.panel} aria-label="Integrity checks" data-testid="room-review-integrity">
          <h2 style={s.panelTitle}>
            <ShieldCheck size={17} aria-hidden="true" /> Integrity checks
          </h2>
          <ul style={s.checkList}>
            {review.integrity_checks.map((check, index) => (
              <li key={`check-${index}-${check}`}>{check}</li>
            ))}
          </ul>
        </section>

        <section style={s.panel} aria-label="Generated recap" data-testid="room-review-recap">
          <h2 style={s.panelTitle}>
            <FileSearch size={17} aria-hidden="true" /> Generated recap
          </h2>
          <ul style={s.recapList}>
            {review.recap.map((item, index) => (
              <li key={`recap-${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </section>

        <section style={s.panel} aria-label="Event timeline" data-testid="room-review-timeline">
          <h2 style={s.panelTitle}>
            <Gauge size={17} aria-hidden="true" /> Event timeline
          </h2>
          {review.timeline.length > 0 ? (
            <ol style={s.timeline}>
              {review.timeline.map((item) => (
                <li key={`${item.sequence}-${item.label}`} style={s.timelineItem}>
                  <span style={s.sequence}>#{item.sequence}</span>
                  <div>
                    <strong style={s.timelineLabel}>{item.label}</strong>
                    <p style={s.timelineDetail}>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={s.emptyTimeline}>No room events are available in this browser yet.</p>
          )}
        </section>
      </div>

      <section style={s.footerNote} aria-label="Review limits">
        <ListChecks size={15} aria-hidden="true" />
        This operator review is deterministic local output. It compares FairValue room data, not external appraisal authority or provider-backed comps.
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
    maxWidth: 760,
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
  statusReady: {
    background: 'rgba(161,92,0,0.13)',
    color: '#704100',
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
  notice: {
    maxWidth: 1180,
    margin: '0 auto 12px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    color: 'var(--text-secondary)',
    fontSize: 13,
  },
  lockedNotice: {
    maxWidth: 1180,
    margin: '0 auto 12px',
    padding: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    border: '1px solid #C37B13',
    borderRadius: 8,
    background: '#FFF7E8',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  metricGrid: {
    maxWidth: 1180,
    margin: '0 auto 16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 10,
  },
  metricCard: {
    padding: 12,
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  metricLabel: {
    color: 'var(--text-muted)',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: 'var(--text-primary)',
    fontSize: 18,
  },
  metricDetail: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    lineHeight: 1.35,
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
  checkList: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1.55,
  },
  recapList: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1.55,
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
    gridTemplateColumns: '52px 1fr',
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
  emptyTimeline: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 13,
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
