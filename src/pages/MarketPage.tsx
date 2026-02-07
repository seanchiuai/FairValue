import React, { useState, useEffect, useRef } from 'react';
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
  Bot
} from 'lucide-react';
import { mockProperties } from '../data/properties';
import { initializeMarketGraph, storeLMSRState, searchMarketInsights } from '../services/cogneeService';
import { priceOver, buyWithBudget, executeBuy, calculateImpliedPrice } from '../lib/lmsr';
import { startBotEngine, BotTradeResult } from '../lib/botEngine';
import { useMarketChart } from '../hooks/useMarketChart';
import './MarketPage.css';

interface Bet {
  id: string;
  direction: 'higher' | 'lower';
  amount: number;
  priceAtBet: number;
  timestamp: Date;
}

interface LMSRState {
  qOver: number;
  qUnder: number;
  totalWagered: number;
  totalTrades: number;
}

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const property = mockProperties.find(p => p.id === propertyId) || mockProperties[0];
  const askingPrice = property.currentPrice;

  // LMSR State — start fresh
  const [lmsrState, setLmsrState] = useState<LMSRState>({
    qOver: 0,
    qUnder: 0,
    totalWagered: 0,
    totalTrades: 0
  });

  const [marketData, setMarketData] = useState({
    fairValue: askingPrice,
    volume: 0,
    participantCount: 0,
    trendPrediction: property.marketPrice
  });

  const [betAmount, setBetAmount] = useState<string>('');
  const [bets, setBets] = useState<Bet[]>([]);

  // Bot state
  const [botsEnabled, setBotsEnabled] = useState(false);
  const lmsrStateRef = useRef(lmsrState);
  useEffect(() => { lmsrStateRef.current = lmsrState; }, [lmsrState]);

  // AI Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showAISearch, setShowAISearch] = useState<boolean>(false);

  // Chart — shared dual-line hook
  const { addPoint } = useMarketChart({ containerRef: chartContainerRef, height: 300, tickIntervalMs: 2000 });

  // Push a chart point whenever LMSR state changes
  useEffect(() => {
    const prob = priceOver(lmsrState.qOver, lmsrState.qUnder);
    addPoint({ probOver: prob, fairValue: calculateImpliedPrice(prob, askingPrice) });
  }, [lmsrState.qOver, lmsrState.qUnder, askingPrice, addPoint]);

  // Initialize Cognee market graph on mount
  useEffect(() => {
    const initCognee = async () => {
      if (propertyId) {
        await initializeMarketGraph(propertyId, askingPrice);
        console.log('Cognee market graph initialized');
      }
    };
    initCognee();
  }, [propertyId, askingPrice]);

  // Bot engine
  useEffect(() => {
    if (!botsEnabled) return;
    return startBotEngine(
      () => ({ qOver: lmsrStateRef.current.qOver, qUnder: lmsrStateRef.current.qUnder }),
      (trade: BotTradeResult) => {
        setLmsrState({
          qOver: trade.newQOver,
          qUnder: trade.newQUnder,
          totalWagered: lmsrStateRef.current.totalWagered + trade.cost,
          totalTrades: lmsrStateRef.current.totalTrades + 1,
        });
        setMarketData(prev => ({
          ...prev,
          fairValue: calculateImpliedPrice(trade.newProbOver, askingPrice),
          volume: prev.volume + trade.cost,
          participantCount: prev.participantCount + 1,
        }));
      }
    );
  }, [botsEnabled, askingPrice]);

  const placeBet = (direction: 'higher' | 'lower') => {
    const wager = parseFloat(betAmount);
    if (!wager || wager <= 0) {
      alert('Please enter a valid bet amount');
      return;
    }

    const outcome: 'over' | 'under' = direction === 'higher' ? 'over' : 'under';
    const shares = buyWithBudget(outcome, wager, lmsrState.qOver, lmsrState.qUnder);
    const { cost, newQOver, newQUnder, newProbOver } = executeBuy(outcome, shares, lmsrState.qOver, lmsrState.qUnder);
    const newFairValue = calculateImpliedPrice(newProbOver, askingPrice);

    setLmsrState({
      qOver: newQOver,
      qUnder: newQUnder,
      totalWagered: lmsrState.totalWagered + cost,
      totalTrades: lmsrState.totalTrades + 1
    });

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
      volume: prev.volume + cost,
      participantCount: prev.participantCount + 1,
    }));

    // Store LMSR state in Cognee
    if (propertyId) {
      storeLMSRState(
        {
          qOver: newQOver,
          qUnder: newQUnder,
          totalWagered: lmsrState.totalWagered + cost,
          totalTrades: lmsrState.totalTrades + 1,
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
          shares: shares,
          actualCost: cost
        }
      ).then(() => {
        console.log('LMSR state stored in Cognee');
      }).catch((error) => {
        console.error('Failed to store LMSR state:', error);
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

  const getConfidence = () => {
    if (marketData.participantCount < 10) return { text: 'Low (Early Market)', color: 'var(--accent-danger)' };
    if (marketData.participantCount < 30) return { text: 'Medium', color: 'var(--accent-warning)' };
    return { text: 'High', color: 'var(--accent-success)' };
  };

  const confidence = getConfidence();
  const priceDelta = marketData.fairValue - property.currentPrice;
  const priceDeltaPercent = ((priceDelta / property.currentPrice) * 100).toFixed(1);

  // AI Search Handler
  const handleSearch = async () => {
    if (!searchQuery.trim() || !propertyId) return;

    setIsSearching(true);
    try {
      const results = await searchMarketInsights(searchQuery, propertyId, 'GRAPH_COMPLETION');
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults({ error: 'Search failed. Please try again.' });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="market-page">
      {/* Navigation */}
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
        {/* Property Header */}
        <div className="property-hero">
          <div className="property-tile-large">
            <Home size={40} strokeWidth={1.5} />
          </div>

          <div className="property-details">
            <div className="property-meta">
              <span className="neighborhood-badge">Mission District</span>
              <span className="days-badge">
                <Calendar size={12} />
                {property.daysOnMarket} days on market
              </span>
            </div>

            <h1 className="property-title">{property.address}</h1>
            <p className="property-location">{property.city}, {property.state} {property.zipCode}</p>

            <div className="property-specs-row">
              <div className="spec">
                <Bed size={16} />
                <span>{property.beds} beds</span>
              </div>
              <div className="spec">
                <Bath size={16} />
                <span>{property.baths} baths</span>
              </div>
              <div className="spec">
                <Maximize size={16} />
                <span>{property.sqft.toLocaleString()} sqft</span>
              </div>
            </div>
          </div>

          <div className="list-price-box">
            <span className="label">List Price</span>
            <span className="price">{formatCurrency(property.currentPrice)}</span>
          </div>
        </div>

        <div className="market-layout">
          {/* Left Column */}
          <div className="chart-column">
            <div className="chart-header">
              <h2>Price History</h2>
              <div className="legend" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="legend-item">
                  <span className="dot blue" />
                  <span>OVER probability</span>
                </div>
                <div className="legend-item">
                  <span className="dot green" />
                  <span>Fair value ($)</span>
                </div>
                <button
                  className={`bot-toggle ${botsEnabled ? 'active' : ''}`}
                  onClick={() => setBotsEnabled(!botsEnabled)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: botsEnabled ? 'var(--accent-primary)' : 'var(--bg-input)',
                    color: botsEnabled ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <Bot size={14} /> Bots {botsEnabled ? 'ON' : 'OFF'}
                </button>
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
                  {priceDelta >= 0 ? '+' : ''}{priceDeltaPercent}% vs list
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
