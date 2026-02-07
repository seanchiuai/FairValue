import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Home, 
  Bed, 
  Bath, 
  Maximize, 
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  Info,
  ChevronRight,
  Search,
  Brain,
  Loader2,
  MapPin,
  Building2
} from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import { properties, Property } from '../data/properties';
import { initializeMarketGraph, storeLMSRState, searchMarketInsights } from '../services/cogneeService';
import './MarketPage.css';

interface Bet {
  id: string;
  direction: 'higher' | 'lower';
  amount: number;
  priceAtBet: number;
  timestamp: Date;
}

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const property: Property = properties.find(p => p.id === propertyId) || properties[0];
  
  // Store original sold price for reference - this never changes
  const originalPriceRef = useRef<number>(property.price);
  const originalPrice = originalPriceRef.current;
  
  // Use fair value as the current market price for betting
  const askingPrice = originalPrice;
  
  // Simple weighted bet tracking
  const [totalHigher, setTotalHigher] = useState<number>(0);
  const [totalLower, setTotalLower] = useState<number>(0);
  
  const [marketData, setMarketData] = useState({
    fairValue: askingPrice,
    volume: 0,
    participantCount: 0,
    trendPrediction: askingPrice
  });
  
  const [betAmount, setBetAmount] = useState<string>('');
  const [bets, setBets] = useState<Bet[]>([]);

  // AI Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showAISearch, setShowAISearch] = useState<boolean>(false);
  
  // Loading state for Cognee data
  const [, setIsLoading] = useState<boolean>(true);

  // Calculate fair value based on net difference between higher and lower bets
  const calculateFairValue = useCallback((higherAmount: number, lowerAmount: number): number => {
    // Base liquidity prevents extreme swings when market is new
    const BASE_LIQUIDITY = askingPrice * 0.3; // 30% buffer
    
    const netDifference = higherAmount - lowerAmount; // Positive = more higher bets
    const totalVolume = higherAmount + lowerAmount + BASE_LIQUIDITY;
    
    // Max price movement: +/- 15% of asking price
    const maxMovement = askingPrice * 0.15;
    
    // Calculate fair value: asking + (netDifference / totalVolume) * maxMovement
    const fairValue = askingPrice + (netDifference / totalVolume) * maxMovement;
    
    return fairValue;
  }, [askingPrice]);

  // Load market state from Cognee cloud storage
  useEffect(() => {
    const loadMarketState = async () => {
      if (!propertyId) return;
      
      setIsLoading(true);
      try {
        // Initialize market graph
        await initializeMarketGraph(propertyId, askingPrice);
        
        // Search for latest market state in Cognee
        const searchResults = await searchMarketInsights(
          `latest market state for property ${propertyId} totalHigher totalLower`,
          propertyId,
          'INSIGHTS'
        );
        
        if (searchResults && searchResults.results && searchResults.results.length > 0) {
          // Parse the latest state from Cognee
          const latestState = searchResults.results[0];
          
          // Extract values from Cognee response
          const savedTotalHigher = latestState.totalHigher || latestState.qOver || 0;
          const savedTotalLower = latestState.totalLower || latestState.qUnder || 0;
          const savedTrades = latestState.totalTrades || 0;
          
          if (savedTotalHigher > 0 || savedTotalLower > 0) {
            setTotalHigher(savedTotalHigher);
            setTotalLower(savedTotalLower);
            
            // Calculate fair value from saved state
            const savedFairValue = calculateFairValue(savedTotalHigher, savedTotalLower);
            
            setMarketData(prev => ({
              ...prev,
              fairValue: savedFairValue,
              volume: savedTotalHigher + savedTotalLower,
              participantCount: savedTrades
            }));
            
            console.log('Loaded shared market state from Cognee:', { 
              savedTotalHigher, 
              savedTotalLower, 
              savedFairValue,
              trades: savedTrades 
            });
          }
        }
      } catch (error) {
        console.error('Failed to load market state from Cognee:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadMarketState();
    
    // Poll for updates every 5 seconds to keep data in sync across users
    const interval = setInterval(loadMarketState, 5000);
    return () => clearInterval(interval);
  }, [propertyId, askingPrice, calculateFairValue]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#2C3A4A' },
        textColor: '#7F93A8',
      },
      grid: {
        vertLines: { color: '#3A4A5D' },
        horzLines: { color: '#3A4A5D' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
    });

    const fairValueSeries = chart.addLineSeries({
      color: '#3BA776',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const trendSeries = chart.addLineSeries({
      color: '#4BA3FF',
      lineWidth: 2,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    fairValueSeriesRef.current = fairValueSeries;
    trendSeriesRef.current = trendSeries;

    // Start with flat line at asking price
    const initialData: LineData[] = [];
    const trendData: LineData[] = [];
    const now = new Date();
    
    // Create 30 data points all at asking price (flat line)
    for (let i = 30; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      const timestamp = time.getTime() / 1000 as LineData['time'];
      
      initialData.push({ time: timestamp, value: askingPrice });
      trendData.push({ time: timestamp, value: askingPrice });
    }

    fairValueSeries.setData(initialData);
    trendSeries.setData(trendData);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [askingPrice]);

  const placeBet = (direction: 'higher' | 'lower') => {
    const wager = parseFloat(betAmount);
    if (!wager || wager <= 0) {
      alert('Please enter a valid bet amount');
      return;
    }

    // Update totals
    const newTotalHigher = direction === 'higher' ? totalHigher + wager : totalHigher;
    const newTotalLower = direction === 'lower' ? totalLower + wager : totalLower;
    
    setTotalHigher(newTotalHigher);
    setTotalLower(newTotalLower);

    // Calculate new fair value
    const newFairValue = calculateFairValue(newTotalHigher, newTotalLower);

    const newBet: Bet = {
      id: Math.random().toString(36).substr(2, 9),
      direction,
      amount: wager,
      priceAtBet: marketData.fairValue,
      timestamp: new Date(),
    };

    setBets(prev => [newBet, ...prev]);
    setBetAmount('');
    
    setMarketData(prev => ({
      ...prev,
      fairValue: newFairValue,
      volume: prev.volume + wager,
      participantCount: prev.participantCount + 1,
    }));
    
    // Update chart immediately
    if (fairValueSeriesRef.current) {
      const now = new Date();
      const timestamp = now.getTime() / 1000 as LineData['time'];
      fairValueSeriesRef.current.update({
        time: timestamp,
        value: newFairValue,
      });
    }
    
    // Save market state to Cognee for persistence
    if (propertyId) {
      storeLMSRState(
        {
          qOver: newTotalHigher,
          qUnder: newTotalLower,
          totalWagered: newTotalHigher + newTotalLower,
          totalTrades: marketData.participantCount + 1,
          fairValue: newFairValue,
          askingPrice: askingPrice,
          timestamp: new Date().toISOString(),
          propertyId: propertyId
        },
        {
          id: newBet.id,
          direction: newBet.direction,
          amount: wager,
          priceAtBet: newBet.priceAtBet,
          timestamp: newBet.timestamp,
          propertyId: propertyId,
          shares: wager,
          actualCost: wager
        }
      ).then(() => {
        console.log('Market state saved to Cognee');
      }).catch((error) => {
        console.error('Failed to save market state:', error);
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPrice = (n: number) => n ? `$${n.toLocaleString()}` : '—';
  const typeLabel = (t: string) => {
    const map: Record<string, string> = { SINGLE_FAMILY: 'Single Family', CONDO: 'Condo', MULTI_FAMILY: 'Multi-Family', APARTMENT: 'Apartment', LOT: 'Lot' };
    return map[t] || t;
  };

  const getConfidence = () => {
    if (marketData.participantCount < 10) return { text: 'Low (Early Market)', color: 'var(--accent-danger)' };
    if (marketData.participantCount < 30) return { text: 'Medium', color: 'var(--accent-warning)' };
    return { text: 'High', color: 'var(--accent-success)' };
  };

  const confidence = getConfidence();
  const priceDelta = marketData.fairValue - askingPrice;
  const priceDeltaPercent = ((priceDelta / askingPrice) * 100).toFixed(1);

  const heroImg = property.photos?.find(p => p.width === 1536)?.url
    || property.photos?.find(p => p.width === 960)?.url
    || property.imgSrc;

  const priceDiff = property.zestimate && property.price
    ? property.zestimate - property.price : null;
  const priceDiffPct = priceDiff !== null && property.price
    ? ((priceDiff / property.price) * 100).toFixed(1) : null;

  // AI Search Handler
  const handleSearch = async () => {
    if (!searchQuery.trim() || !propertyId) return;
    
    setIsSearching(true);
    // Simulate AI response
    setTimeout(() => {
      setSearchResults({
        answer: `Based on current market activity: ${totalHigher > totalLower ? 'More traders are betting HIGHER, suggesting bullish sentiment.' : totalLower > totalHigher ? 'More traders are betting LOWER, suggesting bearish sentiment.' : 'Market is balanced between HIGHER and LOWER bets.'} Current fair value is ${formatCurrency(marketData.fairValue)}.`,
      });
      setIsSearching(false);
    }, 1000);
  };

  return (
    <div className="market-page">
      <nav className="market-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          <span>Back to Markets</span>
        </Link>
        <div className="nav-title">
          <span>Prediction Market</span>
        </div>
        <div className="nav-spacer" />
      </nav>

      <div className="market-content">
        {/* Hero */}
        <div className="detail-hero">
          <img src={heroImg} alt={property.address} className="detail-hero-img" />
          <div className="detail-hero-badges">
            <span className="badge-type">{typeLabel(property.homeType)}</span>
          </div>
        </div>

        {/* Price + Specs Header */}
        <div className="detail-header-card">
          <div className="detail-price-row">
            <div className="detail-price-section">
              <div className="detail-price-label">Fair Value</div>
              <div className="detail-price">{formatCurrency(marketData.fairValue)}</div>
              <div className="original-price-ref">
                Original Sale: {formatPrice(originalPrice)}
              </div>
            </div>
            {property.zestimate && priceDiff !== null && (
              <div className={`detail-zestimate ${priceDiff >= 0 ? 'up' : 'down'}`}>
                <span className="zest-label">Zestimate</span>
                <span className="zest-value">{formatPrice(property.zestimate)}</span>
                <span className="zest-diff">
                  {priceDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {priceDiff >= 0 ? '+' : ''}{priceDiffPct}%
                </span>
              </div>
            )}
          </div>

          <div className="detail-specs">
            {property.bedrooms != null && (
              <div className="spec"><Bed size={16} /><span><strong>{property.bedrooms}</strong> Beds</span></div>
            )}
            {property.bathrooms != null && (
              <div className="spec"><Bath size={16} /><span><strong>{property.bathrooms}</strong> Baths</span></div>
            )}
            {property.livingArea != null && (
              <div className="spec"><Maximize size={16} /><span><strong>{property.livingArea.toLocaleString()}</strong> sqft</span></div>
            )}
            {property.yearBuilt && (
              <div className="spec"><Calendar size={16} /><span>Built <strong>{property.yearBuilt}</strong></span></div>
            )}
            <div className="spec"><Home size={16} /><span>{typeLabel(property.homeType)}</span></div>
          </div>

          <div className="detail-address-line">
            <MapPin size={14} />
            <span>{property.address}, {property.city}, {property.state} {property.zipCode}</span>
          </div>

          {property.brokerageName && (
            <div className="detail-broker">
              <Building2 size={13} />
              <span>Listed by {property.brokerageName}</span>
            </div>
          )}
        </div>

        <div className="market-layout">
          {/* Left Column */}
          <div className="chart-column">
            <div className="chart-header">
              <h2>Price History & Fair Value</h2>
              <div className="legend">
                <div className="legend-item">
                  <span className="dot green" />
                  <span>Fair Value (AMM)</span>
                </div>
                <div className="legend-item">
                  <span className="dot blue" />
                  <span>Trend Prediction</span>
                </div>
              </div>
            </div>
            
            <div ref={chartContainerRef} className="chart-container" />

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">Fair Value</span>
                  {priceDelta >= 0 ? <TrendingUp size={16} className="trend-icon up" /> : <TrendingDown size={16} className="trend-icon down" />}
                </div>
                <span className="stat-value">{formatCurrency(marketData.fairValue)}</span>
                <span className={`stat-delta ${priceDelta >= 0 ? 'positive' : 'negative'}`}>
                  {priceDelta >= 0 ? '+' : ''}{priceDeltaPercent}% vs original
                </span>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">Implied Fair Value</span>
                </div>
                <span className="stat-value blue">{formatCurrency(marketData.trendPrediction)}</span>
                <span className="stat-desc">Based on comparable sales</span>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">Market Confidence</span>
                  <Info size={14} className="info-icon" />
                </div>
                <span className="stat-value" style={{ color: confidence.color }}>{confidence.text}</span>
                <span className="stat-desc">{marketData.participantCount} traders</span>
              </div>
            </div>

            {/* AI Search Section */}
            <div className="ai-search-section">
              <div className="ai-search-header" onClick={() => setShowAISearch(!showAISearch)}>
                <div className="ai-search-title">
                  <Brain size={20} />
                  <h3>AI Market Insights</h3>
                </div>
                <span className="ai-search-toggle">{showAISearch ? '−' : '+'}</span>
              </div>
              
              {showAISearch && (
                <div className="ai-search-content">
                  <div className="ai-search-input-group">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Ask about market trends, betting patterns, or price predictions..."
                      className="ai-search-input"
                    />
                    <button 
                      className="ai-search-btn" 
                      onClick={handleSearch}
                      disabled={isSearching}
                    >
                      {isSearching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                      {isSearching ? 'Analyzing...' : 'Search'}
                    </button>
                  </div>
                  
                  {searchResults && (
                    <div className="ai-search-results">
                      {searchResults.error ? (
                        <p className="ai-search-error">{searchResults.error}</p>
                      ) : (
                        <div className="ai-search-response">
                          {searchResults.results && searchResults.results.map((result: any, idx: number) => (
                            <div key={idx} className="ai-result-item">
                              <p>{result.text || JSON.stringify(result)}</p>
                            </div>
                          ))}
                          {searchResults.answer && (
                            <div className="ai-answer">
                              <strong>Answer:</strong>
                              <p>{searchResults.answer}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="trading-column">
            <div className="trading-panel">
              <h2>Place Your Trade</h2>
              
              <div className="input-group">
                <label>Trade Size ($)</label>
                <div className="input-wrapper">
                  <DollarSign size={16} className="input-icon" />
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="Enter amount..."
                  />
                </div>
              </div>

              <div className="trade-buttons">
                <button className="trade-btn higher" onClick={() => placeBet('higher')}>
                  <div className="btn-content">
                    <TrendingUp size={20} />
                    <div className="btn-labels">
                      <span className="btn-title">HIGHER</span>
                      <span className="btn-desc">Appraisal will be above fair value</span>
                    </div>
                  </div>
                </button>
                
                <button className="trade-btn lower" onClick={() => placeBet('lower')}>
                  <div className="btn-content">
                    <TrendingDown size={20} />
                    <div className="btn-labels">
                      <span className="btn-title">LOWER</span>
                      <span className="btn-desc">Appraisal will be below fair value</span>
                    </div>
                  </div>
                </button>
              </div>

              <p className="trade-hint">
                <Info size={14} />
                Your trade moves the market price. Larger positions = bigger impact.
              </p>
            </div>

            {bets.length > 0 && (
              <div className="positions-panel">
                <h3>Your Positions</h3>
                <div className="positions-list">
                  {bets.map((bet) => (
                    <div key={bet.id} className="position-item">
                      <div className="position-main">
                        <div className={`position-direction ${bet.direction}`}>
                          {bet.direction === 'higher' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          <span>{bet.direction === 'higher' ? 'LONG' : 'SHORT'}</span>
                        </div>
                        <span className="position-size">{formatCurrency(bet.amount)}</span>
                      </div>
                      <div className="position-meta">
                        <span>Entry: {formatCurrency(bet.priceAtBet)}</span>
                        <span>{bet.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="info-panel">
              <h4>How It Works</h4>
              <ul>
                <li>
                  <ChevronRight size={14} />
                  Predict if the home will appraise higher or lower than the current fair value
                </li>
                <li>
                  <ChevronRight size={14} />
                  Your trade influences the market price in real-time via AMM mechanics
                </li>
                <li>
                  <ChevronRight size={14} />
                  When the official appraisal is reported, positions settle automatically
                </li>
                <li>
                  <ChevronRight size={14} />
                  Trade anytime before the settlement deadline
                </li>
              </ul>
            </div>

            <div className="market-meta">
              <div className="meta-row">
                <span className="meta-label">
                  <DollarSign size={14} />
                  Volume
                </span>
                <span className="meta-value">{formatCurrency(marketData.volume)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">
                  <Users size={14} />
                  Traders
                </span>
                <span className="meta-value">{marketData.participantCount.toLocaleString()}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">
                  <Clock size={14} />
                  Ends in
                </span>
                <span className="meta-value">14 days</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketPage;
