import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardCheck, ListChecks, RadioTower, ShieldCheck, Sparkles } from 'lucide-react';
import RoomLoadError from '../components/RoomLoadError';
import {
  RoomArtifactBulletList,
  RoomArtifactEvidenceList,
  RoomArtifactFooter,
  RoomArtifactGrid,
  RoomArtifactHeader,
  RoomArtifactLoading,
  RoomArtifactPage,
  RoomArtifactPanel,
  RoomArtifactTimeline,
} from '../components/roomArtifact/RoomArtifact';
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
    return <RoomArtifactLoading label="Loading public recap..." />;
  }

  if (loadError || !recap) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  const timeline = recap.timeline.map((item, index) => ({
    key: `${index}-${item.label}-${item.detail}`,
    sequence: `#${index + 1}`,
    label: item.label,
    detail: item.detail,
  }));

  return (
    <RoomArtifactPage testId="room-public-recap-page">
      <RoomArtifactHeader
        backTo={roomCode ? `/play/${roomCode}` : '/join'}
        backLabel="Room"
        kicker="Public Recap"
        title={recap.headline}
        summary={recap.summary}
        summaryTestId="room-public-recap-summary"
        statusLabel={recap.status}
        statusTone={recap.status}
        roomCode={roomCode}
      />

      <RoomArtifactPanel
        icon={<Sparkles size={17} aria-hidden="true" />}
        title="Share-safe highlights"
        ariaLabel="Recap highlights"
        testId="room-public-recap-highlights"
        prominent
      >
        <RoomArtifactBulletList items={recap.highlights} highlight />
      </RoomArtifactPanel>

      <RoomArtifactGrid>
        <RoomArtifactPanel
          icon={<ClipboardCheck size={17} aria-hidden="true" />}
          title="Public evidence"
          ariaLabel="Public evidence"
          testId="room-public-recap-evidence"
        >
          <RoomArtifactEvidenceList items={recap.evidence} />
        </RoomArtifactPanel>

        <RoomArtifactPanel
          icon={<RadioTower size={17} aria-hidden="true" />}
          title="Public timeline"
          ariaLabel="Public timeline"
          testId="room-public-recap-timeline"
        >
          <RoomArtifactTimeline items={timeline} compactSequence />
        </RoomArtifactPanel>

        <RoomArtifactPanel
          icon={<ShieldCheck size={17} aria-hidden="true" />}
          title="Guardrails"
          ariaLabel="Recap guardrails"
          testId="room-public-recap-guardrails"
        >
          <RoomArtifactBulletList items={recap.guardrails} />
        </RoomArtifactPanel>
      </RoomArtifactGrid>

      <RoomArtifactFooter icon={<ListChecks size={15} aria-hidden="true" />} ariaLabel="Share limits">
        Public recaps are generated from public room state only. Use the host operator review for private audit/event-log inspection.
      </RoomArtifactFooter>
    </RoomArtifactPage>
  );
}
