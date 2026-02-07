import React from 'react';
import { properties } from '../data/properties';
import PropertyCard from '../components/PropertyCard';

const HomePage: React.FC = () => {
  return (
    <div>
      {properties.slice(0, 12).map(p => (
        <PropertyCard key={p.id} property={p} />
      ))}
    </div>
  );
};

export default HomePage;
