# FairValue Algorithm Guide

How the LMSR market maker works, how bot agents generate trades, and how dollar wagers convert to shares under the hood.

---

## Core Concept

This is a **binary prediction market**: will the house sell OVER or UNDER the asking price? The market price (probability) moves as bets come in. When OVER and UNDER reach 50/50, that equilibrium point represents **fair value consensus**.

The probability gets converted to an implied price:

```
implied_price = asking_price + (prob_over - 0.5) * 2 * asking_price * 0.10
```

- `prob_over = 0.50` -> implied price = asking price (fair value)
- `prob_over = 0.60` -> implied price = asking + 2% (market thinks it's worth more)
- `prob_over = 0.40` -> implied price = asking - 2% (market thinks it's worth less)

---

## LMSR Market Maker

We use a **Logarithmic Market Scoring Rule** (Hanson 2003). It guarantees infinite liquidity — there's always a price, always someone to trade against.

### State

The market tracks two numbers:

- `q_over` — total shares issued for OVER
- `q_under` — total shares issued for UNDER
- `b` — liquidity parameter (currently `100.0`, controls how sensitive prices are to trades)

### Cost Function

```python
def _cost(q_over, q_under):
    return b * math.log(math.exp(q_over / b) + math.exp(q_under / b))
```

The cost to buy `n` shares of a given outcome is the difference in the cost function before and after:

```python
# Cost to buy n OVER shares:
trade_cost = _cost(q_over + n, q_under) - _cost(q_over, q_under)
```

### Price (Probability)

The current price of OVER shares (= the market's implied probability that the house sells over asking):

```python
def price_over():
    exp_over = math.exp(q_over / b)
    exp_under = math.exp(q_under / b)
    return exp_over / (exp_over + exp_under)
```

This is always between 0 and 1. `price_under = 1 - price_over`.

### Executing a Trade

When someone buys shares:

1. Calculate cost using the cost function difference
2. Update `q_over` or `q_under`
3. Each share pays out **$1 if correct**, so:
   - `wager` = cost (what you paid)
   - `payout` = number of shares (what you get if right)
   - `profit_if_correct` = payout - wager

```python
def buy(outcome, shares, source="auto"):
    old_cost = _cost(q_over, q_under)
    if outcome == "over":
        new_cost = _cost(q_over + shares, q_under)
        q_over += shares
    else:
        new_cost = _cost(q_over, q_under + shares)
        q_under += shares

    cost = new_cost - old_cost
    payout = shares  # each share pays $1 if correct

    return {
        "outcome": outcome,
        "wager": cost,
        "payout": payout,
        "profit_if_correct": payout - cost,
        "prob_over_after": price_over(),
        "prob_under_after": price_under(),
    }
```

### The `b` Parameter

`b = 100.0` controls market sensitivity:
- **Higher b** = more liquidity, prices move slowly, takes more money to shift the market
- **Lower b** = less liquidity, prices are volatile, small bets have big impact

---

## Dollar-to-Shares Conversion (buy_with_budget)

Users never see "shares." They enter a **dollar wager** and the backend figures out how many shares that buys using binary search:

```python
def buy_with_budget(outcome, budget):
    """Find the number of shares that costs ~budget dollars."""
    lo, hi = 0.0, budget * 10
    for _ in range(100):
        mid = (lo + hi) / 2
        if outcome == "over":
            cost = _cost(q_over + mid, q_under) - _cost(q_over, q_under)
        else:
            cost = _cost(q_over, q_under + mid) - _cost(q_over, q_under)
        if abs(cost - budget) < 0.001:
            return mid
        if cost < budget:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2
```

**Why binary search?** The LMSR cost function has no closed-form inverse. But it's monotonic (more shares always costs more), so binary search converges in ~50 iterations to within $0.001.

**Example:** User wagers $50 on OVER at a fresh market (50/50). Binary search finds ~83 shares. So:
- Wager: $50.00
- Payout if correct: $83.18
- Profit if correct: $33.18

---

## Bot Agent Simulation (`/api/tick`)

Each tick, one automated agent places a bet. The agent uses **contrarian mean-reversion** so the market naturally oscillates around fair value instead of drifting to extremes.

### Step 1: Decide direction (OVER or UNDER)

```python
prob_over = market.price_over()

contrarian_strength = 0.6  # 60% contrarian, 40% noise
noise = random.gauss(0, 0.15)

p_bet_over = (1.0 - prob_over) * contrarian_strength \
           + 0.5 * (1.0 - contrarian_strength) \
           + noise

p_bet_over = max(0.05, min(0.95, p_bet_over))  # clamp

outcome = "over" if random.random() < p_bet_over else "under"
```

**How this works:**
- If market says 70% OVER, `(1.0 - 0.70) * 0.6 = 0.18` contrarian pull toward UNDER
- Plus `0.5 * 0.4 = 0.20` random baseline
- Plus Gaussian noise (std=0.15) for realistic wandering
- Net: ~38% chance of betting OVER, ~62% chance of betting UNDER (pushes back toward 50%)

The `contrarian_strength` parameter controls how aggressively agents mean-revert:
- `0.0` = pure random (50/50 regardless of market state)
- `1.0` = fully contrarian (always bets against the majority)
- `0.6` = current setting, moderate mean-reversion with realistic noise

### Step 2: Decide bet size (in shares)

```python
shares = random.choices(
    [1, 2, 3, 5, 8, 10, 15, 20],
    weights=[25, 20, 15, 12, 8, 8, 7, 5],
    k=1
)[0]
```

Most bets are small (1-3 shares = 60% of bets), occasionally large (10-20 shares = 20%). This creates realistic market microstructure — lots of small noise trades with occasional big moves.

### Step 3: Execute

```python
trade = market.buy(outcome, shares, source="auto")
```

The trade is executed through the same LMSR engine. The response includes the dollar-denominated wager/payout.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/market` | GET | Current market state (probabilities, total wagered, avg bet size) |
| `/api/bet` | POST | User places a bet: `{ guess_price: float, wager: float }` |
| `/api/tick` | POST | One bot agent places a random contrarian bet |
| `/api/house` | GET | Property data (address, asking price, stats) |
| `/api/history` | GET | Full trade history |
| `/api/reset` | POST | Reset market to initial state |

### `/api/bet` request/response

**Request:**
```json
{ "guess_price": 470000, "wager": 50 }
```

- `guess_price` > asking price -> outcome = "over"
- `guess_price` < asking price -> outcome = "under"
- `wager` -> converted to shares via `buy_with_budget`

**Response:**
```json
{
  "trade": {
    "outcome": "over",
    "wager": 50.00,
    "payout": 83.18,
    "profit_if_correct": 33.18,
    "prob_over_after": 0.6967,
    "prob_under_after": 0.3033,
    "source": "manual"
  },
  "market": {
    "prob_over": 0.6967,
    "prob_under": 0.3033,
    "q_over": 83.18,
    "q_under": 0.0,
    "total_trades": 1,
    "total_wagered": 50.0,
    "avg_bet_size": 50.0,
    "b": 100.0
  }
}
```

### `/api/market` response

```json
{
  "prob_over": 0.5,
  "prob_under": 0.5,
  "q_over": 0.0,
  "q_under": 0.0,
  "total_trades": 0,
  "total_wagered": 0,
  "avg_bet_size": 0,
  "b": 100.0
}
```

`q_over` and `q_under` are internal share counts — useful for computing the implied price on the frontend but shouldn't be displayed to users.

---

## Key Implementation Notes

- **Shares are invisible to users.** The entire UX is dollar-based. Users enter a price guess + dollar wager. The response shows wager, payout, and profit — never share counts.
- **Payout = shares.** In LMSR, each winning share pays exactly $1. So the payout in dollars equals the number of shares purchased.
- **The market is always liquid.** LMSR guarantees you can always buy or sell at some price. No order book, no matching needed.
- **`prob_over` is the key number.** Everything derives from it: the implied fair value price, the current "odds," and the direction of the market.
