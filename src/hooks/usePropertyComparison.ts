import { useCallback, useMemo, useState } from 'react';
import {
  MAX_COMPARE_PROPERTIES,
  readComparedPropertyIds,
  toggleComparedProperty,
  writeComparedPropertyIds,
} from '../lib/propertyComparison';

export function usePropertyComparison() {
  const [propertyIds, setPropertyIds] = useState<string[]>(() => readComparedPropertyIds());

  const update = useCallback((next: string[]) => {
    setPropertyIds(next);
    writeComparedPropertyIds(next);
  }, []);

  const toggle = useCallback((propertyId: string) => {
    const next = toggleComparedProperty(propertyIds, propertyId);
    if (next.length === propertyIds.length && !propertyIds.includes(propertyId)) return false;
    update(next);
    return next.includes(propertyId);
  }, [propertyIds, update]);

  const remove = useCallback((propertyId: string) => {
    update(propertyIds.filter((id) => id !== propertyId));
  }, [propertyIds, update]);

  const clear = useCallback(() => update([]), [update]);
  const isCompared = useCallback((propertyId?: string | null) => Boolean(propertyId && propertyIds.includes(propertyId)), [propertyIds]);

  return useMemo(() => ({
    propertyIds,
    setPropertyIds: update,
    toggle,
    remove,
    clear,
    isCompared,
    count: propertyIds.length,
    max: MAX_COMPARE_PROPERTIES,
  }), [clear, isCompared, propertyIds, remove, toggle, update]);
}
