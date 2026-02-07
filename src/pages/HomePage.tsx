import React from 'react';
import { useProperties } from '../data/properties';
import PropertyCard from '../components/PropertyCard';

const HomePage: React.FC = () => {
  const { properties, loading } = useProperties();

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#7F93A8' }}>Loading...</div>;

  return (
    <div>
      {properties.slice(0, 12).map(p => (
        <PropertyCard key={p.id} property={p} />
      ))}
    </div>
  );
};

export default HomePage;
