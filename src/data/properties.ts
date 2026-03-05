import { useState, useEffect } from 'react';

export interface Property {
  id: string;
  zpid: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  bedrooms: number | null;
  bathrooms: number | null;
  livingArea: number | null;
  yearBuilt: number | null;
  price: number;
  zestimate: number | null;
  rentZestimate: number | null;
  homeType: string;
  homeStatus: string;
  dateSoldString: string | null;
  daysOnZillow: number | null;
  description: string;
  brokerageName: string | null;
  imgSrc: string;
  photos: { url: string; width: number }[];
  hdpUrl: string;
  latitude: number;
  longitude: number;
  county: string;
  propertyTaxRate: number | null;
  schools: { name: string; rating: number | null; distance: number; level: string; link: string }[];
  priceHistory: { date: string; event: string; price: number; source: string }[];
}

interface RawPhotoSource {
  url: string;
  width: number;
}

interface RawResponsivePhoto {
  mixedSources?: { jpeg?: RawPhotoSource[] };
}

interface RawPropertyData {
  zpid?: number;
  address?: { streetAddress?: string; city?: string; state?: string; zipcode?: string };
  streetAddress?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  yearBuilt?: number;
  price?: number;
  zestimate?: number;
  rentZestimate?: number;
  homeType?: string;
  homeStatus?: string;
  dateSoldString?: string;
  daysOnZillow?: number;
  description?: string;
  brokerageName?: string;
  responsivePhotos?: RawResponsivePhoto[];
  hdpUrl?: string;
  latitude?: number;
  longitude?: number;
  county?: string;
  propertyTaxRate?: number;
  schools?: Array<{ name?: string; rating?: number; distance?: number; level?: string; link?: string }>;
  priceHistory?: Array<{ date?: string; event?: string; price?: number; source?: string }>;
}

function mapRaw(rawData: RawPropertyData[]): Property[] {
  return rawData.map((item, index) => {
    const addr = item.address || {};
    const photos = (item.responsivePhotos || []).flatMap((rp) => {
      const jpegs = rp?.mixedSources?.jpeg || [];
      return jpegs.map((j) => ({ url: j.url, width: j.width }));
    });
    const bestPhoto = photos.find((p) => p.width === 768) || photos.find((p) => p.width === 576) || photos[0];

    return {
      id: String(item.zpid || index + 1),
      zpid: item.zpid || 0,
      address: item.streetAddress || addr.streetAddress || '',
      city: item.city || addr.city || 'San Francisco',
      state: item.state || addr.state || 'CA',
      zipCode: item.zipcode || addr.zipcode || '94110',
      bedrooms: item.bedrooms ?? null,
      bathrooms: item.bathrooms ?? null,
      livingArea: item.livingArea ?? null,
      yearBuilt: item.yearBuilt ?? null,
      price: item.price || 0,
      zestimate: item.zestimate ?? null,
      rentZestimate: item.rentZestimate ?? null,
      homeType: item.homeType || '',
      homeStatus: item.homeStatus || '',
      dateSoldString: item.dateSoldString || null,
      daysOnZillow: item.daysOnZillow ?? null,
      description: item.description || '',
      brokerageName: item.brokerageName || null,
      imgSrc: bestPhoto?.url || '',
      photos,
      hdpUrl: item.hdpUrl ? `https://www.zillow.com${item.hdpUrl}` : '',
      latitude: item.latitude || 0,
      longitude: item.longitude || 0,
      county: item.county || '',
      propertyTaxRate: item.propertyTaxRate ?? null,
      schools: (item.schools || []).map((s) => ({
        name: s.name || '',
        rating: s.rating ?? null,
        distance: s.distance || 0,
        level: s.level || '',
        link: s.link || '',
      })),
      priceHistory: (item.priceHistory || []).map((ph) => ({
        date: ph.date || '',
        event: ph.event || '',
        price: ph.price || 0,
        source: ph.source || '',
      })),
    };
  });
}

// Module-level cache so the fetch only happens once across all consumers.
let cached: Property[] | null = null;
let fetchPromise: Promise<Property[]> | null = null;

function fetchProperties(): Promise<Property[]> {
  if (cached) return Promise.resolve(cached);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch(`${process.env.PUBLIC_URL}/data/properties.json`)
    .then(res => res.json())
    .then((raw: RawPropertyData[]) => {
      cached = mapRaw(raw);
      return cached;
    });
  return fetchPromise;
}

export function useProperties(): { properties: Property[]; loading: boolean } {
  const [properties, setProperties] = useState<Property[]>(cached || []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    fetchProperties().then(data => {
      setProperties(data);
      setLoading(false);
    });
  }, []);

  return { properties, loading };
}
