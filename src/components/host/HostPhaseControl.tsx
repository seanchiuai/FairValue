import { Clock3, Lock, MessageSquare, Unlock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RoomPhase } from '../../types';
import './HostPhaseControl.css';

type HostSettablePhase = 'open' | 'discussion' | 'locked';

interface HostPhaseControlProps {
  phase: RoomPhase | null;
  settled: boolean;
  hasHostAuthority: boolean;
  disabledDescriptionId?: string;
  pendingPhase: string;
  onChangePhase: (phase: HostSettablePhase, timerSeconds?: number) => void;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function HostPhaseControl({
  phase,
  settled,
  hasHostAuthority,
  disabledDescriptionId,
  pendingPhase,
  onChangePhase,
}: HostPhaseControlProps) {
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const activePhase = phase?.status || 'open';
  const timerEndsAt = phase?.timer_ends_at || null;
  const remainingSeconds = timerEndsAt ? Math.max(0, timerEndsAt - nowSeconds) : 0;
  const isDisabled = settled || !hasHostAuthority || Boolean(pendingPhase);

  useEffect(() => {
    if (!timerEndsAt) return;
    setNowSeconds(Date.now() / 1000);
    const interval = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => window.clearInterval(interval);
  }, [timerEndsAt]);

  const statusText = useMemo(() => {
    if (settled) return 'Settled';
    if (!phase) return 'Betting open';
    if (phase.status === 'discussion' && timerEndsAt) return `${phase.label} ${formatCountdown(remainingSeconds)}`;
    return phase.label;
  }, [phase, remainingSeconds, settled, timerEndsAt]);

  const actions: Array<{
    phase: HostSettablePhase;
    label: string;
    icon: typeof Unlock;
    timerSeconds?: number;
  }> = [
    { phase: 'open', label: 'Open betting', icon: Unlock },
    { phase: 'discussion', label: 'Start 5 min discussion', icon: MessageSquare, timerSeconds: 5 * 60 },
    { phase: 'locked', label: 'Lock betting', icon: Lock },
  ];

  return (
    <section className="host-phase-control" data-testid="host-phase-control" aria-label="Host room phase controls">
      <div className="host-phase-control__status">
        <div className="host-phase-control__title">
          <Clock3 size={16} aria-hidden="true" />
          Room phase
        </div>
        <div className="host-phase-control__badge" data-testid="host-phase-status">
          {statusText}
        </div>
        {timerEndsAt && activePhase === 'discussion' && (
          <div className="host-phase-control__timer" data-testid="host-phase-timer">
            Ends in {formatCountdown(remainingSeconds)}
          </div>
        )}
      </div>

      <div className="host-phase-control__actions">
        {actions.map((action) => {
          const Icon = action.icon;
          const isActive = activePhase === action.phase;
          const isPending = pendingPhase === action.phase;
          return (
            <button
              key={action.phase}
              type="button"
              className="host-phase-control__button"
              onClick={() => onChangePhase(action.phase, action.timerSeconds)}
              disabled={isDisabled}
              aria-pressed={isActive}
              aria-describedby={!hasHostAuthority ? disabledDescriptionId : undefined}
              title={action.label}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{isPending ? 'Working...' : action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
