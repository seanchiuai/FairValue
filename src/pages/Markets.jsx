import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, 
  ChevronDown,
  X,
  Home,
  Gavel,
  Map,
  LayoutGrid
} from 'lucide-react';
import MarketCard from '../components/MarketCard';
import FeaturedMarket from '../components/FeaturedMarket';
import PropertyMap from '../components/PropertyMap';
import { properties } from '../data/properties';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('price-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [homeType, setHomeType] = useState('All');
  const [minBeds, setMinBeds] = useState('Any');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const lastScroll = useRef(0);

  // iOS 26-style disappearing nav on scroll
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setNavCollapsed(y > 120 && y > lastScroll.current);
      lastScroll.current = y;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredProperties = properties.filter((property) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      property.address.toLowerCase().includes(q) ||
      property.city.toLowerCase().includes(q) ||
      property.zipCode.includes(q) ||
      (property.brokerageName || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (homeType !== 'All' && property.homeType !== TYPE_MAP[homeType]) return false;
    if (minBeds !== 'Any') {
      if ((property.bedrooms || 0) < parseInt(minBeds)) return false;
    }
    return true;
  });

  const sortedProperties = [...filteredProperties].sort((a, b) => {
    switch (sortBy) {
      case 'price-desc': return (b.price || 0) - (a.price || 0);
      case 'price-asc': return (a.price || 0) - (b.price || 0);
      case 'newest': return (b.dateSoldString || '').localeCompare(a.dateSoldString || '');
      case 'sqft': return (b.livingArea || 0) - (a.livingArea || 0);
      case 'address': return a.address.localeCompare(b.address);
      default: return 0;
    }
  });

  const hasFilters = homeType !== 'All' || minBeds !== 'Any' || searchQuery;
  const featuredProperty = properties.reduce((best, p) => (p.price > (best?.price || 0) ? p : best), properties[0]);

  return (
    <div className="lg-page">
      {/* Liquid Glass Nav */}
      <header className={`lg-nav ${navCollapsed ? 'collapsed' : ''}`}>
        <div className="lg-nav-inner">
          <div className="lg-nav-left">
            <Home className="lg-logo-icon" size={22} strokeWidth={1.8} />
            <span className="lg-logo-text">FairValue</span>
          </div>

          <div className="lg-nav-center">
            <div className="lg-search">
              <Search size={16} className="lg-search-icon" />
              <input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="lg-search-input"
              />
              {searchQuery && (
                <button className="lg-search-clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
              )}
            </div>
          </div>

          <div className="lg-nav-right">
            <button
              className={`lg-view-toggle ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode(viewMode === 'grid' ? 'map' : 'grid')}
              title={viewMode === 'grid' ? 'Map View' : 'Grid View'}
            >
              {viewMode === 'grid' ? <Map size={16} /> : <LayoutGrid size={16} />}
            </button>
            <Link to="/join" className="lg-bid-btn">
              <Gavel size={14} />
              <span>Host a Bid</span>
            </Link>
          </div>
        </div>
      </header>

      <FeaturedMarket property={featuredProperty} />

      {/* Floating Glass Filter Bar */}
      <section className="lg-filters">
        <div className="lg-filters-inner">
          <div className="lg-filter-tabs">
            {HOME_TYPES.map((type) => (
              <button key={type} className={`lg-tab ${homeType === type ? 'active' : ''}`}
                onClick={() => setHomeType(type)}>
                {type}
              </button>
            ))}
            <div className="lg-tab-divider" />
            {BED_OPTIONS.map((opt) => (
              <button key={opt} className={`lg-tab ${minBeds === opt ? 'active' : ''}`}
                onClick={() => setMinBeds(opt)}>
                {opt === 'Any' ? 'Beds' : `${opt}`}
              </button>
            ))}
            {hasFilters && (
              <button className="lg-tab lg-tab-clear" onClick={() => { setHomeType('All'); setMinBeds('Any'); setSearchQuery(''); }}>
                <X size={12} /> Clear
              </button>
            )}
          </div>

          <div className="lg-filter-right">
            <div className="lg-sort-wrap">
              <button className="lg-sort-btn" onClick={() => setShowSortDropdown(!showSortDropdown)}>
                {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                <ChevronDown size={13} className={showSortDropdown ? 'flip' : ''} />
              </button>
              {showSortDropdown && (
                <div className="lg-sort-menu">
                  {SORT_OPTIONS.map((opt) => (
                    <button key={opt.value}
                      className={`lg-sort-opt ${sortBy === opt.value ? 'active' : ''}`}
                      onClick={() => { setSortBy(opt.value); setShowSortDropdown(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      {opt.label}
                      {sortBy === opt.value && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="lg-count">{sortedProperties.length}/{properties.length}</span>
          </div>
        </div>
      </section>

      {/* Content */}
      {viewMode === 'map' ? (
        <PropertyMap properties={sortedProperties} />
      ) : (
        <>
          <section className="lg-grid">
            {sortedProperties.map((p) => (
              <MarketCard key={p.id} property={p} />
            ))}
          </section>

          {sortedProperties.length === 0 && (
            <div className="lg-empty">
              <Search size={40} />
              <h3>No properties found</h3>
              <p>Try adjusting your filters</p>
            </div>
          )}
        </>
      )}

      <footer className="lg-footer">
        © 2026 FairValue · {properties.length} properties · San Francisco 94110
      </footer>

      <style>{`
        .lg-page {
          min-height: 100vh;
          background: var(--bg-mesh);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        }

        /* ─── Glass Nav ─── */
        .lg-nav {
          position: sticky; top: 0; z-index: 100;
          padding: 0 28px;
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .lg-nav-inner {
          display: flex; align-items: center;
          justify-content: space-between;
          height: 56px;
          padding: 0 20px;
          background: rgba(255,255,255,0.55);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.6);
          border-top: none;
          border-radius: 0 0 22px 22px;
          box-shadow:
            inset 0 -1px 0 rgba(0,0,0,0.03),
            0 4px 24px rgba(0,0,0,0.06);
        }
        .lg-nav.collapsed .lg-nav-inner {
          height: 40px;
          border-radius: 0 0 16px 16px;
          background: rgba(255,255,255,0.7);
        }
        .lg-nav.collapsed .lg-nav-center { opacity: 0; pointer-events: none; max-width: 0; }

        .lg-nav-left { display: flex; align-items: center; gap: 8px; }
        .lg-logo-icon { color: #007AFF; }
        .lg-logo-text { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; color: var(--text-primary); }

        .lg-nav-center {
          flex: 1; max-width: 360px; margin: 0 24px;
          transition: all 0.3s;
        }
        .lg-search {
          position: relative; display: flex; align-items: center;
        }
        .lg-search-icon { position: absolute; left: 10px; color: var(--text-muted); }
        .lg-search-input {
          width: 100%; padding: 7px 28px 7px 32px;
          background: rgba(120,120,128,0.08);
          border: 1px solid rgba(0,0,0,0.04);
          border-radius: 14px; color: var(--text-primary);
          font-size: 14px; outline: none;
          transition: all 0.25s;
        }
        .lg-search-input::placeholder { color: var(--text-muted); }
        .lg-search-input:focus {
          background: rgba(255,255,255,0.8);
          border-color: rgba(0,122,255,0.3);
          box-shadow: 0 0 0 3px rgba(0,122,255,0.1);
        }
        .lg-search-clear {
          position: absolute; right: 6px;
          background: rgba(120,120,128,0.12); border: none;
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary); cursor: pointer;
        }

        .lg-nav-right { display: flex; align-items: center; gap: 10px; }
        .lg-view-toggle {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          background: rgba(255,255,255,0.5);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 12px;
          color: var(--text-secondary); cursor: pointer;
          transition: all 0.2s;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);
        }
        .lg-view-toggle:hover { background: rgba(255,255,255,0.7); }
        .lg-view-toggle.active { background: rgba(0,122,255,0.12); color: #007AFF; border-color: rgba(0,122,255,0.2); }
        .lg-bid-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 16px;
          background: rgba(0,122,255,0.85);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 980px;
          color: white; font-size: 13px; font-weight: 600;
          text-decoration: none; cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 8px rgba(0,122,255,0.2);
          transition: all 0.2s;
        }
        .lg-bid-btn:hover { background: rgba(0,122,255,0.95); transform: scale(1.04); }

        /* ─── Glass Filters ─── */
        .lg-filters {
          margin: 0 32px 8px;
        }
        .lg-filters-inner {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(255,255,255,0.45);
          backdrop-filter: blur(30px) saturate(160%);
          -webkit-backdrop-filter: blur(30px) saturate(160%);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 20px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.6),
            0 2px 12px rgba(0,0,0,0.04);
          gap: 8px;
          overflow: visible;
        }

        .lg-filter-tabs { display: flex; gap: 2px; flex-shrink: 0; align-items: center; }
        .lg-tab-divider { width: 1px; height: 16px; background: rgba(0,0,0,0.08); margin: 0 4px; flex-shrink: 0; }
        .lg-tab {
          padding: 5px 12px; background: transparent;
          border: none; border-radius: 980px;
          color: var(--text-secondary); font-size: 12px;
          font-weight: 500; cursor: pointer;
          transition: all 0.2s; white-space: nowrap;
        }
        .lg-tab:hover { color: var(--text-primary); background: rgba(0,0,0,0.04); }
        .lg-tab.active {
          color: var(--text-primary);
          background: rgba(255,255,255,0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.6);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 4px rgba(0,0,0,0.06);
          font-weight: 600;
        }
        .lg-tab-clear {
          display: flex; align-items: center; gap: 3px;
          color: var(--text-muted);
        }
        .lg-tab-clear:hover { color: #FF3B30; background: rgba(255,59,48,0.06); }

        .lg-filter-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .lg-sort-wrap { position: relative; }
        .lg-sort-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 12px;
          background: rgba(255,255,255,0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 12px;
          color: var(--text-primary); font-size: 12px;
          font-weight: 500; cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .lg-sort-btn svg { transition: transform 0.2s; color: var(--text-muted); }
        .lg-sort-btn svg.flip { transform: rotate(180deg); }
        .lg-sort-menu {
          position: absolute; top: calc(100% + 6px); right: 0;
          min-width: 180px; padding: 4px;
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.6);
          border-radius: 16px; z-index: 50;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 32px rgba(0,0,0,0.12);
        }
        .lg-sort-opt {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 8px 12px; background: transparent;
          border: none; border-radius: 10px;
          color: var(--text-secondary); font-size: 13px;
          font-weight: 500; cursor: pointer; text-align: left;
        }
        .lg-sort-opt:hover { background: rgba(0,0,0,0.04); color: var(--text-primary); }
        .lg-sort-opt.active { color: #007AFF; }
        .lg-sort-opt span { color: #007AFF; font-weight: 700; }
        .lg-count { font-size: 12px; color: var(--text-muted); font-weight: 500; }

        /* ─── Grid ─── */
        .lg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 16px; padding: 8px 32px 40px;
        }

        .lg-empty {
          display: flex; flex-direction: column; align-items: center;
          padding: 60px 20px; color: var(--text-muted); text-align: center;
        }
        .lg-empty h3 { font-size: 17px; color: var(--text-primary); margin: 12px 0 4px; font-weight: 600; }
        .lg-empty p { font-size: 14px; }

        .lg-footer { padding: 28px 32px; text-align: center; color: var(--text-muted); font-size: 12px; }

        @media (max-width: 768px) {
          .lg-nav { padding: 0 12px; }
          .lg-nav-inner { padding: 0 12px; height: 50px; border-radius: 0 0 18px 18px; }
          .lg-nav-center { display: none; }
          .lg-filters { margin: 0 16px 8px; }
          .lg-filters-inner { padding: 6px 8px; border-radius: 16px; flex-wrap: nowrap; }
          .lg-filter-tabs { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .lg-filter-tabs::-webkit-scrollbar { display: none; }
          .lg-tab { min-height: 36px; white-space: nowrap; }
          .lg-grid { grid-template-columns: 1fr; padding: 8px 16px 32px; gap: 12px; }
          .lg-bid-btn span { display: none; }
          .lg-bid-btn { padding: 8px 12px; }
          .lg-view-toggle { width: 36px; height: 36px; }
        }
      `}</style>
    </div>
  );
}

export default Markets;
