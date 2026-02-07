import React, { useState } from 'react';
import { 
  Home, 
  Search, 
  Filter, 
  TrendingUp, 
  Users, 
  Clock, 
  DollarSign,
  MapPin,
  ChevronDown,
  X,
  Wallet,
  User
} from 'lucide-react';
import PropertyCard from '../components/PropertyCard';
import { mockProperties, Property } from '../data/properties';
import './HomePage.css';

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending' },
  { value: 'volume', label: 'Highest Volume' },
  { value: 'ending', label: 'Ending Soon' },
  { value: 'newest', label: 'Newest' },
  { value: 'mispricing', label: 'Biggest Mispricing' },
];

const NEIGHBORHOODS = ['All', 'Mission District', 'SoMa', 'Castro', 'Noe Valley'];

const HomePage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNeighborhood, setActiveNeighborhood] = useState('All');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('trending');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const clearFilters = () => {
    setActiveFilters([]);
    setActiveNeighborhood('All');
  };

  const filteredProperties = mockProperties.filter((property: Property) => {
    const matchesSearch = 
      property.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.zipCode.includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeNeighborhood !== 'All') {
      // Simplified filter logic
      if (activeNeighborhood === 'Mission District' && property.zipCode !== '94103' && property.zipCode !== '94110') {
        return false;
      }
    }

    return true;
  });

  const featuredProperty = mockProperties[2];
  const priceDelta = featuredProperty.marketPrice - featuredProperty.currentPrice;
  const priceDeltaPercent = ((priceDelta / featuredProperty.currentPrice) * 100).toFixed(1);

  return (
    <div className="home-page">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <Home className="logo-icon" size={28} strokeWidth={1.5} />
            <span className="logo-text">FairValue</span>
          </div>
          <nav className="nav">
            <a href="#" className="nav-link active">Markets</a>
          </nav>
        </div>

        <div className="header-center">
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Search address or neighborhood..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="header-right">
          <div className="balance">
            <Wallet size={16} />
            <span>$0.00</span>
          </div>
          <button className="btn-connect">
            <User size={18} />
            <span>Connect</span>
          </button>
        </div>
      </header>

      {/* Featured Market Hero */}
      <section className="featured-hero">
        <div className="featured-content">
          <div className="featured-badge">
            <TrendingUp size={14} />
            <span>Trending</span>
          </div>
          
          <h1 className="featured-title">{featuredProperty.address}</h1>
          
          <div className="featured-location">
            <MapPin size={14} />
            <span>Mission District, {featuredProperty.city}, {featuredProperty.state} {featuredProperty.zipCode}</span>
          </div>

          <p className="featured-description">
            High-activity market with {featuredProperty.participantCount.toLocaleString()} traders predicting the appraisal outcome.
            {featuredProperty.daysOnMarket < 7 && ' New listing with strong early volume.'}
          </p>

          <div className="featured-stats">
            <div className="featured-stat">
              <DollarSign size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Volume</span>
                <span className="stat-value">${(featuredProperty.volume / 1000).toFixed(0)}k</span>
              </div>
            </div>
            <div className="featured-stat">
              <Users size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Traders</span>
                <span className="stat-value">{featuredProperty.participantCount.toLocaleString()}</span>
              </div>
            </div>
            <div className="featured-stat">
              <Clock size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Ends in</span>
                <span className="stat-value">14 days</span>
              </div>
            </div>
          </div>
        </div>

        <div className="featured-cta">
          <div className="price-preview">
            <div className="price-row">
              <span className="price-label">List Price</span>
              <span className="price-value">
                ${featuredProperty.currentPrice.toLocaleString()}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Implied Fair Value</span>
              <span className={`price-value ${priceDelta >= 0 ? 'positive' : 'negative'}`}>
                ${featuredProperty.marketPrice.toLocaleString()}
                <span className="delta-badge">
                  {priceDelta >= 0 ? '+' : ''}{priceDeltaPercent}%
                </span>
              </span>
            </div>
          </div>
          <button className="btn-view-market">
            View Market
            <TrendingUp size={18} />
          </button>
        </div>
      </section>

      {/* Filters Bar */}
      <section className="filters-bar">
        <div className="filters-left">
          <div className="neighborhood-tabs">
            {NEIGHBORHOODS.map((hood) => (
              <button
                key={hood}
                className={`tab ${activeNeighborhood === hood ? 'active' : ''}`}
                onClick={() => setActiveNeighborhood(hood)}
              >
                {hood}
              </button>
            ))}
          </div>

          <div className="filter-divider" />

          <div className="filter-chips">
            <button 
              className={`filter-chip ${activeFilters.includes('under800') ? 'active' : ''}`}
              onClick={() => toggleFilter('under800')}
            >
              <Filter size={14} />
              Under $800k
            </button>
            <button 
              className={`filter-chip ${activeFilters.includes('over1m') ? 'active' : ''}`}
              onClick={() => toggleFilter('over1m')}
            >
              <Filter size={14} />
              Over $1M
            </button>
            <button 
              className={`filter-chip ${activeFilters.includes('high-volume') ? 'active' : ''}`}
              onClick={() => toggleFilter('high-volume')}
            >
              <TrendingUp size={14} />
              High Volume
            </button>
            {(activeFilters.length > 0 || activeNeighborhood !== 'All') && (
              <button className="filter-chip clear" onClick={clearFilters}>
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="filters-right">
          <div className="sort-dropdown">
            <span className="sort-label">Sort by</span>
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
                    onClick={() => {
                      setSortBy(option.value);
                      setShowSortDropdown(false);
                    }}
                  >
                    {option.label}
                    {sortBy === option.value && <span className="check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="results-count">
            {filteredProperties.length} markets
          </div>
        </div>
      </section>

      {/* Market Grid */}
      <section className="markets-grid">
        {filteredProperties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </section>

      {/* Empty State */}
      {filteredProperties.length === 0 && (
        <div className="empty-state">
          <Search size={48} className="empty-icon" />
          <h3>No markets found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>© 2024 FairValue. Predict real estate appraisal outcomes.</p>
      </footer>
    </div>
  );
};

export default HomePage;
