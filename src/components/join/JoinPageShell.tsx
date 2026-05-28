import type { ReactNode } from 'react';
import { Home, Users } from 'lucide-react';
import './JoinPageShell.css';

interface JoinPageShellProps {
  children: ReactNode;
  expanded: boolean;
  onBrowseMarkets: () => void;
}

export default function JoinPageShell({
  children,
  expanded,
  onBrowseMarkets,
}: JoinPageShellProps) {
  return (
    <div className="join-page-shell">
      <div className={`join-page-shell__container${expanded ? ' join-page-shell__container--expanded' : ''}`}>
        <div className="join-page-shell__logo">
          <Home size={32} color="var(--accent-primary)" aria-hidden="true" />
          <h1 className="join-page-shell__title">FairValue</h1>
          <p className="join-page-shell__subtitle">Real Estate Prediction Market</p>
        </div>

        {children}
      </div>

      <div className="join-page-shell__footer">
        <button className="join-page-shell__browse" onClick={onBrowseMarkets}>
          <Users size={14} aria-hidden="true" />
          Browse Markets
        </button>
      </div>
    </div>
  );
}
