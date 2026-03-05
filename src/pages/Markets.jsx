import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import {
  Search,
  ChevronDown,
  X,
  Home,
  Map as MapIcon,
} from 'lucide-react';
import MarketCard from '../components/MarketCard';
import FeaturedMarket from '../components/FeaturedMarket';
import { useProperties } from '../data/properties';

const PropertyMap = React.lazy(() => import('../components/PropertyMap'));

const SORT_OPTIONS = [
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'newest', label: 'Recently Sold' },
  { value: 'sqft', label: 'Largest' },
  { value: 'address', label: 'Address A-Z' },
];

const HOME_TYPES = ['All', 'House', 'Condo', 'Multi-Family', 'Apartment', 'Lot'];
const TYPE_MAP = { 'House': 'SINGLE_FAMILY', 'Condo': 'CONDO', 'Multi-Family': 'MULTI_FAMILY', 'Apartment': 'APARTMENT', 'Lot': 'LOT' };

const BED_OPTIONS = ['Any', '1+', '2+', '3+', '4+'];

function Markets() {
  const { properties, loading } = useProperties();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('price-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [homeType, setHomeType] = useState('All');
  const [minBeds, setMinBeds] = useState('Any');
  const [showMap, setShowMap] = useState(true);
  const [chartDataMap, setChartDataMap] = useState({});

  const fetchCharts = useCallback(() => {
    fetch('/api/markets/charts')
      .then(r => r.ok ? r.json() : {})
      .then(data => setChartDataMap(data))
      .catch(() => console.warn('Chart data unavailable'));
  }, []);

  useEffect(() => {
    fetchCharts();
    const interval = setInterval(fetchCharts, 30000);
    return () => clearInterval(interval);
  }, [fetchCharts]);

  const filteredProperties = useMemo(() => properties.filter((property) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      property.address.toLowerCase().includes(q) ||
      property.city.toLowerCase().includes(q) ||
      property.zipCode.includes(q) ||
      (property.brokerageName || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (homeType !== 'All' && property.homeType !== TYPE_MAP[homeType]) return false;

    if (minBeds !== 'Any') {
      const min = parseInt(minBeds);
      if ((property.bedrooms || 0) < min) return false;
    }

    return true;
  }), [properties, searchQuery, homeType, minBeds]);

  const sortedProperties = useMemo(() => [...filteredProperties].sort((a, b) => {
    switch (sortBy) {
      case 'price-desc': return (b.price || 0) - (a.price || 0);
      case 'price-asc': return (a.price || 0) - (b.price || 0);
      case 'newest': return (b.dateSoldString || '').localeCompare(a.dateSoldString || '');
      case 'sqft': return (b.livingArea || 0) - (a.livingArea || 0);
      case 'address': return a.address.localeCompare(b.address);
      default: return 0;
    }
  }), [filteredProperties, sortBy]);

  const hasFilters = homeType !== 'All' || minBeds !== 'Any' || searchQuery;
  const featuredProperty = properties.length > 0
    ? properties.reduce((best, p) => (p.price > (best?.price || 0) ? p : best), properties[0])
    : null;

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8E8E93', fontSize: 16 }}>Loading properties...</div>;
  }

  return (
    <div className="markets-page">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <Home className="logo-icon" size={24} strokeWidth={1.5} />
            <span className="logo-text">FairValue</span>
          </div>
        </div>

        <div className="header-center">
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Search by address, city, or brokerage..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="header-right">
          <button
            type="button"
            className={`map-toggle ${showMap ? 'active' : ''}`}
            onClick={() => setShowMap((prev) => !prev)}
            aria-pressed={showMap}
          >
            <MapIcon size={14} />
            Map View
          </button>
        </div>
      </header>

      {/* Featured */}
      {featuredProperty && <FeaturedMarket property={featuredProperty} />}

      {/* Filters Bar */}
      <section className="filters-bar">
        <div className="filters-left">
          {/* Home Type Tabs */}
          <div className="filter-tabs">
            {HOME_TYPES.map((type) => (
              <button
                key={type}
                className={`tab ${homeType === type ? 'active' : ''}`}
                onClick={() => setHomeType(type)}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="filter-divider" />

          {/* Bedrooms */}
          <div className="filter-tabs">
            {BED_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`tab ${minBeds === opt ? 'active' : ''}`}
                onClick={() => setMinBeds(opt)}
              >
                {opt === 'Any' ? 'Any Beds' : `${opt} Beds`}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button className="clear-btn" onClick={() => { setHomeType('All'); setMinBeds('Any'); setSearchQuery(''); }}>
              <X size={13} />
              Clear
            </button>
          )}
        </div>

        <div className="filters-right">
          <div className="sort-dropdown">
            <span className="sort-label">Sort</span>
            <button
              className="sort-trigger"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
            >
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
              <ChevronDown size={14} className={showSortDropdown ? 'open' : ''} />
            </button>

            {showSortDropdown && (
              <div className="sort-menu">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`sort-option ${sortBy === option.value ? 'active' : ''}`}
                    onClick={() => { setSortBy(option.value); setShowSortDropdown(false); }}
                  >
                    {option.label}
                    {sortBy === option.value && <span className="check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="results-count">
            {sortedProperties.length} of {properties.length}
          </div>
        </div>
      </section>

      <section className={`results-layout ${showMap ? 'with-map' : ''}`}>
        <div className="results-list">
          {/* Grid */}
          <section className="markets-grid">
            {sortedProperties.map((property) => (
              <MarketCard
                key={property.id}
                property={property}
                chartData={chartDataMap[property.id]?.map(d => d.prob)}
              />
            ))}
          </section>

          {sortedProperties.length === 0 && (
            <div className="empty-state">
              <Search size={48} className="empty-icon" />
              <h3>No properties found</h3>
              <p>Try adjusting your search or filters</p>
            </div>
          )}
        </div>

        {showMap && sortedProperties.length > 0 && (
          <aside className="map-dock">
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>Loading map...</div>}>
              <PropertyMap properties={sortedProperties} />
            </Suspense>
          </aside>
        )}
      </section>

      <footer className="footer">
        <p>© 2026 FairValue · {properties.length} properties in San Francisco 94110</p>
      </footer>

      <style>{`
        .markets-page {
          min-height: 100vh;
          background: #F5F5F7;
          color: #1D1D1F;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 56px;
          background: rgba(255,255,255,0.8);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid #E8E8ED;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .header-left { display: flex; align-items: center; gap: 32px; }
        .logo { display: flex; align-items: center; gap: 8px; color: #1D1D1F; }
        .logo-icon { color: #0071E3; }
        .logo-text { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
        .header-center { flex: 1; max-width: 420px; margin: 0 32px; }
        .search-container { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 12px; color: #AEAEB2; }
        .search-input {
          width: 100%;
          padding: 8px 32px 8px 36px;
          background: #F0F0F2;
          border: 1px solid transparent;
          border-radius: 10px;
          color: #1D1D1F;
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
        }
        .search-input::placeholder { color: #AEAEB2; }
        .search-input:focus { background: #FFF; border-color: #D2D2D7; box-shadow: 0 0 0 3px rgba(0,113,227,0.1); }
        .search-clear {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #AEAEB2;
          cursor: pointer;
          padding: 4px;
          display: flex;
          border-radius: 50%;
        }
        .search-clear:hover { background: #E8E8ED; color: #1D1D1F; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .map-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid #D2D2D7;
          background: #FFF;
          color: #1D1D1F;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .map-toggle svg { color: #636366; }
        .map-toggle:hover { border-color: #AEAEB2; }
        .map-toggle.active {
          color: #0D5C2D;
          background: #F2FBF4;
          border-color: #A5D6A7;
        }
        .map-toggle.active svg { color: #0D5C2D; }

        .filters-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 32px;
          gap: 16px;
          overflow-x: auto;
        }
        .filters-left { display: flex; align-items: center; gap: 8px; flex: 1; overflow-x: auto; scrollbar-width: none; }
        .filters-left::-webkit-scrollbar { display: none; }
        .filter-tabs { display: flex; gap: 2px; flex-shrink: 0; }
        .tab {
          padding: 5px 12px;
          background: transparent;
          border: none;
          border-radius: 980px;
          color: #6E6E73;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .tab:hover { color: #1D1D1F; background: rgba(0,0,0,0.04); }
        .tab.active { color: #1D1D1F; background: #FFF; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-weight: 600; }
        .filter-divider { width: 1px; height: 18px; background: #D2D2D7; flex-shrink: 0; }
        .clear-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 12px;
          background: transparent;
          border: 1px solid #E8E8ED;
          border-radius: 980px;
          color: #8E8E93;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .clear-btn:hover { background: rgba(255,59,48,0.06); border-color: rgba(255,59,48,0.3); color: #FF3B30; }

        .filters-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .sort-dropdown { position: relative; }
        .sort-label { color: #AEAEB2; font-size: 12px; margin-right: 6px; }
        .sort-trigger {
          display: flex; align-items: center; gap: 6px; padding: 6px 12px;
          background: #FFF; border: 1px solid #E8E8ED; border-radius: 8px;
          color: #1D1D1F; font-size: 12px; font-weight: 500; cursor: pointer;
        }
        .sort-trigger:hover { border-color: #D2D2D7; }
        .sort-trigger svg { transition: transform 0.2s ease; color: #AEAEB2; }
        .sort-trigger svg.open { transform: rotate(180deg); }
        .sort-menu {
          position: absolute; top: 100%; right: 0; margin-top: 6px; min-width: 180px;
          background: #FFF; border: 1px solid #E8E8ED; border-radius: 12px; padding: 4px;
          z-index: 50; box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        }
        .sort-option {
          display: flex; align-items: center; justify-content: space-between; width: 100%;
          padding: 8px 10px; background: transparent; border: none; border-radius: 8px;
          color: #6E6E73; font-size: 13px; font-weight: 500; cursor: pointer; text-align: left;
        }
        .sort-option:hover { background: #F5F5F7; color: #1D1D1F; }
        .sort-option.active { color: #0071E3; }
        .sort-option .check { color: #0071E3; font-weight: 600; }
        .results-count { color: #AEAEB2; font-size: 12px; font-weight: 500; }

        .results-layout {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 0 32px 40px;
        }
        .results-layout.with-map .results-list {
          flex: 1;
          min-width: 0;
        }
        .results-layout:not(.with-map) .results-list {
          width: 100%;
        }
        .map-dock {
          width: min(40vw, 460px);
          min-width: 360px;
          position: sticky;
          top: 72px;
          flex-shrink: 0;
        }
        .map-dock .map-wrap {
          height: calc(100vh - 92px);
          min-height: 500px;
          max-height: 760px;
        }

        .markets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
          padding: 4px 0 0;
        }

        .empty-state {
          display: flex; flex-direction: column; align-items: center;
          padding: 80px 24px; color: #AEAEB2; text-align: center;
        }
        .empty-icon { color: #D2D2D7; margin-bottom: 16px; }
        .empty-state h3 { font-size: 17px; color: #1D1D1F; margin-bottom: 6px; font-weight: 600; }
        .empty-state p { font-size: 14px; }

        .footer { padding: 32px; text-align: center; color: #AEAEB2; font-size: 12px; }

        @media (max-width: 768px) {
          .header { padding: 0 16px; height: 52px; }
          .header-center { display: none; }
          .filters-bar { padding: 10px 16px; flex-direction: column; align-items: flex-start; gap: 8px; }
          .filters-right { width: 100%; justify-content: space-between; }
          .results-layout { flex-direction: column; padding: 0 16px 32px; gap: 12px; }
          .results-list { width: 100%; }
          .map-dock {
            width: 100%;
            min-width: 0;
            position: static;
          }
          .map-dock .map-wrap {
            height: 320px;
            min-height: 0;
            max-height: none;
          }
          .markets-grid { grid-template-columns: 1fr; padding: 0; gap: 12px; }
        }
      `}</style>
    </div>
  );
}

export default Markets;
