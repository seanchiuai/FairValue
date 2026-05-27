import { Trophy } from 'lucide-react';
import { formatOutcomeLabel } from '../../lib/roomMarketDisplay';
import type { SettleResult } from '../../types';
import TrustNotice from '../TrustNotice';
import './HostSettlementResultCard.css';

interface HostSettlementResultCardProps {
  settleResult: SettleResult;
}

export default function HostSettlementResultCard({ settleResult }: HostSettlementResultCardProps) {
  const outcome = formatOutcomeLabel(settleResult.winning_outcome);
  const outcomeClass = settleResult.winning_outcome === 'over'
    ? 'host-settlement-result__outcome--over'
    : settleResult.winning_outcome === 'under'
      ? 'host-settlement-result__outcome--under'
      : '';
  const evidencePacket = settleResult.evidence_packet;

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
      {evidencePacket && (
        <div className="host-settlement-result__evidence" data-testid="host-settlement-evidence-packet">
          <div className="host-settlement-result__evidence-title">
            Evidence packet: {evidencePacket.status.replace(/_/g, ' ')}
          </div>
          <p>{evidencePacket.summary}</p>
          <ul>
            {evidencePacket.items.map((item, index) => (
              <li key={`${item.type}-${item.reference || item.source}-${index}`}>
                <strong>{item.label}</strong>
                <span>{item.source}{item.reference ? `, ${item.reference}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <TrustNotice
        testId="host-settlement-trust-notice"
        title="Settlement evidence"
        compact
        tone="dark"
        points={[
          'This recap uses simulation credits only.',
          'The actual price is host-entered settlement evidence, not a FairValue appraisal.',
          evidencePacket
            ? `${evidencePacket.items.length} public-safe evidence metadata item${evidencePacket.items.length === 1 ? '' : 's'} attached.`
            : 'No external evidence metadata is attached.',
          'Room events preserve joins, bets, and settlement for replay.',
        ]}
      />
    </section>
  );
}
