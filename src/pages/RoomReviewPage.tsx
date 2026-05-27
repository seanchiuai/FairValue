import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity,
  ClipboardCheck,
  FileSearch,
  Gauge,
  ListChecks,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import RoomLoadError from '../components/RoomLoadError';
import {
  RoomArtifactBulletList,
  RoomArtifactEvidenceList,
  RoomArtifactFooter,
  RoomArtifactGrid,
  RoomArtifactHeader,
  RoomArtifactJsonExport,
  RoomArtifactLoading,
  RoomArtifactMetricGrid,
  RoomArtifactNotice,
  RoomArtifactPage,
  RoomArtifactPanel,
  RoomArtifactTimeline,
  type RoomArtifactStatusTone,
} from '../components/roomArtifact/RoomArtifact';
import { usePublicVerificationArtifact } from '../hooks/usePublicVerificationArtifact';
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
  const {
    artifact: publicVerification,
    error: publicVerificationError,
    loading: publicVerificationLoading,
  } = usePublicVerificationArtifact(roomCode, Boolean(roomState?.settled));

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
    return <RoomArtifactLoading label="Loading operator review..." />;
  }

  if (loadError || !review || !roomState?.house) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  const reviewStatusTone: RoomArtifactStatusTone =
    review.status === 'settled' ? 'settled' : review.status === 'ready_to_settle' ? 'ready' : 'live';
  const timeline = review.timeline.map((item) => ({
    key: `${item.sequence}-${item.label}`,
    sequence: `#${item.sequence}`,
    label: item.label,
    detail: item.detail,
  }));
  const publicVerificationEvidence = publicVerification ? [
    {
      label: 'Replay digest',
      value: publicVerification.replay.live_match ? 'Replay matches live state' : 'Replay mismatch detected',
      detail: `Replay hash ${publicVerification.replay.replay_hash.slice(0, 12)}... over ${publicVerification.event_stream.event_count} canonical event${publicVerification.event_stream.event_count === 1 ? '' : 's'}.`,
    },
    {
      label: 'Public recap digest',
      value: publicVerification.public_recap.digest_hash.slice(0, 12) + '...',
      detail: `Settlement evidence hash ${publicVerification.settlement?.evidence_packet_hash?.slice(0, 12) || 'missing'}... is included in the public artifact.`,
    },
    {
      label: 'Signature',
      value: publicVerification.signature.status === 'signed' ? 'Signed HMAC-SHA256' : 'Unsigned local digest',
      detail: publicVerification.signature.status === 'signed'
        ? `Payload hash ${publicVerification.signature.payload_hash.slice(0, 12)}... signed with ${publicVerification.signature.key_hint}.`
        : publicVerification.signature.reason || 'Local artifact hash only; configure a signing secret to emit signatures.',
    },
  ] : [];
  const disputeBriefEvidence = [
    {
      label: 'Evidence summary',
      value: review.dispute_brief.status.replace(/_/g, ' '),
      detail: review.dispute_brief.evidence_summary.join(' '),
    },
    {
      label: 'Dispute questions',
      value: `${review.dispute_brief.dispute_questions.length} prompt${review.dispute_brief.dispute_questions.length === 1 ? '' : 's'}`,
      detail: review.dispute_brief.dispute_questions.join(' '),
    },
    {
      label: 'Operator actions',
      value: `${review.dispute_brief.operator_actions.length} next step${review.dispute_brief.operator_actions.length === 1 ? '' : 's'}`,
      detail: review.dispute_brief.operator_actions.join(' '),
    },
  ];

  return (
    <RoomArtifactPage testId="room-review-page">
      <RoomArtifactHeader
        backTo={`/host/${roomCode}`}
        backLabel="Host room"
        kicker="Operator Review"
        title={review.headline}
        summary={review.summary}
        summaryTestId="room-review-summary"
        statusLabel={review.status.replace(/_/g, ' ')}
        statusTone={reviewStatusTone}
        roomCode={roomCode}
      />

      {eventsLoading && (
        <RoomArtifactNotice icon={<Activity size={15} aria-hidden="true" />}>
          Loading host-only event history...
        </RoomArtifactNotice>
      )}

      {eventsError && (
        <RoomArtifactNotice
          icon={<LockKeyhole size={16} aria-hidden="true" />}
          tone="locked"
          testId="room-review-event-lock"
        >
          {eventsError} Public room state is still shown below.
        </RoomArtifactNotice>
      )}

      <RoomArtifactMetricGrid metrics={review.metrics} ariaLabel="Review metrics" testId="room-review-metrics" />

      <RoomArtifactGrid>
        <RoomArtifactPanel
          icon={<ClipboardCheck size={17} aria-hidden="true" />}
          title="Evidence comparison"
          ariaLabel="Evidence comparison"
          testId="room-review-evidence"
        >
          <RoomArtifactEvidenceList items={review.evidence} />
        </RoomArtifactPanel>

        <RoomArtifactPanel
          icon={<ClipboardCheck size={17} aria-hidden="true" />}
          title="Evidence and dispute brief"
          ariaLabel="Evidence and dispute brief"
          testId="room-review-dispute-brief"
        >
          <RoomArtifactEvidenceList items={disputeBriefEvidence} />
          <RoomArtifactBulletList items={review.dispute_brief.limitations} />
        </RoomArtifactPanel>

        <RoomArtifactPanel
          icon={<ShieldCheck size={17} aria-hidden="true" />}
          title="Integrity checks"
          ariaLabel="Integrity checks"
          testId="room-review-integrity"
        >
          <RoomArtifactBulletList items={review.integrity_checks} />
        </RoomArtifactPanel>

        {review.status === 'settled' && (
          <RoomArtifactPanel
            icon={<ShieldCheck size={17} aria-hidden="true" />}
            title="Public verification export"
            ariaLabel="Public verification export"
            testId="room-review-public-verification"
          >
            {publicVerification ? (
              <>
                <RoomArtifactEvidenceList items={publicVerificationEvidence} />
                <RoomArtifactJsonExport
                  artifact={publicVerification}
                  filename={`fairvalue-${publicVerification.room_code}-public-verification.json`}
                  testId="room-review-public-verification-export"
                  copyTestId="room-review-public-verification-copy"
                  downloadTestId="room-review-public-verification-download"
                  statusTestId="room-review-public-verification-export-status"
                />
              </>
            ) : (
              <p className="room-artifact-empty">
                {publicVerificationLoading ? 'Generating public verification digest...' : publicVerificationError || 'Public verification unavailable'}
              </p>
            )}
          </RoomArtifactPanel>
        )}

        <RoomArtifactPanel
          icon={<FileSearch size={17} aria-hidden="true" />}
          title="Generated recap"
          ariaLabel="Generated recap"
          testId="room-review-recap"
        >
          <RoomArtifactBulletList items={review.recap} />
        </RoomArtifactPanel>

        <RoomArtifactPanel
          icon={<Gauge size={17} aria-hidden="true" />}
          title="Event timeline"
          ariaLabel="Event timeline"
          testId="room-review-timeline"
        >
          <RoomArtifactTimeline
            items={timeline}
            emptyMessage="No room events are available in this browser yet."
          />
        </RoomArtifactPanel>
      </RoomArtifactGrid>

      <RoomArtifactFooter icon={<ListChecks size={15} aria-hidden="true" />} ariaLabel="Review limits">
        This operator review is deterministic local output. It compares FairValue room data, not external appraisal authority or provider-backed comps.
      </RoomArtifactFooter>
    </RoomArtifactPage>
  );
}
