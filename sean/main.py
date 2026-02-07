"""
Real Estate Fair Value Discovery via LMSR AMM
Automated agents place bets around the asking price.
The 50% mark shows the market's consensus fair value.
"""

import math
import random
import time
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path

app = FastAPI(title="FairValue")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── LMSR Market Maker ───────────────────────────────────────────────

class LMSRMarket:
    """
    Logarithmic Market Scoring Rule (Hanson 2003)
    Binary market: OVER vs UNDER the asking price.
    The point where probability = 50% represents fair value consensus.

    Cost function: C(q) = b * ln(e^(q_over/b) + e^(q_under/b))
    Price of OVER:  p = e^(q_over/b) / (e^(q_over/b) + e^(q_under/b))
    """

    def __init__(self, b: float = 100.0):
        self.b = b
        self.q_over = 0.0
        self.q_under = 0.0
        self.trade_history = []

    def _cost(self, q_over: float, q_under: float) -> float:
        return self.b * math.log(math.exp(q_over / self.b) + math.exp(q_under / self.b))

    def price_over(self) -> float:
        exp_over = math.exp(self.q_over / self.b)
        exp_under = math.exp(self.q_under / self.b)
        return exp_over / (exp_over + exp_under)

    def price_under(self) -> float:
        return 1.0 - self.price_over()

    def buy(self, outcome: str, shares: float, source: str = "auto") -> dict:
        old_cost = self._cost(self.q_over, self.q_under)
        if outcome == "over":
            new_cost = self._cost(self.q_over + shares, self.q_under)
            self.q_over += shares
        else:
            new_cost = self._cost(self.q_over, self.q_under + shares)
            self.q_under += shares

        cost = new_cost - old_cost
        payout = shares  # each share pays $1 if correct
        trade = {
            "outcome": outcome,
            "wager": round(cost, 2),
            "payout": round(payout, 2),
            "profit_if_correct": round(payout - cost, 2),
            "prob_over_after": round(self.price_over(), 4),
            "prob_under_after": round(self.price_under(), 4),
            "timestamp": time.time(),
            "source": source,
        }
        self.trade_history.append(trade)
        return trade

    def buy_with_budget(self, outcome: str, budget: float) -> float:
        """Binary-search for the number of shares that costs ~budget dollars."""
        lo, hi = 0.0, budget * 10
        for _ in range(100):
            mid = (lo + hi) / 2
            if outcome == "over":
                cost = self._cost(self.q_over + mid, self.q_under) - self._cost(self.q_over, self.q_under)
            else:
                cost = self._cost(self.q_over, self.q_under + mid) - self._cost(self.q_over, self.q_under)
            if abs(cost - budget) < 0.001:
                return mid
            if cost < budget:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def get_state(self) -> dict:
        total_wagered = sum(t["wager"] for t in self.trade_history)
        total_trades = len(self.trade_history)
        return {
            "prob_over": round(self.price_over(), 4),
            "prob_under": round(self.price_under(), 4),
            "q_over": round(self.q_over, 2),
            "q_under": round(self.q_under, 2),
            "total_trades": total_trades,
            "total_wagered": round(total_wagered, 2),
            "avg_bet_size": round(total_wagered / total_trades, 2) if total_trades > 0 else 0,
            "b": self.b,
        }

    def reset(self):
        self.q_over = 0.0
        self.q_under = 0.0
        self.trade_history = []


# ─── House Data ───────────────────────────────────────────────────────

HOUSE = {
    "address": "742 Evergreen Terrace, Springfield, IL",
    "asking_price": 450000,
    "bedrooms": 4,
    "bathrooms": 2.5,
    "sqft": 2200,
    "year_built": 1985,
    "lot_acres": 0.25,
    "description": "Charming 4-bedroom colonial in a quiet neighborhood. "
                   "Recently updated kitchen and bathrooms. Large backyard "
                   "with mature trees. Close to schools and shopping.",
    "image_url": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
}

# ─── Global market instance ──────────────────────────────────────────

market = LMSRMarket(b=100.0)


# ─── API Models ───────────────────────────────────────────────────────

class BetRequest(BaseModel):
    guess_price: float  # user's predicted sale price
    wager: float        # dollar amount to wager


# ─── Routes ───────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    html = Path("index.html").read_text()
    return HTMLResponse(content=html)


@app.get("/api/house")
async def get_house():
    return HOUSE


@app.get("/api/market")
async def get_market():
    return market.get_state()


@app.post("/api/bet")
async def place_bet(req: BetRequest):
    if req.wager <= 0:
        return {"error": "wager must be positive"}
    outcome = "over" if req.guess_price >= HOUSE["asking_price"] else "under"
    shares = market.buy_with_budget(outcome, req.wager)
    trade = market.buy(outcome, shares, source="manual")
    return {"trade": trade, "market": market.get_state()}


@app.post("/api/tick")
async def tick():
    """
    One automated agent places a bet.
    The agent's decision is influenced by the current market probability
    so that the market mean-reverts toward 50% (fair value) with noise.

    - If the market says >50% OVER, contrarian agents are slightly more
      likely to bet UNDER, pulling it back.
    - Bet sizes vary: mostly small, occasionally large (noise traders).
    - A small random "sentiment drift" adds realistic wandering.
    """
    prob_over = market.price_over()

    # Mean-reversion: the further from 50%, the more likely a contrarian bet
    # Base chance of betting OVER = inverse of current prob (contrarian pressure)
    # Plus noise so it's not deterministic
    contrarian_strength = 0.6  # how strongly agents push back to 50%
    noise = random.gauss(0, 0.15)
    p_bet_over = (1.0 - prob_over) * contrarian_strength + 0.5 * (1.0 - contrarian_strength) + noise
    p_bet_over = max(0.05, min(0.95, p_bet_over))  # clamp

    outcome = "over" if random.random() < p_bet_over else "under"

    # Varying bet sizes: mostly small, occasionally large
    shares = random.choices(
        [1, 2, 3, 5, 8, 10, 15, 20],
        weights=[25, 20, 15, 12, 8, 8, 7, 5],
        k=1
    )[0]

    trade = market.buy(outcome, shares, source="auto")
    return {"trade": trade, "market": market.get_state()}


@app.get("/api/history")
async def get_history():
    return {
        "trades": market.trade_history,
        "total": len(market.trade_history),
    }


@app.post("/api/reset")
async def reset_market():
    market.reset()
    return {"status": "reset", "market": market.get_state()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
