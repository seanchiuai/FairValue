import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ChevronDown,
  X,
  Home,
  GitCompareArrows,
  Map as MapIcon,
  UserRound,
  Users,
} from 'lucide-react';
import MarketCard from '../components/MarketCard';
import FeaturedMarket from '../components/FeaturedMarket';
import { useProperties } from '../data/properties';
import { usePropertyComparison } from '../hooks/usePropertyComparison';
import CompareTray from '../components/CompareTray';
import './MarketsLanding.css';

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
  const [compareLimitReached, setCompareLimitReached] = useState(false);
  const sortButtonRef = useRef(null);
  const comparison = usePropertyComparison();

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

  const selectSort = useCallback((value) => {
    setSortBy(value);
    setShowSortDropdown(false);
    sortButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showSortDropdown) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setShowSortDropdown(false);
      sortButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSortDropdown]);

  const hasFilters = homeType !== 'All' || minBeds !== 'Any' || searchQuery;
  const featuredProperty = properties.length > 0
    ? properties.reduce((best, p) => (p.price > (best?.price || 0) ? p : best), properties[0])
    : null;

  const handleToggleCompare = useCallback((propertyId) => {
    const wasCompared = comparison.isCompared(propertyId);
    const added = comparison.toggle(propertyId);
    if (!wasCompared && !added) {
      setCompareLimitReached(true);
      window.setTimeout(() => setCompareLimitReached(false), 2400);
      return;
    }
    setCompareLimitReached(false);
  }, [comparison]);

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#55565C', fontSize: 16 }}>Loading properties...</div>;
  }

  return (
    <main className="markets-page">
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
              aria-label="Search properties"
              placeholder="Search by address, city, or brokerage..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="header-right">
          <Link to="/join" className="room-link" aria-label="Host or join a room" title="Host or join a room">
            <Users size={14} />
            <span className="room-link-label">Host or join</span>
          </Link>
          <Link to="/compare" className="compare-link" aria-label={`Compare ${comparison.count} properties`} title="Compare selected properties">
            <GitCompareArrows size={14} />
            <span className="compare-link-label">Compare{comparison.count ? ` (${comparison.count})` : ''}</span>
          </Link>
          <Link to="/me" className="profile-link" aria-label="Open prediction profile">
            <UserRound size={14} />
            Profile
          </Link>
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

      <section className="markets-landing-hero" aria-labelledby="markets-landing-title">
        <div className="markets-landing-hero__copy">
          <span className="markets-landing-hero__kicker">Live property intelligence</span>
          <h1 id="markets-landing-title">Make the call. See the market move.</h1>
          <p>FairValue turns property evidence into a live, social valuation room. Compare a listing, host an over/under market, and leave a replayable record of the decision.</p>
          <div className="markets-landing-hero__actions">
            <Link to="/join" className="markets-landing-hero__primary"><Users size={15} /> Host a room</Link>
            <Link to="/join" className="markets-landing-hero__secondary"><GitCompareArrows size={15} /> Join with a code</Link>
          </div>
          <div className="markets-landing-hero__status" role="status">
            <span className="markets-landing-hero__status-dot" />
            <strong>{properties.length} properties ready</strong>
            <span>· Simulation credits only</span>
          </div>
        </div>
        <div className="markets-landing-hero__signal" aria-label="FairValue workflow">
          <div className="markets-landing-hero__signal-top">
            <span>Room signal</span>
            <span className="markets-landing-hero__signal-live">LIVE</span>
          </div>
          <div className="markets-landing-hero__signal-line" />
          <div className="markets-landing-hero__signal-metric">
            <strong>Over / Under</strong>
            <span>Ask the group before the evidence settles the question.</span>
          </div>
          <div className="markets-landing-hero__signal-grid">
            <div><strong>01</strong><span>Choose</span></div>
            <div><strong>02</strong><span>Trade</span></div>
            <div><strong>03</strong><span>Replay</span></div>
          </div>
        </div>
      </section>

      {/* Featured */}
      {featuredProperty && <FeaturedMarket property={featuredProperty} />}

      <section className="markets-landing-principles" aria-label="FairValue product capabilities">
        <article><span>01</span><h2>Ground the question</h2><p>Every market starts from a property snapshot with price, provenance, neighborhood context, and visible limitations.</p></article>
        <article><span>02</span><h2>Make the call together</h2><p>Use simulation credits to test conviction, add a reason, and watch the LMSR probability respond to the room.</p></article>
        <article><span>03</span><h2>Keep the record</h2><p>Settlement evidence, public recap, replay verification, and your private room library make the decision reviewable later.</p></article>
      </section>

      <section className="markets-landing-how" aria-labelledby="markets-how-title">
        <div className="markets-landing-how__intro"><span className="markets-landing-hero__kicker">How it works</span><h2 id="markets-how-title">From listing to shared conviction in one room.</h2><p>Use the browse surface for context, the room for disagreement, and the recap for accountability.</p></div>
        <ol className="markets-landing-how__steps">
          <li><strong>Choose a property</strong><span>Search the snapshot or compare several candidates side by side.</span></li>
          <li><strong>Host or join</strong><span>Set the over/under question, invite the room, and trade simulation credits with a reason.</span></li>
          <li><strong>Settle and return</strong><span>Record evidence, verify the replay, export the recap, and find the room again in Profile.</span></li>
        </ol>
      </section>

      <section className="markets-landing-use-cases" aria-label="FairValue use cases">
        <div><span>For property teams</span><strong>Make valuation review participatory.</strong><p>Turn an opinionated pricing conversation into a visible market with a shared record.</p></div>
        <div><span>For classrooms and workshops</span><strong>Teach calibration with evidence.</strong><p>Let people see how conviction, information, and settlement change a probability.</p></div>
        <div><span>For curious buyers</span><strong>Pressure-test your first impression.</strong><p>Compare the snapshot, invite another perspective, and keep the reasoning close to the property.</p></div>
      </section>

      {/* Filters Bar */}
      <section className="filters-bar" aria-label="Property filters">
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
              ref={sortButtonRef}
              className="sort-trigger"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              aria-label={`Sort markets by ${SORT_OPTIONS.find(o => o.value === sortBy)?.label}`}
              aria-expanded={showSortDropdown}
              aria-haspopup="menu"
              aria-controls="markets-sort-menu"
            >
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
              <ChevronDown size={14} className={showSortDropdown ? 'open' : ''} />
            </button>

            {showSortDropdown && (
              <div className="sort-menu" id="markets-sort-menu" role="menu">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`sort-option ${sortBy === option.value ? 'active' : ''}`}
                    onClick={() => selectSort(option.value)}
                    role="menuitemradio"
                    aria-checked={sortBy === option.value}
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

      <section className={`results-layout ${showMap ? 'with-map' : ''}`} aria-label="Property results">
        <div className="results-list">
          {/* Grid */}
          <section className="markets-grid">
            {sortedProperties.map((property) => (
              <MarketCard
                key={property.id}
                property={property}
                chartData={chartDataMap[property.id]?.map(d => d.prob)}
                compared={comparison.isCompared(property.id)}
                onToggleCompare={handleToggleCompare}
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
          <div className="map-dock">
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>Loading map...</div>}>
              <PropertyMap properties={sortedProperties} />
            </Suspense>
          </div>
        )}
      </section>

      <section className="markets-landing-faq" aria-labelledby="markets-faq-title">
        <div><span className="markets-landing-hero__kicker">Built for review</span><h2 id="markets-faq-title">A market is more useful when the reasoning survives the meeting.</h2></div>
        <div className="markets-landing-faq__list">
          <details><summary>What is FairValue?</summary><p>A collaborative property valuation game. Participants trade simulation credits around a defined question, then a host records settlement evidence.</p></details>
          <details><summary>Does a market produce an appraisal?</summary><p>No. The probability and implied fair value are market signals for discussion, not an appraisal, investment rating, or professional credential.</p></details>
          <details><summary>What remains after a room ends?</summary><p>Settled rooms keep a public-safe recap and replay verification. Your signed browser identity keeps private room history, watchlist items, and alerts in your profile.</p></details>
        </div>
      </section>

      <footer className="footer">
        <div className="markets-footer-grid">
          <div><strong>Product</strong><span>Evidence-led property prediction rooms.</span></div>
          <div><strong>Explore</strong><Link to="/compare">Compare properties</Link><Link to="/me">Prediction profile</Link></div>
          <div><strong>Trust</strong><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
        </div>
        <p>© 2026 FairValue · {properties.length} properties in San Francisco 94110 · Simulation credits only</p>
      </footer>

      {compareLimitReached && <div className="markets-compare-limit" role="status">Comparison is limited to 4 properties. Remove one before adding another.</div>}
      <CompareTray propertyIds={comparison.propertyIds} max={comparison.max} onRemove={comparison.remove} onClear={comparison.clear} />

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
        .logo-text { font-size: 20px; font-weight: 600; letter-spacing: 0; }
        .header-center { flex: 1; max-width: 420px; margin: 0 32px; }
        .search-container { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 12px; color: #55565C; }
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
        .search-input::placeholder { color: #55565C; }
        .search-input:focus { background: #FFF; border-color: #D2D2D7; box-shadow: 0 0 0 3px rgba(0,113,227,0.1); }
        .search-clear {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #55565C;
          cursor: pointer;
          padding: 4px;
          display: flex;
          border-radius: 50%;
        }
        .search-clear:hover { background: #E8E8ED; color: #1D1D1F; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .profile-link,
        .room-link {
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
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .profile-link svg,
        .room-link svg { color: #636366; }
        .profile-link:hover,
        .room-link:hover { border-color: #55565C; }
        .room-link {
          color: #005FCC;
          border-color: rgba(0,95,204,0.3);
        }
        .room-link svg { color: #005FCC; }
        .room-link:hover { border-color: #005FCC; background: #F2F7FF; }
        .room-link-label { white-space: nowrap; }
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
        .map-toggle:hover { border-color: #55565C; }
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
          color: #55565C;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .clear-btn:hover { background: rgba(180,35,24,0.08); border-color: rgba(180,35,24,0.3); color: #B42318; }

        .filters-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .sort-dropdown { position: relative; }
        .sort-label { color: #55565C; font-size: 12px; margin-right: 6px; }
        .sort-trigger {
          display: flex; align-items: center; gap: 6px; padding: 6px 12px;
          background: #FFF; border: 1px solid #E8E8ED; border-radius: 8px;
          color: #1D1D1F; font-size: 12px; font-weight: 500; cursor: pointer;
        }
        .sort-trigger:hover { border-color: #D2D2D7; }
        .sort-trigger svg { transition: transform 0.2s ease; color: #55565C; }
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
        .results-count { color: #55565C; font-size: 12px; font-weight: 600; }

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
          padding: 80px 24px; color: #55565C; text-align: center;
        }
        .empty-icon { color: #D2D2D7; margin-bottom: 16px; }
        .empty-state h3 { font-size: 17px; color: #1D1D1F; margin-bottom: 6px; font-weight: 600; }
        .empty-state p { font-size: 14px; }

        .footer { padding: 32px; text-align: center; color: #55565C; font-size: 12px; }

        @media (max-width: 768px) {
          .header { padding: 0 16px; height: 52px; }
          .header-center { display: none; }
          .room-link { padding: 6px 8px; }
          .room-link-label { display: none; }
          .compare-link-label { display: none; }
          .filters-bar { width: 100%; box-sizing: border-box; padding: 10px 16px; flex-direction: column; align-items: flex-start; gap: 8px; overflow: hidden; }
          .filters-left { width: 100%; min-width: 0; }
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
    </main>
  );
}

export default Markets;
