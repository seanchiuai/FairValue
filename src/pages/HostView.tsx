import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import { generateRoomMarketIntelligence } from '../lib/marketIntelligence';
import { isBinaryMarket, isRangeMarket } from '../lib/roomMarketDisplay';
import { buildHostAuthHeaders, readHostToken } from '../lib/fairValueAuth';
import CogneeChat from '../components/CogneeChat';
import Leaderboard from '../components/host/Leaderboard';
import ActivityFeed from '../components/host/ActivityFeed';
import SettleModal from '../components/host/SettleModal';
import QRCard from '../components/host/QRCard';
import HostRoomIntelligencePanel from '../components/host/HostRoomIntelligencePanel';
import HostDraftAuditCard from '../components/host/HostDraftAuditCard';
import HostTopBar from '../components/host/HostTopBar';
import HostAuthorityNotice from '../components/host/HostAuthorityNotice';
import HostPropertySummary from '../components/host/HostPropertySummary';
import HostPhaseControl from '../components/host/HostPhaseControl';
import HostProjectorStage from '../components/host/HostProjectorStage';
import HostMarketChartPanel from '../components/host/HostMarketChartPanel';
import HostSettlementResultCard from '../components/host/HostSettlementResultCard';
import SkeletonChart from '../components/skeletons/SkeletonChart';
import SkeletonLeaderboard from '../components/skeletons/SkeletonLeaderboard';
import ReconnectingOverlay from '../components/ReconnectingOverlay';
import TrustNotice from '../components/TrustNotice';
import RoomLoadError from '../components/RoomLoadError';
import { useToast } from '../contexts/ToastContext';
import type { RoomPhase } from '../types';
import './HostView.css';

const hostAuthorityNoticeId = 'host-authority-warning';

type ToggleAIResponse = {
  ai_enabled?: boolean;
  error?: string;
};

type RoomPhaseResponse = {
  phase?: RoomPhase;
  ai_enabled?: boolean;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export default function HostView() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { sessionId, userToken, identityReady } = useSession();
  const {
    market,
    marketFormat,
    marketConfig,
    players,
    house,
    draftAudit,
    activity,
    phase,
    aiEnabled,
    hostUserId,
    setAiEnabled,
    setPhase,
    settled,
    settleResult,
    connectionState,
    loading,
    loadError,
  } = useRoom(roomCode || '', sessionId, userToken);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [phasePending, setPhasePending] = useState('');
  const [projectorMode, setProjectorMode] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState(
    () => sessionStorage.getItem('fv_ngrok_url') || ''
  );
  const hostToken = useMemo(
    () => readHostToken(roomCode),
    [roomCode]
  );
  const canUseHostIdentity = Boolean(identityReady && userToken && hostUserId === sessionId);
  const hostAuthHeaders = useMemo(
    () => buildHostAuthHeaders({ userToken: canUseHostIdentity ? userToken : '', hostToken }),
    [canUseHostIdentity, userToken, hostToken]
  );
  const hasHostAuthority = Boolean(canUseHostIdentity || hostToken);
  const wasConnectedRef = useRef(false);
  const settleButtonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  if (connectionState === 'connected') wasConnectedRef.current = true;

  useEffect(() => {
    if (!roomCode) return;
    setProjectorMode(sessionStorage.getItem(`fv_host_projector_${roomCode}`) === '1');
  }, [roomCode]);

  // Chart
  const { addPoint, loadHistory, setRef: chartRef } = useMarketChart({ height: 300 });
  const historyLoadedRef = useRef(false);

  useEffect(() => {
    if (!roomCode || !house || !isBinaryMarket(marketFormat)) return;
    fetch(`/api/markets/by-property/room-${roomCode}/chart`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ prob: number; time: string }>) => {
        if (data.length > 0) {
          const points = data.map((d) => ({
            probOver: d.prob,
            fairValue: calculateImpliedPrice(d.prob, house.asking_price),
          }));
          loadHistory(points);
        }
        historyLoadedRef.current = true;
      })
      .catch(() => {
        console.warn('Chart history unavailable');
        historyLoadedRef.current = true;
      });
  }, [roomCode, house, marketFormat, loadHistory]);

  useEffect(() => {
    if (!market || !house || !isBinaryMarket(marketFormat)) return;
    if (!historyLoadedRef.current) return;
    addPoint({
      probOver: market.prob_over,
      fairValue: calculateImpliedPrice(market.prob_over, house.asking_price),
    });
  }, [market, marketFormat, house, addPoint]);

  const handleToggleAI = useCallback(async () => {
    if (!roomCode) return;
    if (isRangeMarket(marketFormat)) {
      showToast('AI bot is not available for range rooms yet.', 'error');
      return;
    }
    if (!hasHostAuthority) {
      showToast('Host authority is missing for this room.', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${roomCode}/toggle-ai`, {
        method: 'POST',
        headers: hostAuthHeaders,
      });
      const data = await readJson<ToggleAIResponse>(res);
      if (!res.ok || data.error) {
        showToast(data.error || 'Unable to toggle AI bot', 'error');
        return;
      }
      if (typeof data.ai_enabled !== 'boolean') {
        showToast('AI toggle response was invalid', 'error');
        return;
      }
      setAiEnabled(data.ai_enabled);
      showToast(`AI bot ${data.ai_enabled ? 'enabled' : 'disabled'}.`, 'success');
    } catch {
      showToast('Unable to toggle AI bot', 'error');
    }
  }, [roomCode, marketFormat, hasHostAuthority, hostAuthHeaders, setAiEnabled, showToast]);

  const handleRoomPhaseChange = useCallback(async (
    nextPhase: 'open' | 'discussion' | 'locked',
    timerSeconds?: number
  ) => {
    if (!roomCode) return;
    if (!hasHostAuthority) {
      showToast('Host authority is missing for this room.', 'error');
      return;
    }

    setPhasePending(nextPhase);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...hostAuthHeaders,
        },
        body: JSON.stringify({
          phase: nextPhase,
          ...(timerSeconds ? { timer_seconds: timerSeconds } : {}),
        }),
      });
      const data = await readJson<RoomPhaseResponse>(res);
      if (!res.ok || data.error) {
        showToast(data.error || 'Unable to update room phase', 'error');
        return;
      }
      if (!data.phase) {
        showToast('Room phase response was invalid', 'error');
        return;
      }
      setPhase(data.phase);
      if (typeof data.ai_enabled === 'boolean') setAiEnabled(data.ai_enabled);
      showToast(data.phase.label, 'success');
    } catch {
      showToast('Unable to update room phase', 'error');
    } finally {
      setPhasePending('');
    }
  }, [roomCode, hasHostAuthority, hostAuthHeaders, setAiEnabled, setPhase, showToast]);

  const handleNgrokChange = useCallback((url: string) => {
    setNgrokUrl(url);
    sessionStorage.setItem('fv_ngrok_url', url);
  }, []);

  const handleToggleProjector = useCallback(() => {
    setProjectorMode((current) => {
      const next = !current;
      if (roomCode) sessionStorage.setItem(`fv_host_projector_${roomCode}`, next ? '1' : '0');
      return next;
    });
  }, [roomCode]);

  const closeSettleModal = useCallback(() => {
    setShowSettleModal(false);
    window.requestAnimationFrame(() => settleButtonRef.current?.focus());
  }, []);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.balance - a.balance),
    [players]
  );
  const roomIntelligence = useMemo(
    () => house && market && isBinaryMarket(marketFormat)
      ? generateRoomMarketIntelligence({ house, market, players, activity, draftAudit })
      : null,
    [house, market, marketFormat, players, activity, draftAudit]
  );

  if (loading) {
    return (
      <div className="host-view">
        <HostTopBar
          roomCode={roomCode}
          playerCount={0}
          connectionState={connectionState}
          aiEnabled={aiEnabled}
          settled={settled}
          hasHostAuthority={hasHostAuthority}
          hostAuthorityNoticeId={hostAuthorityNoticeId}
          settleButtonRef={settleButtonRef}
          onToggleAI={handleToggleAI}
          onOpenSettle={() => setShowSettleModal(true)}
          showStatus={false}
          showActions={false}
        />
        <div className="host-view__layout">
          <div className="host-view__left">
            <SkeletonChart />
          </div>
          <div className="host-view__right">
            <SkeletonLeaderboard />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !house || !market) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  const trimmedNgrok = ngrokUrl.trim().replace(/\/$/, '');
  const baseUrl = trimmedNgrok && trimmedNgrok.startsWith('https://') ? trimmedNgrok : window.location.origin;
  const joinUrl = `${baseUrl}/play/${roomCode}`;

  return (
    <div className={`host-view${projectorMode ? ' host-view--projector' : ''}`}>
      <HostTopBar
        roomCode={roomCode}
        playerCount={players.length}
        connectionState={connectionState}
        aiEnabled={aiEnabled}
        settled={settled}
        hasHostAuthority={hasHostAuthority}
        hostAuthorityNoticeId={hostAuthorityNoticeId}
        settleButtonRef={settleButtonRef}
        onToggleAI={handleToggleAI}
        onOpenSettle={() => setShowSettleModal(true)}
        projectorMode={projectorMode}
        onToggleProjector={handleToggleProjector}
      />

      {!settled && !hasHostAuthority && (
        <HostAuthorityNotice id={hostAuthorityNoticeId} />
      )}

      {/* Main Layout */}
      <div className="host-view__layout">
        <div className="host-view__left">
          {projectorMode ? (
            <>
              <HostProjectorStage
                roomCode={roomCode}
                house={house}
                market={market}
                marketFormat={marketFormat}
                marketConfig={marketConfig}
                phase={phase}
                players={players}
                intelligence={roomIntelligence}
                joinUrl={joinUrl}
                settled={settled}
                settleResult={settleResult}
              />

              <HostPhaseControl
                phase={phase}
                settled={settled}
                hasHostAuthority={hasHostAuthority}
                disabledDescriptionId={hostAuthorityNoticeId}
                pendingPhase={phasePending}
                onChangePhase={handleRoomPhaseChange}
              />

              {settled && settleResult && (
                <HostSettlementResultCard settleResult={settleResult} />
              )}

              <HostMarketChartPanel
                market={market}
                marketFormat={marketFormat}
                marketConfig={marketConfig}
                chartRef={chartRef}
              />
            </>
          ) : (
            <>
              <HostPropertySummary
                house={house}
                market={market}
                marketFormat={marketFormat}
                marketConfig={marketConfig}
              />

              <HostPhaseControl
                phase={phase}
                settled={settled}
                hasHostAuthority={hasHostAuthority}
                disabledDescriptionId={hostAuthorityNoticeId}
                pendingPhase={phasePending}
                onChangePhase={handleRoomPhaseChange}
              />

              {draftAudit && <HostDraftAuditCard draftAudit={draftAudit} />}

              {!showSettleModal && roomIntelligence && (
                <HostRoomIntelligencePanel intelligence={roomIntelligence} />
              )}

              <TrustNotice
                testId="host-room-trust-notice"
                title="Room trust note"
                tone="dark"
              />

              {settled && settleResult && (
                <HostSettlementResultCard settleResult={settleResult} />
              )}

              <HostMarketChartPanel
                market={market}
                marketFormat={marketFormat}
                marketConfig={marketConfig}
                chartRef={chartRef}
              />

              {isBinaryMarket(marketFormat) && (
                <CogneeChat
                  propertyId={roomCode || ''}
                  askingPrice={house.asking_price}
                  market={market}
                  activity={activity}
                  players={players}
                />
              )}
            </>
          )}
        </div>

        <div className="host-view__right">
          <QRCard joinUrl={joinUrl} ngrokUrl={ngrokUrl} onNgrokChange={handleNgrokChange} />
          <Leaderboard players={sortedPlayers} />
          <ActivityFeed activity={activity} />
        </div>
      </div>

      <ReconnectingOverlay state={connectionState} wasConnected={wasConnectedRef.current} />

      {showSettleModal && (
        <SettleModal
          house={house}
          roomCode={roomCode || ''}
          hostToken={hostToken}
          userToken={canUseHostIdentity ? userToken : ''}
          marketFormat={marketFormat}
          marketConfig={marketConfig}
          onClose={closeSettleModal}
        />
      )}
    </div>
  );
}
