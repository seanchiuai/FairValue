import { FileCheck2 } from 'lucide-react';
import type { MarketDraftAudit } from '../../types';
import './HostDraftAuditCard.css';

interface HostDraftAuditCardProps {
  draftAudit: MarketDraftAudit;
}

export default function HostDraftAuditCard({ draftAudit }: HostDraftAuditCardProps) {
  return (
    <section
      className="host-draft-audit"
      aria-label="Market Studio draft audit"
      data-testid="host-draft-audit-note"
    >
      <div className="host-draft-audit__title">
        <FileCheck2 size={16} aria-hidden="true" />
        Market Studio draft audit
      </div>
      <div className="host-draft-audit__grid">
        <span>Source: <strong>{draftAudit.provenance.source}</strong></span>
        <span>Validation: <strong>{draftAudit.validation.status}</strong></span>
        {draftAudit.property_id && <span>Linked property: <strong>{draftAudit.property_id}</strong></span>}
        <span>Format: <strong>{draftAudit.market_format.replace(/_/g, ' ')}</strong></span>
      </div>
      <p className="host-draft-audit__question">{draftAudit.market_question}</p>
      <p className="host-draft-audit__text">
        Server-validated draft metadata is preserved in this room's event history. Original pasted text is not stored; the audit keeps a source hash and settlement evidence checklist.
      </p>
    </section>
  );
}
