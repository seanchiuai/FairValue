import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  Users, 
  Clock, 
  DollarSign,
  ChevronDown,
  X,
  Wallet,
  User,
  Home
} from 'lucide-react';
import { useMarketImages } from '../hooks/useMarketImages';
import MarketCard from '../components/MarketCard';
import FeaturedMarket from '../components/FeaturedMarket';
import { mockProperties } from '../data/properties';

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending' },
  { value: 'volume', label: 'Highest Volume' },
  { value: 'ending', label: 'Ending Soon' },
  { value: 'newest', label: 'Newest' },
  { value: 'mispricing', label: 'Biggest Mispricing' },
];

const NEIGHBORHOODS = ['All', 'Mission District', 'SoMa', 'Castro', 'Noe Valley'];

function Markets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNeighborhood, setActiveNeighborhood] = useState('All');
  const [activeFilters, setActiveFilters] = useState([]);
  const [sortBy, setSortBy] = useState('trending');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Get all market IDs for the hook
  const marketIds = mockProperties.map(p => p.id);
  
  // Use the market images hook
  const { 
    ready, 
    getImageUrl, 
    setImageFile, 
    removeImage 
  } = useMarketImages(marketIds);

  const toggleFilter = (filter) => {
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

  const filteredProperties = mockProperties.filter((property) => {
    const matchesSearch = 
      property.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.zipCode.includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeNeighborhood !== 'All') {
      if (activeNeighborhood === 'Mission District' && property.zipCode !== '94103' && property.zipCode !== '94110') {
        return false;
      }
    }

    return true;
  });

  const featuredProperty = mockProperties[2];

  // Handle image upload
  const handleImageUpload = async (marketId, file) => {
    try {
      await setImageFile(marketId, file);
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // Handle image remove
  const handleImageRemove = async (marketId) => {
    try {
      await removeImage(marketId);
    } catch (error) {
      console.error('Remove failed:', error);
      throw error;
    }
  };

  return (
    <div className="markets-page">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <Home className="logo-icon" size={24} strokeWidth={1.5} />
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

      {/* Featured Market */}
      <FeaturedMarket
        property={featuredProperty}
        imageUrl={ready ? getImageUrl(featuredProperty.id) : null}
        onImageUpload={handleImageUpload}
        onImageRemove={handleImageRemove}
      />

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
          <MarketCard 
            key={property.id} 
            property={property}
            imageUrl={ready ? getImageUrl(property.id) : null}
            onImageUpload={handleImageUpload}
            onImageRemove={handleImageRemove}
          />
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

      <style>{`
        .markets-page {
          min-height: 100vh;
          background: #1F2A36;
          color: #EAF0F7;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto', sans-serif;
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          height: 60px;
          background: #243140;
          border-bottom: 1px solid #3A4A5D;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #EAF0F7;
        }

        .logo-icon {
          color: #4BA3FF;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .nav {
          display: flex;
          gap: 2px;
        }

        .nav-link {
          padding: 6px 12px;
          color: #A9B7C8;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          border-radius: 6px;
          transition: all 0.15s ease;
        }

        .nav-link:hover {
          color: #EAF0F7;
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-link.active {
          color: #EAF0F7;
          background: rgba(255, 255, 255, 0.08);
        }

        .header-center {
          flex: 1;
          max-width: 420px;
          margin: 0 24px;
        }

        .search-container {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: #7F93A8;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px 8px 36px;
          background: #273445;
          border: 1px solid transparent;
          border-radius: 6px;
          color: #EAF0F7;
          font-size: 14px;
          outline: none;
          transition: all 0.15s ease;
        }

        .search-input::placeholder {
          color: #7F93A8;
        }

        .search-input:focus {
          border-color: #455670;
          background: #2C3A4A;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .balance {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #A9B7C8;
        }

        .btn-connect {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #4BA3FF;
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-connect:hover {
          background: #2F8EFF;
        }

        /* Filters Bar */
        .filters-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px;
          border-bottom: 1px solid #3A4A5D;
          gap: 16px;
        }

        .filters-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .filters-left::-webkit-scrollbar {
          display: none;
        }

        .neighborhood-tabs {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
        }

        .tab {
          padding: 6px 14px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: #A9B7C8;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .tab:hover {
          color: #EAF0F7;
          background: rgba(255, 255, 255, 0.05);
        }

        .tab.active {
          color: #EAF0F7;
          background: rgba(255, 255, 255, 0.1);
          border-color: #3A4A5D;
        }

        .filter-divider {
          width: 1px;
          height: 20px;
          background: #3A4A5D;
          flex-shrink: 0;
        }

        .filter-chips {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .filter-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 6px;
          color: #A9B7C8;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .filter-chip:hover {
          border-color: #455670;
          color: #EAF0F7;
        }

        .filter-chip.active {
          background: rgba(75, 163, 255, 0.12);
          border-color: #4BA3FF;
          color: #4BA3FF;
        }

        .filter-chip.clear {
          background: transparent;
          border-color: #3A4A5D;
        }

        .filter-chip.clear:hover {
          background: rgba(192, 86, 86, 0.1);
          border-color: #C05656;
          color: #C05656;
        }

        .filters-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .sort-dropdown {
          position: relative;
        }

        .sort-label {
          color: #7F93A8;
          font-size: 12px;
          margin-right: 6px;
        }

        .sort-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 6px;
          color: #EAF0F7;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .sort-trigger:hover {
          border-color: #455670;
        }

        .sort-trigger svg {
          transition: transform 0.2s ease;
          color: #7F93A8;
        }

        .sort-trigger svg.open {
          transform: rotate(180deg);
        }

        .sort-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 6px;
          min-width: 160px;
          background: #2C3A4A;
          border: 1px solid #455670;
          border-radius: 8px;
          padding: 4px;
          z-index: 50;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .sort-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 10px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #A9B7C8;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .sort-option:hover {
          background: #273445;
          color: #EAF0F7;
        }

        .sort-option.active {
          color: #4BA3FF;
        }

        .sort-option .check {
          color: #4BA3FF;
          font-weight: 600;
        }

        .results-count {
          color: #7F93A8;
          font-size: 12px;
          font-weight: 500;
        }

        /* Markets Grid */
        .markets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px;
          padding: 20px 24px;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          color: #7F93A8;
          text-align: center;
        }

        .empty-icon {
          color: #455670;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 16px;
          color: #EAF0F7;
          margin-bottom: 6px;
          font-weight: 600;
        }

        .empty-state p {
          font-size: 14px;
        }

        /* Footer */
        .footer {
          padding: 24px;
          text-align: center;
          color: #7F93A8;
          font-size: 12px;
          border-top: 1px solid #3A4A5D;
        }

        @media (max-width: 768px) {
          .header {
            padding: 0 16px;
            height: 56px;
          }

          .header-center {
            display: none;
          }

          .nav {
            display: none;
          }

          .filters-bar {
            padding: 12px 16px;
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }

          .filters-right {
            width: 100%;
            justify-content: space-between;
          }

          .markets-grid {
            grid-template-columns: 1fr;
            padding: 16px;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default Markets;
