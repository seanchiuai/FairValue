const SETTLEMENT_EVIDENCE_TYPES = new Set([
  'sale_record',
  'appraisal',
  'signed_valuation',
  'mls_update',
  'permit_record',
  'rental_outcome',
  'insurer_notice',
  'public_record',
  'host_attestation',
]);

const SETTLEMENT_EVIDENCE_CONFIDENCES = new Set(['low', 'medium', 'high']);
const MAX_SETTLEMENT_EVIDENCE_ITEMS = 6;

function sanitizeText(value, maxLength) {
  return String(value || '').trim().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, maxLength);
}

function defaultSettlementEvidence(actualPrice) {
  return {
    schema_version: 'settlement-evidence/v1',
    status: 'host_attested',
    actual_price: actualPrice,
    summary: 'Host entered the settlement value without attaching external evidence metadata.',
    items: [
      {
        type: 'host_attestation',
        label: 'Host-entered settlement value',
        source: 'FairValue host settlement flow',
        reference: 'Room settlement form',
        observed_at: null,
        confidence: 'low',
        notes: 'No sale record, appraisal, or signed valuation metadata was supplied.',
      },
    ],
    limitations: [
      'Evidence metadata is host-submitted and not independently verified by FairValue.',
      'FairValue stores public-safe evidence metadata, not private document contents.',
      'Settlement affects simulation-credit payouts only and is not a FairValue appraisal.',
    ],
  };
}

function validateObservedAt(value) {
  const observedAt = sanitizeText(value, 40);
  if (!observedAt) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/.test(observedAt)) {
    return { error: 'Settlement evidence observed_at must be an ISO-like date string' };
  }
  return { value: observedAt };
}

function normalizeEvidenceItem(rawItem, index) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return { error: `Settlement evidence item ${index + 1} must be an object` };
  }

  const type = sanitizeText(rawItem.type, 40) || 'host_attestation';
  if (!SETTLEMENT_EVIDENCE_TYPES.has(type)) {
    return { error: `Settlement evidence item ${index + 1} has an unsupported type` };
  }

  const confidence = sanitizeText(rawItem.confidence, 20) || (type === 'host_attestation' ? 'low' : 'medium');
  if (!SETTLEMENT_EVIDENCE_CONFIDENCES.has(confidence)) {
    return { error: `Settlement evidence item ${index + 1} confidence must be low, medium, or high` };
  }

  const observedAt = validateObservedAt(rawItem.observed_at);
  if (observedAt?.error) return observedAt;

  const label = sanitizeText(rawItem.label, 80) || type.replace(/_/g, ' ');
  const source = sanitizeText(rawItem.source, 120);
  const reference = sanitizeText(rawItem.reference, 180);
  const notes = sanitizeText(rawItem.notes, 240);
  if (!source && !reference) {
    return { error: `Settlement evidence item ${index + 1} must include a source or reference` };
  }

  return {
    value: {
      type,
      label,
      source: source || 'Unspecified public source',
      reference: reference || null,
      observed_at: observedAt?.value || null,
      confidence,
      notes: notes || null,
    },
  };
}

function validateSettlementEvidencePayload(rawEvidence, actualPrice) {
  if (rawEvidence == null) {
    return { value: defaultSettlementEvidence(actualPrice) };
  }
  if (typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) {
    return { error: 'Settlement evidence must be an object with an items array' };
  }

  const rawItems = Array.isArray(rawEvidence.items) ? rawEvidence.items : [];
  if (rawItems.length > MAX_SETTLEMENT_EVIDENCE_ITEMS) {
    return { error: `Settlement evidence supports up to ${MAX_SETTLEMENT_EVIDENCE_ITEMS} items` };
  }

  const items = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const normalized = normalizeEvidenceItem(rawItems[index], index);
    if (normalized.error) return { error: normalized.error };
    items.push(normalized.value);
  }

  const fallback = defaultSettlementEvidence(actualPrice);
  return {
    value: {
      schema_version: 'settlement-evidence/v1',
      status: items.length > 0 ? 'metadata_attached' : 'host_attested',
      actual_price: actualPrice,
      summary: sanitizeText(rawEvidence.summary, 180) || fallback.summary,
      items: items.length ? items : fallback.items,
      limitations: fallback.limitations,
    },
  };
}

module.exports = {
  MAX_SETTLEMENT_EVIDENCE_ITEMS,
  SETTLEMENT_EVIDENCE_TYPES,
  defaultSettlementEvidence,
  validateSettlementEvidencePayload,
};
