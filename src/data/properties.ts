export interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  beds: number;
  baths: number;
  sqft: number;
  currentPrice: number;
  marketPrice: number;
  volume: number;
  participantCount: number;
  imageUrl?: string;
  daysOnMarket: number;
}

export const mockProperties: Property[] = [
  {
    id: '1',
    address: '123 Valencia St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94103',
    beds: 3,
    baths: 2,
    sqft: 1450,
    currentPrice: 850000,
    marketPrice: 875000,
    volume: 125000,
    participantCount: 47,
    daysOnMarket: 12,
  },
  {
    id: '2',
    address: '456 Mission St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94105',
    beds: 2,
    baths: 1,
    sqft: 980,
    currentPrice: 720000,
    marketPrice: 710000,
    volume: 89000,
    participantCount: 32,
    daysOnMarket: 8,
  },
  {
    id: '3',
    address: '789 Capp St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94110',
    beds: 4,
    baths: 3,
    sqft: 2100,
    currentPrice: 1200000,
    marketPrice: 1185000,
    volume: 210000,
    participantCount: 89,
    daysOnMarket: 5,
  },
  {
    id: '4',
    address: '321 24th St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94110',
    beds: 2,
    baths: 2,
    sqft: 1150,
    currentPrice: 950000,
    marketPrice: 965000,
    volume: 156000,
    participantCount: 61,
    daysOnMarket: 18,
  },
  {
    id: '5',
    address: '654 Folsom St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94107',
    beds: 1,
    baths: 1,
    sqft: 750,
    currentPrice: 650000,
    marketPrice: 645000,
    volume: 67000,
    participantCount: 24,
    daysOnMarket: 21,
  },
  {
    id: '6',
    address: '987 Alabama St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94110',
    beds: 3,
    baths: 2,
    sqft: 1650,
    currentPrice: 1100000,
    marketPrice: 1120000,
    volume: 189000,
    participantCount: 73,
    daysOnMarket: 3,
  },
];
