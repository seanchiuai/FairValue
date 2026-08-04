import {
  MAX_COMPARE_PROPERTIES,
  buildComparePath,
  formatComparisonMoney,
  formatComparisonPercent,
  toggleComparedProperty,
} from './propertyComparison';

describe('property comparison state', () => {
  it('deduplicates and caps shared comparison paths', () => {
    const ids = ['1', '2', '3', '4'];
    expect(toggleComparedProperty(ids, '5')).toEqual(ids);
    expect(ids).toHaveLength(MAX_COMPARE_PROPERTIES);
    expect(buildComparePath(['1', '2', '1'])).toBe('/compare?ids=1,2');
  });

  it('removes an existing item and formats missing data honestly', () => {
    expect(toggleComparedProperty(['1', '2'], '1')).toEqual(['2']);
    expect(formatComparisonMoney(null)).toBe('Not available');
    expect(formatComparisonPercent(-4.25)).toBe('-4.3%');
  });
});
