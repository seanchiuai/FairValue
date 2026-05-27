import type { ComponentProps, Ref } from 'react';
import { Link } from 'react-router-dom';
import { Bot, FileSearch, Gavel, Maximize2, Share2, Users } from 'lucide-react';
import ConnectionIndicator from '../ConnectionIndicator';
import './HostTopBar.css';

interface HostTopBarProps {
  roomCode?: string;
  playerCount: number;
  connectionState: ComponentProps<typeof ConnectionIndicator>['state'];
  aiEnabled: boolean;
  settled: boolean;
  hasHostAuthority: boolean;
  hostAuthorityNoticeId: string;
  settleButtonRef: Ref<HTMLButtonElement>;
  onToggleAI: () => void;
  onOpenSettle: () => void;
  projectorMode?: boolean;
  onToggleProjector?: () => void;
  showStatus?: boolean;
  showActions?: boolean;
}

function authorityClass(enabled: boolean) {
  return enabled ? '' : ' host-topbar__control--disabled';
}

export default function HostTopBar({
  roomCode,
  playerCount,
  connectionState,
  aiEnabled,
  settled,
  hasHostAuthority,
  hostAuthorityNoticeId,
  settleButtonRef,
  onToggleAI,
  onOpenSettle,
  projectorMode = false,
  onToggleProjector,
  showStatus = true,
  showActions = true,
}: HostTopBarProps) {
  const authorityDescription = !hasHostAuthority ? hostAuthorityNoticeId : undefined;
  const disabledTitle = hasHostAuthority ? undefined : 'Host authority missing for this room';

  return (
    <div className="host-topbar">
      <div className="host-topbar__left">
        <span className="host-topbar__room-code">{roomCode}</span>
        {showStatus && (
          <>
            <span className="host-topbar__player-count" data-testid="host-player-count">
              <Users size={14} aria-hidden="true" /> {playerCount} player{playerCount !== 1 ? 's' : ''}
            </span>
            <ConnectionIndicator state={connectionState} />
          </>
        )}
      </div>
      {showActions && (
        <div className="host-topbar__right">
          {roomCode && (
            <>
              {onToggleProjector && (
                <button
                  type="button"
                  className={`host-topbar__control host-topbar__control--button${projectorMode ? ' host-topbar__control--active' : ''}`}
                  onClick={onToggleProjector}
                  aria-label={projectorMode ? 'Exit projector mode' : 'Enter projector mode'}
                  aria-pressed={projectorMode}
                  data-testid="host-projector-toggle"
                >
                  <Maximize2 size={14} aria-hidden="true" /> Projector
                </button>
              )}
              <Link
                to={`/review/${roomCode}`}
                className="host-topbar__control host-topbar__control--link"
                data-testid="host-review-link"
              >
                <FileSearch size={14} aria-hidden="true" /> Review
              </Link>
              <Link
                to={`/recap/${roomCode}`}
                className="host-topbar__control host-topbar__control--link"
                data-testid="host-recap-link"
              >
                <Share2 size={14} aria-hidden="true" /> Recap
              </Link>
            </>
          )}
          {!settled && (
            <>
              <button
                type="button"
                className={`host-topbar__control host-topbar__control--button host-topbar__control--ai${aiEnabled ? ' host-topbar__control--active' : ''}${authorityClass(hasHostAuthority)}`}
                onClick={onToggleAI}
                aria-label={`AI bot ${aiEnabled ? 'enabled' : 'disabled'}`}
                aria-pressed={aiEnabled}
                aria-describedby={authorityDescription}
                disabled={!hasHostAuthority}
                title={disabledTitle}
              >
                <Bot size={14} aria-hidden="true" /> AI {aiEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                ref={settleButtonRef}
                className={`host-topbar__control host-topbar__control--button host-topbar__control--settle${authorityClass(hasHostAuthority)}`}
                onClick={onOpenSettle}
                aria-describedby={authorityDescription}
                disabled={!hasHostAuthority}
                title={disabledTitle}
              >
                <Gavel size={14} aria-hidden="true" /> Settle
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
