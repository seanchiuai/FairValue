import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { House, RoomMarketConfig, SettlementEvidencePacket } from '../../types';
import { buildHostAuthHeaders } from '../../lib/fairValueAuth';
import {
  formatOutcomeLabel,
  isRenovationBudgetMarket,
  isRangeMarket,
  isRentYieldMarket,
  rangeBandLabel,
  rangeSettlementOutcome,
  renovationBudgetSettlementOutcome,
  renovationBudgetThresholdLabel,
  rentYieldSettlementOutcome,
  rentYieldThresholdLabel,
} from '../../lib/roomMarketDisplay';
import { useToast } from '../../contexts/ToastContext';
import TrustNotice from '../TrustNotice';

interface SettleModalProps {
  house: House;
  roomCode: string;
  hostToken: string;
  userToken?: string;
  marketFormat?: string;
  marketConfig?: RoomMarketConfig | null;
  onClose: () => void;
}

type SettlementResponse = {
  actual_price?: number;
  evidence_packet?: SettlementEvidencePacket | null;
  error?: string;
  results?: unknown[];
  winning_outcome?: string;
};

const EVIDENCE_TYPES = [
  'sale_record',
  'appraisal',
  'signed_valuation',
  'mls_update',
  'permit_record',
  'rental_outcome',
  'insurer_notice',
  'public_record',
  'host_attestation',
] as const;

type EvidenceType = typeof EVIDENCE_TYPES[number];
type EvidenceConfidence = 'low' | 'medium' | 'high';

const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  sale_record: 'Sale record',
  appraisal: 'Appraisal',
  signed_valuation: 'Signed valuation',
  mls_update: 'MLS update',
  permit_record: 'Permit record',
  rental_outcome: 'Rental outcome',
  insurer_notice: 'Insurer notice',
  public_record: 'Public record',
  host_attestation: 'Host attestation',
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export default function SettleModal({
  house,
  roomCode,
  hostToken,
  userToken,
  marketFormat,
  marketConfig,
  onClose,
}: SettleModalProps) {
  const [actualPrice, setActualPrice] = useState('');
  const [annualRent, setAnnualRent] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('sale_record');
  const [evidenceConfidence, setEvidenceConfidence] = useState<EvidenceConfidence>('medium');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [evidenceSource, setEvidenceSource] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceObservedAt, setEvidenceObservedAt] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSettle = useCallback(async () => {
    if (!actualPrice) {
      setError('Actual price is required');
      return;
    }
    const price = parseFloat(actualPrice.replace(/,/g, ''));
    if (isNaN(price) || price <= 0 || price > 100_000_000) {
      setError('Enter a valid actual price (up to $100M)');
      return;
    }
    const rentYieldRoom = isRentYieldMarket(marketFormat);
    const renovationBudgetRoom = isRenovationBudgetMarket(marketFormat);
    const parsedAnnualRent = parseFloat(annualRent.replace(/,/g, ''));
    if (rentYieldRoom && (isNaN(parsedAnnualRent) || parsedAnnualRent <= 0 || parsedAnnualRent > 10_000_000)) {
      setError('Enter a valid annual rent (up to $10M)');
      return;
    }
    const authHeaders = buildHostAuthHeaders({ userToken, hostToken });
    if (!Object.keys(authHeaders).length) {
      setError('Host authority missing for this room');
      return;
    }
    const evidenceItemHasMetadata = [
      evidenceLabel,
      evidenceSource,
      evidenceReference,
      evidenceObservedAt,
      evidenceNotes,
    ].some((value) => value.trim());
    if (evidenceItemHasMetadata && !evidenceSource.trim() && !evidenceReference.trim()) {
      setError('Add an evidence source or reference, or leave evidence metadata blank');
      return;
    }
    const settlementEvidence = evidenceSummary.trim() || evidenceItemHasMetadata
      ? {
        summary: evidenceSummary.trim() || undefined,
        items: evidenceItemHasMetadata
          ? [
            {
              type: evidenceType,
              label: evidenceLabel.trim() || EVIDENCE_LABELS[evidenceType],
              source: evidenceSource.trim(),
              reference: evidenceReference.trim(),
              observed_at: evidenceObservedAt.trim() || null,
              confidence: evidenceConfidence,
              notes: evidenceNotes.trim(),
            },
          ]
          : [],
      }
      : undefined;
    setSettling(true);
    setError('');
    try {
      const res = await fetch(`/api/rooms/${roomCode}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          actual_price: price,
          ...(rentYieldRoom ? { annual_rent: parsedAnnualRent } : {}),
          ...(renovationBudgetRoom ? { verified_cost: price } : {}),
          ...(settlementEvidence ? { settlement_evidence: settlementEvidence } : {}),
        }),
      });
      const data = await readJson<SettlementResponse>(res);
      if (!res.ok || data.error) {
        const message = data.error || 'Settlement failed';
        setError(message);
        showToast(message, 'error');
        return;
      }
      const hasValidSettlement =
        typeof data.winning_outcome === 'string' &&
        data.winning_outcome.length > 0 &&
        typeof data.actual_price === 'number' &&
        Array.isArray(data.results);
      if (!hasValidSettlement) {
        const message = 'Settlement response was invalid';
        setError(message);
        showToast(message, 'error');
        return;
      }
      showToast('Market settled.', 'success');
      onClose();
    } catch {
      const message = 'Settlement failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSettling(false);
    }
  }, [
    roomCode,
    hostToken,
    userToken,
    actualPrice,
    annualRent,
    marketFormat,
    evidenceType,
    evidenceConfidence,
    evidenceSummary,
    evidenceLabel,
    evidenceSource,
    evidenceReference,
    evidenceObservedAt,
    evidenceNotes,
    onClose,
    showToast,
  ]);

  const parsedActualPrice = parseFloat(actualPrice.replace(/,/g, ''));
  const parsedAnnualRent = parseFloat(annualRent.replace(/,/g, ''));
  const rangeRoom = isRangeMarket(marketFormat);
  const rentYieldRoom = isRentYieldMarket(marketFormat);
  const renovationBudgetRoom = isRenovationBudgetMarket(marketFormat);
  const settlementHint = actualPrice && !isNaN(parsedActualPrice)
    ? rentYieldRoom
      ? annualRent && !isNaN(parsedAnnualRent)
        ? `${formatOutcomeLabel(rentYieldSettlementOutcome(parsedAnnualRent, parsedActualPrice, marketConfig))} wins at ${Math.round((parsedAnnualRent / parsedActualPrice) * 10000) / 100}% yield`
        : `enter annual rent; threshold ${rentYieldThresholdLabel(marketConfig)}`
      : renovationBudgetRoom
        ? `${formatOutcomeLabel(renovationBudgetSettlementOutcome(parsedActualPrice, marketConfig))} wins vs ${renovationBudgetThresholdLabel(marketConfig)} budget`
      : rangeRoom
      ? `${formatOutcomeLabel(rangeSettlementOutcome(parsedActualPrice, marketConfig))} wins`
      : parsedActualPrice >= house.asking_price
        ? 'OVER wins'
        : 'UNDER wins'
    : 'enter a price';

  return (
    <div
      style={s.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settle-title"
      aria-describedby="settle-desc"
    >
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 id="settle-title" style={s.title}>Settle Market</h3>
        <p id="settle-desc" style={s.desc}>
          {rentYieldRoom
            ? `Enter settlement price and annual rent to resolve against ${rentYieldThresholdLabel(marketConfig)} yield.`
            : renovationBudgetRoom
              ? `Enter verified renovation cost to resolve against the ${renovationBudgetThresholdLabel(marketConfig)} budget.`
            : 'Enter the actual appraisal/sale price to determine the winner.'}
          {rangeRoom ? ` Band: ${rangeBandLabel(marketConfig)}.` : ''}
        </p>
        <TrustNotice
          testId="settle-modal-trust-notice"
          title="Before settlement"
          compact
          tone="dark"
          points={[
            'Confirm against actual sale or appraisal evidence.',
            ...(rentYieldRoom ? ['Confirm annual rent with lease, rent roll, or public-safe rental evidence.'] : []),
            ...(renovationBudgetRoom ? ['Confirm renovation cost with invoice, permit, or scope metadata.'] : []),
            'This value decides simulation-credit payouts only.',
            'The settlement is written into the room event history.',
          ]}
        />
        <div style={s.field}>
          <label style={s.label} htmlFor="settle-actual-price">
            {rentYieldRoom ? 'Settlement Price ($)' : renovationBudgetRoom ? 'Verified Cost ($)' : 'Actual Price ($)'}
          </label>
          <input
            id="settle-actual-price"
            ref={inputRef}
            style={s.input}
            value={actualPrice}
            onChange={(e) => setActualPrice(e.target.value)}
            aria-label={rentYieldRoom ? 'Settlement price' : renovationBudgetRoom ? 'Verified cost' : 'Actual price'}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'settle-error' : undefined}
            placeholder="450,000"
            inputMode="numeric"
            aria-required="true"
          />
        </div>
        {rentYieldRoom && (
          <div style={s.field}>
            <label style={s.label} htmlFor="settle-annual-rent">Annual Rent ($)</label>
            <input
              id="settle-annual-rent"
              style={s.input}
              value={annualRent}
              onChange={(e) => setAnnualRent(e.target.value)}
              aria-label="Annual rent"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'settle-error' : undefined}
              placeholder="60,000"
              inputMode="numeric"
              aria-required="true"
            />
          </div>
        )}
        <p style={s.hint}>
          Asking: ${house.asking_price.toLocaleString()} —{' '}
          {settlementHint}
        </p>
        <fieldset style={s.evidenceGroup}>
          <legend style={s.evidenceLegend}>Settlement Evidence Packet</legend>
          <div style={s.field}>
            <label style={s.label} htmlFor="settle-evidence-summary">Summary</label>
            <input
              id="settle-evidence-summary"
              style={s.inputSmall}
              value={evidenceSummary}
              onChange={(e) => setEvidenceSummary(e.target.value)}
              placeholder="County sale record metadata"
            />
          </div>
          <div style={s.twoColumn}>
            <div style={s.fieldCompact}>
              <label style={s.label} htmlFor="settle-evidence-type">Type</label>
              <select
                id="settle-evidence-type"
                style={s.inputSmall}
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
              >
                {EVIDENCE_TYPES.map((type) => (
                  <option key={type} value={type}>{EVIDENCE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div style={s.fieldCompact}>
              <label style={s.label} htmlFor="settle-evidence-confidence">Confidence</label>
              <select
                id="settle-evidence-confidence"
                style={s.inputSmall}
                value={evidenceConfidence}
                onChange={(e) => setEvidenceConfidence(e.target.value as EvidenceConfidence)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div style={s.fieldCompact}>
            <label style={s.label} htmlFor="settle-evidence-label">Label</label>
            <input
              id="settle-evidence-label"
              style={s.inputSmall}
              value={evidenceLabel}
              onChange={(e) => setEvidenceLabel(e.target.value)}
              placeholder={EVIDENCE_LABELS[evidenceType]}
            />
          </div>
          <div style={s.twoColumn}>
            <div style={s.fieldCompact}>
              <label style={s.label} htmlFor="settle-evidence-source">Source</label>
              <input
                id="settle-evidence-source"
                style={s.inputSmall}
                value={evidenceSource}
                onChange={(e) => setEvidenceSource(e.target.value)}
                placeholder="County recorder"
              />
            </div>
            <div style={s.fieldCompact}>
              <label style={s.label} htmlFor="settle-evidence-reference">Reference</label>
              <input
                id="settle-evidence-reference"
                style={s.inputSmall}
                value={evidenceReference}
                onChange={(e) => setEvidenceReference(e.target.value)}
                placeholder="Document 9988"
              />
            </div>
          </div>
          <div style={s.fieldCompact}>
            <label style={s.label} htmlFor="settle-evidence-observed">Observed At</label>
            <input
              id="settle-evidence-observed"
              style={s.inputSmall}
              value={evidenceObservedAt}
              onChange={(e) => setEvidenceObservedAt(e.target.value)}
              placeholder="2026-05-26"
              inputMode="numeric"
            />
          </div>
          <div style={s.fieldCompact}>
            <label style={s.label} htmlFor="settle-evidence-notes">Notes</label>
            <textarea
              id="settle-evidence-notes"
              style={s.textarea}
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              placeholder="Public-safe metadata only"
              rows={2}
            />
          </div>
        </fieldset>
        {error && <p id="settle-error" style={s.error} role="alert">{error}</p>}
        <div style={s.buttons}>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.confirm, opacity: settling ? 0.6 : 1 }}
            onClick={handleSettle}
            disabled={settling || (!hostToken && !userToken)}
          >
            {settling ? 'Settling...' : 'Confirm Settlement'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    padding: 24,
    width: 460,
    maxWidth: '90vw',
    maxHeight: '88vh',
    overflow: 'auto',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  desc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: '0 0 16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 14,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  input: {
    padding: '12px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 18,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputSmall: {
    padding: '9px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '9px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    lineHeight: 1.35,
    outline: 'none',
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  },
  evidenceGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    margin: '14px 0 16px',
    padding: 12,
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
  },
  evidenceLegend: {
    padding: '0 6px',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 8,
  },
  fieldCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  hint: {
    fontSize: 13,
    color: 'var(--text-muted)',
    margin: '0 0 16px',
  },
  error: {
    fontSize: 13,
    color: '#4c0519',
    fontWeight: 700,
    margin: '0 0 16px',
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
  cancel: {
    flex: 1,
    padding: '10px',
    background: '#FFFFFF',
    border: '1px solid rgba(0, 0, 0, 0.18)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirm: {
    flex: 1,
    padding: '10px',
    background: 'var(--accent-warning)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
