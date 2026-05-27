import {
  DEFAULT_MARKET_FORMAT,
  getMarketTemplate,
  getMarketTemplateRegistry,
  isPlayableMarketFormat,
  isRegisteredMarketFormat,
  listMarketTemplates,
} from '../marketTemplates';

describe('market template registry', () => {
  it('exposes playable and draft-only market contracts', () => {
    expect(DEFAULT_MARKET_FORMAT).toBe('binary_over_under');
    expect(getMarketTemplateRegistry().schema_version).toBe('market-template-registry/v1');
    expect(listMarketTemplates().length).toBeGreaterThanOrEqual(4);
    expect(getMarketTemplate('binary_over_under')).toEqual(
      expect.objectContaining({
        status: 'playable',
        pricing_engine: 'lmsr_binary_v1',
      })
    );
    expect(getMarketTemplate('range_price_band')).toEqual(
      expect.objectContaining({
        status: 'playable',
        pricing_engine: 'lmsr_multi_outcome_v1',
      })
    );
    expect(getMarketTemplate('rent_yield_over_under')).toEqual(
      expect.objectContaining({
        status: 'playable',
        pricing_engine: 'lmsr_binary_v1',
      })
    );
    expect(isRegisteredMarketFormat('range_price_band')).toBe(true);
    expect(isPlayableMarketFormat('range_price_band')).toBe(true);
    expect(isRegisteredMarketFormat('rent_yield_over_under')).toBe(true);
    expect(isPlayableMarketFormat('rent_yield_over_under')).toBe(true);
  });

  it('returns cloned templates so consumers cannot mutate the registry singleton', () => {
    const templates = listMarketTemplates();
    templates[0].label = 'Mutated';
    templates[0].settlement_inputs.push('mutated');

    const nextBinary = getMarketTemplate('binary_over_under');
    expect(nextBinary?.label).toBe('Binary over/under');
    expect(nextBinary?.settlement_inputs).not.toContain('mutated');
  });
});
