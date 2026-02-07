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

const rawData: any[] = require('./properties.json');

export const properties: Property[] = rawData.map((item, index) => {
  const addr = item.address || {};
  const photos = (item.responsivePhotos || []).flatMap((rp: any) => {
    const jpegs = rp?.mixedSources?.jpeg || [];
    return jpegs.map((j: any) => ({ url: j.url, width: j.width }));
  });
  // Pick the best card-size image (768w) or fallback
  const bestPhoto = photos.find((p: any) => p.width === 768) || photos.find((p: any) => p.width === 576) || photos[0];

  return {
    id: String(item.zpid || index + 1),
    zpid: item.zpid,
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
    schools: (item.schools || []).map((s: any) => ({
      name: s.name || '',
      rating: s.rating ?? null,
      distance: s.distance || 0,
      level: s.level || '',
      link: s.link || '',
    })),
    priceHistory: (item.priceHistory || []).map((ph: any) => ({
      date: ph.date || '',
      event: ph.event || '',
      price: ph.price || 0,
      source: ph.source || '',
    })),
  };
});
