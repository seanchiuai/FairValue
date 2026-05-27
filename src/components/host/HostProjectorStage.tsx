import { Clock3, Radio, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RoomMarketIntelligence } from '../../lib/marketIntelligence';
import { calculateImpliedPrice } from '../../lib/lmsr';
import type { House, Market, PlayerData, RoomPhase, SettleResult } from '../../types';
import './HostProjectorStage.css';

interface HostProjectorStageProps {
  roomCode?: string;
  house: House;
  market: Market;
  phase: RoomPhase | null;
  players: PlayerData[];
  intelligence: RoomMarketIntelligence | null;
  joinUrl: string;
  settled: boolean;
  settleResult: SettleResult | null;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function cueForPhase({
  phase,
  intelligence,
  settled,
  settleResult,
}: Pick<HostProjectorStageProps, 'phase' | 'intelligence' | 'settled' | 'settleResult'>) {
  if (settled && settleResult) {
    return `Settlement complete: ${settleResult.winning_outcome.toUpperCase()} wins at ${formatMoney(settleResult.actual_price)}.`;
  }
  if (phase?.status === 'locked') {
    return 'Betting is locked. Ask each side for final evidence before settlement.';
  }
  if (phase?.status === 'discussion') {
    return intelligence?.next_questions[0]?.question || 'Run the room discussion: strongest over case, strongest under case, then evidence gap.';
  }
  return intelligence?.host_script[0] || 'Open the room with the live consensus and ask players what evidence would change their mind.';
}

export default function HostProjectorStage({
  roomCode,
  house,
  market,
  phase,
  players,
  intelligence,
  joinUrl,
  settled,
  settleResult,
}: HostProjectorStageProps) {
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const activePhase = settled ? 'settled' : phase?.status || 'open';
  const phaseLabel = settled ? 'Settled' : phase?.label || 'Betting open';
  const timerEndsAt = phase?.timer_ends_at || null;
  const remainingSeconds = timerEndsAt ? Math.max(0, timerEndsAt - nowSeconds) : 0;
  const probOver = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedValue = calculateImpliedPrice(probOver, house.asking_price);
  const hostCue = cueForPhase({ phase, intelligence, settled, settleResult });
  const scriptLines = useMemo(
    () => intelligence?.host_script.slice(0, 3) || [
      'Invite players to name their strongest evidence.',
      'Separate information-driven moves from simple momentum.',
      'Restate the settlement evidence before closing the room.',
    ],
    [intelligence]
  );

  useEffect(() => {
    if (!timerEndsAt) return;
    setNowSeconds(Date.now() / 1000);
    const interval = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => window.clearInterval(interval);
  }, [timerEndsAt]);

  return (
    <section
      className={`host-projector-stage host-projector-stage--${activePhase}`}
      aria-label="Projector room stage"
      data-testid="host-projector-stage"
    >
      <div className="host-projector-stage__hero">
        <div className="host-projector-stage__kicker">
          <Radio size={18} aria-hidden="true" />
          Live Room {roomCode}
        </div>
        <h1 className="host-projector-stage__address">{house.address}</h1>
        <div className="host-projector-stage__meta">
          <span>Ask {formatMoney(house.asking_price)}</span>
          <span>{players.length} player{players.length === 1 ? '' : 's'}</span>
          <span>{market.total_trades} trade{market.total_trades === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="host-projector-stage__scoreboard">
        <div className="host-projector-stage__metric">
          <span className="host-projector-stage__label">Consensus</span>
          <strong>{Math.round(probOver * 100)}% OVER</strong>
        </div>
        <div className="host-projector-stage__metric">
          <span className="host-projector-stage__label">Implied Value</span>
          <strong>{formatMoney(impliedValue)}</strong>
        </div>
        <div className="host-projector-stage__metric">
          <span className="host-projector-stage__label">Volume</span>
          <strong>{formatMoney(market.total_wagered)}</strong>
        </div>
      </div>

      <div className="host-projector-stage__cue" data-testid="host-projector-cue">
        <span className="host-projector-stage__label">Host cue</span>
        <p>{hostCue}</p>
      </div>

      <div className="host-projector-stage__footer">
        <div className="host-projector-stage__phase" data-testid="host-projector-phase">
          <Clock3 size={16} aria-hidden="true" />
          <span>{phaseLabel}</span>
          {timerEndsAt && activePhase === 'discussion' && <strong>{formatCountdown(remainingSeconds)}</strong>}
        </div>
        <div className="host-projector-stage__join" data-testid="host-projector-join">
          <Users size={16} aria-hidden="true" />
          <span>{joinUrl.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>

      <div className="host-projector-stage__script" data-testid="host-projector-script">
        {scriptLines.map((line, index) => (
          <div key={`${index}-${line}`} className="host-projector-stage__script-line">
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}
