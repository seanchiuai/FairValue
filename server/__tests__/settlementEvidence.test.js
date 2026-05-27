const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultSettlementEvidence,
  validateSettlementEvidencePayload,
} = require('../settlementEvidence');

test('default settlement evidence is public-safe host attestation metadata', () => {
  const packet = defaultSettlementEvidence(735000);

  assert.equal(packet.schema_version, 'settlement-evidence/v1');
  assert.equal(packet.status, 'host_attested');
  assert.equal(packet.actual_price, 735000);
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0].type, 'host_attestation');
  assert.equal(packet.items[0].confidence, 'low');
  assert.match(packet.limitations.join(' '), /simulation-credit/);
});

test('settlement evidence validator sanitizes metadata and rejects unsupported evidence', () => {
  const valid = validateSettlementEvidencePayload({
    summary: '<b>Final sale metadata</b> from county record.',
    items: [
      {
        type: 'sale_record',
        label: '<i>County sale record</i>',
        source: 'County recorder',
        reference: 'Document 12345',
        observed_at: '2026-05-25',
        confidence: 'high',
        notes: '<script>ignore()</script>Recorded sale price metadata only.',
      },
    ],
  }, 742000);

  assert.equal(valid.error, undefined);
  assert.equal(valid.value.status, 'metadata_attached');
  assert.equal(valid.value.summary, 'Final sale metadata from county record.');
  assert.equal(valid.value.items[0].label, 'County sale record');
  assert.equal(valid.value.items[0].notes, 'ignore()Recorded sale price metadata only.');

  const invalidType = validateSettlementEvidencePayload({
    items: [{ type: 'secret_pdf_upload', source: 'Mailbox' }],
  }, 742000);
  assert.match(invalidType.error, /unsupported type/);

  const missingSource = validateSettlementEvidencePayload({
    items: [{ type: 'appraisal', label: 'Appraisal' }],
  }, 742000);
  assert.match(missingSource.error, /source or reference/);

  const badDate = validateSettlementEvidencePayload({
    items: [{ type: 'appraisal', source: 'Appraiser', observed_at: 'yesterday' }],
  }, 742000);
  assert.match(badDate.error, /observed_at/);
});
