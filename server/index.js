require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const sql = require('./db');

const app = express();
app.use(express.json());

const server = http.createServer(app);

// ─── In-memory rooms (multiplayer state) ────────────────────────────
// Rooms are ephemeral — created for live sessions, not persisted.
// Trades within rooms DO get persisted to Neon.

const rooms = {};
const HOST_TOKEN_HEADER = 'x-fairvalue-host-token';

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
}

function generateHostToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// ─── LMSR Math ──────────────────────────────────────────────────────

function lmsrCost(qOver, qUnder, b) {
  return b * Math.log(Math.exp(qOver / b) + Math.exp(qUnder / b));
}

function lmsrPriceOver(qOver, qUnder, b) {
  const eo = Math.exp(qOver / b);
  const eu = Math.exp(qUnder / b);
  return eo / (eo + eu);
}

function lmsrBuy(market, outcome, shares, source) {
  const oldCost = lmsrCost(market.qOver, market.qUnder, market.b);
  if (outcome === 'over') {
    market.qOver += shares;
  } else {
    market.qUnder += shares;
  }
  const newCost = lmsrCost(market.qOver, market.qUnder, market.b);
  const cost = newCost - oldCost;
  const probOver = lmsrPriceOver(market.qOver, market.qUnder, market.b);
  market.totalTrades++;
  market.totalWagered += cost;

  return {
    outcome,
    wager: Math.round(cost * 100) / 100,
    payout: Math.round(shares * 100) / 100,
    profit_if_correct: Math.round((shares - cost) * 100) / 100,
    prob_over_after: Math.round(probOver * 10000) / 10000,
    prob_under_after: Math.round((1 - probOver) * 10000) / 10000,
    timestamp: Date.now() / 1000,
    source: source || 'manual',
  };
}

function lmsrBuyWithBudget(market, outcome, budget) {
  let lo = 0, hi = budget * 10;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const cost = outcome === 'over'
      ? lmsrCost(market.qOver + mid, market.qUnder, market.b) - lmsrCost(market.qOver, market.qUnder, market.b)
      : lmsrCost(market.qOver, market.qUnder + mid, market.b) - lmsrCost(market.qOver, market.qUnder, market.b);
    if (Math.abs(cost - budget) < 0.001) return mid;
    if (cost < budget) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function getMarketState(market) {
  const probOver = lmsrPriceOver(market.qOver, market.qUnder, market.b);
  return {
    prob_over: Math.round(probOver * 10000) / 10000,
    prob_under: Math.round((1 - probOver) * 10000) / 10000,
    q_over: Math.round(market.qOver * 100) / 100,
    q_under: Math.round(market.qUnder * 100) / 100,
    total_trades: market.totalTrades,
    total_wagered: Math.round(market.totalWagered * 100) / 100,
    avg_bet_size: market.totalTrades > 0 ? Math.round((market.totalWagered / market.totalTrades) * 100) / 100 : 0,
    b: market.b,
  };
}

// ─── Room helpers ───────────────────────────────────────────────────

async function createRoom(house, roomCode) {
  const code = roomCode || generateRoomCode();
  const room = {
    code,
    hostToken: generateHostToken(),
    house,
    market: { qOver: 0, qUnder: 0, b: 100, totalTrades: 0, totalWagered: 0 },
    players: {},
    connections: [],
    aiEnabled: false,
    aiInterval: null,
    settled: false,
    settlement: null,
    activity: [],
    marketId: null,
  };

  // Persist a new market row + market_state in Neon so trades are saved
  try {
    const propertyId = 'room-' + code;
    const [inserted] = await sql`
      INSERT INTO markets (address, asking_price, property_id, status)
      VALUES (${house.address || ''}, ${house.asking_price || 0}, ${propertyId}, 'open')
      RETURNING id
    `;
    room.marketId = inserted.id;

    await sql`
      INSERT INTO market_state (market_id, q_over, q_under, b, total_trades, total_wagered)
      VALUES (${room.marketId}, 0, 0, 100, 0, 0)
    `;
    console.log(`Room ${code}: created DB market ${room.marketId}`);
  } catch (e) {
    console.error(`Room ${code}: failed to create DB market:`, e.message);
  }

  rooms[code] = room;
  return room;
}

function broadcast(room, event) {
  const msg = JSON.stringify(event);
  room.connections = room.connections.filter(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      return true;
    }
    return false;
  });
}

function requireHostCapability(req, res, room) {
  const token = req.get(HOST_TOKEN_HEADER);
  if (!token || token !== room.hostToken) {
    res.status(403).json({ error: 'Host token required' });
    return false;
  }
  return true;
}

// ─── Persist trade to Neon ──────────────────────────────────────────

async function persistTrade(marketId, trade, shares) {
  if (!marketId) return;
  try {
    await sql`INSERT INTO trades (market_id, outcome, shares, wager, payout, prob_over_after, prob_under_after, source)
              VALUES (${marketId}, ${trade.outcome}, ${shares}, ${trade.wager}, ${trade.payout}, ${trade.prob_over_after}, ${trade.prob_under_after}, ${trade.source})`;
  } catch (e) {
    console.error('Failed to persist trade:', e.message);
  }
}

async function updateMarketState(marketId, market) {
  if (!marketId) return;
  try {
    await sql`UPDATE market_state SET q_over=${market.qOver}, q_under=${market.qUnder}, total_trades=${market.totalTrades}, total_wagered=${market.totalWagered}, updated_at=now() WHERE market_id=${marketId}`;
  } catch (e) {
    console.error('Failed to update market_state:', e.message);
  }
}

// ─── Server-side Cognee AI boundary ─────────────────────────────────

const COGNEE_BASE_URL = process.env.COGNEE_BASE_URL || 'https://api.cognee.ai';

function cogneeUnavailable(res) {
  return res.status(503).json({
    degraded: true,
    error: 'AI analyst unavailable',
    message: 'Set COGNEE_API_KEY on the server to enable Cognee analysis.',
  });
}

function safeDatasetSuffix(value) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return cleaned || 'unknown';
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function cogneeRequest(path, { method = 'GET', body } = {}) {
  const apiKey = process.env.COGNEE_API_KEY;
  if (!apiKey) {
    const err = new Error('COGNEE_API_KEY is not configured');
    err.degraded = true;
    err.status = 503;
    throw err;
  }

  const response = await fetch(`${COGNEE_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const err = new Error(`Cognee request failed with status ${response.status}`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function handleCogneeError(res, error) {
  if (error.degraded) return cogneeUnavailable(res);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
  return res.status(status).json({
    error: 'Cognee request failed',
    message: error.message || 'Unexpected Cognee integration failure',
  });
}

app.post('/api/ai/cognee/markets/:propertyId/initialize', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const askingPrice = numberOrZero(req.body.asking_price);
  const marketDescription = `
Property Market ${propertyId}: Real estate prediction market with asking price $${askingPrice}.
This market uses LMSR (Logarithmic Market Scoring Rule) algorithm for fair value pricing.
Bettors predict if the property will appraise OVER or UNDER the asking price.
The fair value is calculated as: asking_price + (prob_over - 0.5) * 2 * asking_price * 0.10
`;

  try {
    await cogneeRequest('/api/add', {
      method: 'POST',
      body: {
        data: marketDescription,
        dataset_name: `property_market_${propertyId}`,
      },
    });
    await cogneeRequest('/api/cognify', {
      method: 'POST',
      body: {
        datasets: [`property_market_${propertyId}`],
      },
    });
    res.json({ ok: true });
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.post('/api/ai/cognee/markets/:propertyId/state', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const { state, bet } = req.body;
  if (!state) return res.status(400).json({ error: 'State payload is required' });

  const qOver = numberOrZero(state.qOver);
  const qUnder = numberOrZero(state.qUnder);
  const totalWagered = numberOrZero(state.totalWagered);
  const totalTrades = numberOrZero(state.totalTrades);
  const fairValue = numberOrZero(state.fairValue);
  const askingPrice = numberOrZero(state.askingPrice);
  const timestamp = state.timestamp || new Date().toISOString();

  const stateDescription = `
LMSR Market State at ${timestamp}:
- Property ID: ${propertyId}
- Asking Price: $${askingPrice}
- Current Fair Value: $${fairValue.toFixed(2)}
- qOver (OVER shares outstanding): ${qOver.toFixed(2)}
- qUnder (UNDER shares outstanding): ${qUnder.toFixed(2)}
- Total Wagered: $${totalWagered.toFixed(2)}
- Total Trades: ${totalTrades}
- Probability OVER: ${(qOver / (qOver + qUnder || 1)).toFixed(4)}
`;

  try {
    await cogneeRequest('/api/add', {
      method: 'POST',
      body: {
        data: stateDescription,
        dataset_name: `lmsr_state_${propertyId}`,
      },
    });

    const datasets = [`lmsr_state_${propertyId}`];
    if (bet) {
      const amount = numberOrZero(bet.amount);
      const shares = numberOrZero(bet.shares);
      const actualCost = numberOrZero(bet.actualCost);
      const priceAtBet = numberOrZero(bet.priceAtBet);
      const betDescription = `
Trade Executed at ${bet.timestamp || new Date().toISOString()}:
- Property: ${propertyId}
- Direction: ${bet.direction === 'higher' ? 'OVER (higher)' : 'UNDER (lower)'}
- Wager Amount: $${amount.toFixed(2)}
- Shares Purchased: ${shares.toFixed(2)}
- Actual Cost: $${actualCost.toFixed(2)}
- Price at Bet: $${priceAtBet.toFixed(2)}
- Bet ID: ${bet.id || 'unknown'}
This trade updated the market state through LMSR cost function mechanics.
`;

      await cogneeRequest('/api/add', {
        method: 'POST',
        body: {
          data: betDescription,
          dataset_name: `bets_${propertyId}`,
        },
      });
      datasets.push(`bets_${propertyId}`);
    }

    await cogneeRequest('/api/cognify', {
      method: 'POST',
      body: { datasets },
    });
    res.json({ ok: true });
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.post('/api/ai/cognee/markets/:propertyId/search', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  const query = String(req.body.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const data = await cogneeRequest('/api/search', {
      method: 'POST',
      body: {
        query,
        search_type: req.body.search_type || 'GRAPH_COMPLETION',
        datasets: [`property_market_${propertyId}`, `lmsr_state_${propertyId}`, `bets_${propertyId}`],
      },
    });
    res.json(data);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.get('/api/ai/cognee/markets/:propertyId/graph', async (req, res) => {
  const propertyId = safeDatasetSuffix(req.params.propertyId);
  try {
    const data = await cogneeRequest(`/api/datasets/property_market_${propertyId}/graph`);
    res.json(data);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

app.get('/api/ai/cognee/visualize', async (req, res) => {
  const outputPath = req.query.output_path ? `?output_path=${encodeURIComponent(req.query.output_path)}` : '';
  try {
    const html = await cogneeRequest(`/api/visualize${outputPath}`);
    res.type('html').send(html);
  } catch (error) {
    handleCogneeError(res, error);
  }
});

// ─── Room API routes ────────────────────────────────────────────────

app.post('/api/rooms', async (req, res) => {
  const { address, asking_price } = req.body;
  const house = { address, asking_price };
  const room = await createRoom(house);
  res.json({ room_code: room.code, host_token: room.hostToken, house });
});

app.post('/api/rooms/:code/join', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { session_id, nickname } = req.body;
  let player = room.players[session_id];
  if (player) {
    player.nickname = nickname;
  } else {
    player = { session_id, nickname, balance: 1000, bets: [] };
    room.players[session_id] = player;
    room.activity.push({ type: 'join', nickname, timestamp: Date.now() / 1000 });
    broadcast(room, {
      type: 'join',
      nickname,
      player,
      player_count: Object.keys(room.players).length,
    });
  }

  res.json({
    player,
    market: getMarketState(room.market),
    players: Object.values(room.players),
    house: room.house,
    activity: room.activity.slice(-50),
    settled: room.settled,
    settlement: room.settlement,
  });
});

app.get('/api/rooms/:code/state', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  res.json({
    market: getMarketState(room.market),
    players: Object.values(room.players),
    house: room.house,
    history: [],
    activity: room.activity.slice(-50),
    ai_enabled: room.aiEnabled,
    settled: room.settled,
    settlement: room.settlement,
  });
});

app.post('/api/rooms/:code/bet', async (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.settled) return res.status(400).json({ error: 'Market is settled' });

  const { session_id, outcome, wager } = req.body;
  if (!['over', 'under'].includes(outcome)) return res.status(400).json({ error: "Outcome must be 'over' or 'under'" });
  if (wager <= 0) return res.status(400).json({ error: 'Wager must be positive' });

  const player = room.players[session_id];
  if (!player) return res.status(404).json({ error: 'Player not found in room' });
  if (wager > player.balance) return res.status(400).json({ error: 'Insufficient balance' });

  const shares = lmsrBuyWithBudget(room.market, outcome, wager);
  const trade = lmsrBuy(room.market, outcome, shares, player.nickname);

  player.balance -= trade.wager;
  player.bets.push({
    outcome,
    wager: trade.wager,
    shares: Math.round(shares * 100) / 100,
    prob_at_entry: outcome === 'over' ? trade.prob_over_after : trade.prob_under_after,
    timestamp: trade.timestamp,
  });

  const activityEntry = { type: 'bet', nickname: player.nickname, outcome, wager: trade.wager, timestamp: trade.timestamp };
  room.activity.push(activityEntry);

  broadcast(room, {
    type: 'bet',
    nickname: player.nickname,
    outcome,
    wager: trade.wager,
    trade,
    market: getMarketState(room.market),
    player,
    activity: activityEntry,
  });

  // Persist to DB in background (don't block response)
  persistTrade(room.marketId, trade, shares);
  updateMarketState(room.marketId, room.market);

  res.json({ trade, market: getMarketState(room.market), player });
});

app.post('/api/rooms/:code/settle', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!requireHostCapability(req, res, room)) return;

  if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  room.aiEnabled = false;
  room.settled = true;

  const { actual_price } = req.body;
  const winningOutcome = actual_price >= room.house.asking_price ? 'over' : 'under';

  const results = Object.values(room.players).map(player => {
    let payout = 0;
    for (const bet of player.bets) {
      if (bet.outcome === winningOutcome) payout += bet.shares;
    }
    player.balance += payout;
    return { nickname: player.nickname, payout: Math.round(payout * 100) / 100, final_balance: Math.round(player.balance * 100) / 100 };
  });

  const activityEntry = { type: 'settle', actual_price, winning_outcome: winningOutcome, timestamp: Date.now() / 1000 };
  room.activity.push(activityEntry);

  room.settlement = { winning_outcome: winningOutcome, actual_price, results };

  broadcast(room, { type: 'settle', ...room.settlement, activity: activityEntry });

  res.json(room.settlement);
});

app.post('/api/rooms/:code/toggle-ai', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!requireHostCapability(req, res, room)) return;
  if (room.settled) return res.status(400).json({ error: 'Market is settled' });

  room.aiEnabled = !room.aiEnabled;

  if (room.aiEnabled) {
    room.aiInterval = setInterval(() => {
      if (!room.aiEnabled || room.settled) { clearInterval(room.aiInterval); room.aiInterval = null; return; }

      const probOver = lmsrPriceOver(room.market.qOver, room.market.qUnder, room.market.b);
      const contrarianStrength = 0.6;
      const noise = gaussianRandom() * 0.15;
      let pBetOver = (1 - probOver) * contrarianStrength + 0.5 * (1 - contrarianStrength) + noise;
      pBetOver = Math.max(0.05, Math.min(0.95, pBetOver));

      const outcome = Math.random() < pBetOver ? 'over' : 'under';
      const shareOptions = [1, 2, 3, 5, 8, 10, 15, 20];
      const weights = [25, 20, 15, 12, 8, 8, 7, 5];
      const shares = weightedRandom(shareOptions, weights);

      const trade = lmsrBuy(room.market, outcome, shares, 'AI');

      const activityEntry = { type: 'ai_trade', outcome, wager: trade.wager, timestamp: trade.timestamp };
      room.activity.push(activityEntry);

      broadcast(room, {
        type: 'ai_trade',
        outcome,
        wager: trade.wager,
        trade,
        market: getMarketState(room.market),
        activity: activityEntry,
      });

      persistTrade(room.marketId, trade, shares);
      updateMarketState(room.marketId, room.market);
    }, 5000);
  } else {
    if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  }

  res.json({ ai_enabled: room.aiEnabled });
});

app.get('/api/rooms/:code/leaderboard', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const sorted = Object.values(room.players).sort((a, b) => b.balance - a.balance);
  res.json({ leaderboard: sorted.map(p => ({ nickname: p.nickname, balance: Math.round(p.balance * 100) / 100 })) });
});

// ─── Solo market endpoints (read from Neon) ─────────────────────────

app.get('/api/markets', async (req, res) => {
  try {
    const rows = await sql`SELECT m.*, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
                           FROM markets m JOIN market_state ms ON m.id = ms.market_id
                           WHERE m.status = 'open' ORDER BY m.created_at`;
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// Chart endpoints — must be before /api/markets/:id to avoid "charts" matching as :id
app.get('/api/markets/charts', async (req, res) => {
  if (sql.isConfigured === false) return res.json({});

  try {
    const rows = await sql`
      SELECT m.property_id, t.prob_over_after, t.created_at
      FROM trades t JOIN markets m ON t.market_id = m.id
      WHERE t.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY m.property_id, t.created_at
    `;
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.property_id]) grouped[row.property_id] = [];
      grouped[row.property_id].push({
        prob: Number(row.prob_over_after),
        time: row.created_at,
      });
    }
    res.json(grouped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/by-property/:propertyId/chart', async (req, res) => {
  if (sql.isConfigured === false) return res.json([]);

  try {
    const rows = await sql`
      SELECT t.prob_over_after, t.created_at
      FROM trades t
      WHERE t.market_id = (SELECT id FROM markets WHERE property_id = ${req.params.propertyId} LIMIT 1)
      ORDER BY t.created_at DESC
      LIMIT 50
    `;
    const data = rows.reverse().map(r => ({
      prob: Number(r.prob_over_after),
      time: r.created_at,
    }));
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/:id', async (req, res) => {
  try {
    const rows = await sql`SELECT m.*, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
                           FROM markets m JOIN market_state ms ON m.id = ms.market_id
                           WHERE m.id = ${req.params.id}`;
    if (!rows.length) return res.status(404).json({ error: 'Market not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/markets/:id/history', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM trades WHERE market_id = ${req.params.id} ORDER BY created_at`;
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ─── 24/7 Market Simulation Engine ──────────────────────────────────

const simulations = new Map(); // marketId -> { interval, market }

async function startSimulations() {
  try {
    const rows = await sql`
      SELECT m.id, m.property_id, ms.q_over, ms.q_under, ms.b, ms.total_trades, ms.total_wagered
      FROM markets m JOIN market_state ms ON m.id = ms.market_id
      WHERE m.status = 'open'
    `;

    let index = 0;
    for (const row of rows) {
      const marketId = row.id;
      const market = {
        qOver: Number(row.q_over),
        qUnder: Number(row.q_under),
        b: Number(row.b),
        totalTrades: Number(row.total_trades),
        totalWagered: Number(row.total_wagered),
      };

      // Stagger start by ~2.5s per market
      const delay = index * 2500;
      setTimeout(() => {
        const interval = setInterval(() => {
          runSimTrade(marketId, market);
        }, 15000);
        simulations.set(marketId, { interval, market });
      }, delay);

      // Store the market object immediately for reference
      simulations.set(marketId, { interval: null, market });
      index++;
    }

    console.log(`Simulation started for ${rows.length} markets`);
  } catch (e) {
    console.error('Failed to start simulations:', e.message);
  }
}

function runSimTrade(marketId, market) {
  const probOver = lmsrPriceOver(market.qOver, market.qUnder, market.b);
  const contrarianStrength = 0.6;
  const noise = gaussianRandom() * 0.15;
  let pBetOver = (1 - probOver) * contrarianStrength + 0.5 * (1 - contrarianStrength) + noise;
  pBetOver = Math.max(0.05, Math.min(0.95, pBetOver));

  const outcome = Math.random() < pBetOver ? 'over' : 'under';
  const shareOptions = [1, 2, 3, 5, 8, 10, 15, 20];
  const weights = [25, 20, 15, 12, 8, 8, 7, 5];
  const shares = weightedRandom(shareOptions, weights);

  const trade = lmsrBuy(market, outcome, shares, 'auto');

  // Persist in background
  persistTrade(marketId, trade, shares);
  updateMarketState(marketId, market);
}

// ─── Helpers ────────────────────────────────────────────────────────

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── WebSocket ──────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/ws/')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const roomCode = req.url.replace('/ws/', '').toUpperCase();
  const room = rooms[roomCode];
  if (!room) { ws.close(4004); return; }

  room.connections.push(ws);
  ws.on('close', () => {
    room.connections = room.connections.filter(c => c !== ws);
  });
});

// ─── Start ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`FairValue server running on http://localhost:${PORT}`);
    startSimulations();
  });
}

module.exports = {
  app,
  server,
  rooms,
  createRoom,
  generateRoomCode,
  generateHostToken,
  requireHostCapability,
  startSimulations,
};
