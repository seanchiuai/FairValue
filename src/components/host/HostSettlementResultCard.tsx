import { Trophy } from 'lucide-react';
import type { SettleResult } from '../../types';
import TrustNotice from '../TrustNotice';
import './HostSettlementResultCard.css';

interface HostSettlementResultCardProps {
  settleResult: SettleResult;
}

export default function HostSettlementResultCard({ settleResult }: HostSettlementResultCardProps) {
  const outcome = settleResult.winning_outcome.toUpperCase();
  const outcomeClass = settleResult.winning_outcome === 'over'
    ? 'host-settlement-result__outcome--over'
    : 'host-settlement-result__outcome--under';

  return (
    <section className="host-settlement-result" data-testid="host-settlement-result">
      <Trophy size={28} color="var(--accent-warning)" aria-hidden="true" />
      <div className="host-settlement-result__title">Market Settled</div>
      <div className="host-settlement-result__actual">
        Actual: ${settleResult.actual_price.toLocaleString()}
      </div>
      <div className={`host-settlement-result__outcome ${outcomeClass}`}>
        {outcome} WINS
      </div>
      <TrustNotice
        testId="host-settlement-trust-notice"
        title="Settlement evidence"
        compact
        tone="dark"
        points={[
          'This recap uses simulation credits only.',
          'The actual price is host-entered settlement evidence, not a FairValue appraisal.',
          'Room events preserve joins, bets, and settlement for replay.',
        ]}
      />
    </section>
  );
}
