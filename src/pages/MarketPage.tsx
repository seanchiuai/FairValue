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
  ChevronRight
} from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import { mockProperties } from '../data/properties';
import './MarketPage.css';

interface Bet {
  id: string;
  direction: 'higher' | 'lower';
  amount: number;
  priceAtBet: number;
  timestamp: Date;
}

const INITIAL_PRICE = 850000;

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const property = mockProperties.find(p => p.id === propertyId) || mockProperties[0];
  
  const [marketData, setMarketData] = useState({
    fairValue: property.currentPrice,
    volume: property.volume,
    participantCount: property.participantCount,
    trendPrediction: property.marketPrice
  });
  
  const [betAmount, setBetAmount] = useState<string>('');
  const [bets, setBets] = useState<Bet[]>([]);

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
      title: 'Fair Value',
    });

    const trendSeries = chart.addLineSeries({
      color: '#4BA3FF',
      lineWidth: 2,
      lineStyle: 2,
      title: 'Trend Prediction',
    });

    chartRef.current = chart;
    fairValueSeriesRef.current = fairValueSeries;
    trendSeriesRef.current = trendSeries;

    const initialData: LineData[] = [];
    const trendData: LineData[] = [];
    const now = new Date();
    
    for (let i = 30; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      const timestamp = time.getTime() / 1000 as LineData['time'];
      
      const randomWalk = (Math.random() - 0.5) * 20000;
      const price = INITIAL_PRICE + randomWalk + (30 - i) * 500;
      
      initialData.push({ time: timestamp, value: price });
      trendData.push({ time: timestamp, value: price + 25000 + (Math.random() - 0.5) * 10000 });
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
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketData(prev => {
        const change = (Math.random() - 0.5) * 5000;
        const newFairValue = Math.max(700000, Math.min(1000000, prev.fairValue + change));
        
        if (fairValueSeriesRef.current && trendSeriesRef.current) {
          const now = new Date();
          const timestamp = now.getTime() / 1000 as LineData['time'];
          
          fairValueSeriesRef.current.update({
            time: timestamp,
            value: newFairValue,
          });
          
          trendSeriesRef.current.update({
            time: timestamp,
            value: newFairValue + 25000 + (Math.random() - 0.5) * 5000,
          });
        }
        
        return {
          ...prev,
          fairValue: newFairValue,
          volume: prev.volume + Math.floor(Math.random() * 5000),
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const placeBet = (direction: 'higher' | 'lower') => {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid bet amount');
      return;
    }

    const newBet: Bet = {
      id: Math.random().toString(36).substr(2, 9),
      direction,
      amount,
      priceAtBet: marketData.fairValue,
      timestamp: new Date(),
    };

    setBets(prev => [newBet, ...prev]);
    setBetAmount('');
    
    setMarketData(prev => ({
      ...prev,
      fairValue: direction === 'higher' 
        ? prev.fairValue + amount * 0.5 
        : prev.fairValue - amount * 0.5,
      volume: prev.volume + amount,
      participantCount: prev.participantCount + 1,
    }));
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
