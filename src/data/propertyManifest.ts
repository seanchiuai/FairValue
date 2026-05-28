import { useEffect, useState } from 'react';

export interface PropertyManifestRecord {
  property_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  provider_source: string;
  last_observed_at: string | null;
  field_coverage_percent: number;
  missing_fields: string[];
  missing_critical_fields: string[];
  legal_disclaimer: {
    sha256: string;
    excerpt: string;
  } | null;
}

export interface PropertyDataManifest {
  schema_version: 'fairvalue.propertyDataManifest.v1';
  dataset_id: string;
  source_kind: string;
  source_files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
  property_count: number;
  provider_summary: Array<{
    provider: string;
    count: number;
  }>;
  freshness: {
    dated_records: number;
    undated_records: number;
    earliest_observed_at: string | null;
    latest_observed_at: string | null;
  };
  legal_limitations: string[];
  records: PropertyManifestRecord[];
}

let cachedManifest: PropertyDataManifest | null = null;
let fetchPromise: Promise<PropertyDataManifest | null> | null = null;

function fetchManifest(): Promise<PropertyDataManifest | null> {
  if (cachedManifest) return Promise.resolve(cachedManifest);
  if (fetchPromise) return fetchPromise;
  const publicBase = import.meta.env.BASE_URL.replace(/\/$/, '');
  fetchPromise = fetch(`${publicBase}/data/property-data-manifest.json`)
    .then((res) => (res.ok ? res.json() : null))
    .then((manifest: PropertyDataManifest | null) => {
      cachedManifest = manifest;
      return cachedManifest;
    })
    .catch(() => null);
  return fetchPromise;
}

export function usePropertyDataManifest(): { manifest: PropertyDataManifest | null; loading: boolean } {
  const [manifest, setManifest] = useState<PropertyDataManifest | null>(cachedManifest);
  const [loading, setLoading] = useState(!cachedManifest);

  useEffect(() => {
    if (cachedManifest) return;
    let cancelled = false;
    fetchManifest().then((data) => {
      if (cancelled) return;
      setManifest(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, loading };
}
