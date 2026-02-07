"""
Real Estate Fair Value Discovery via LMSR AMM — Multiplayer Edition
Host displays on TV/projector, players join from phones via room codes.
"""

import asyncio
import math
import random
import string
import time
from dataclasses import dataclass, field
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path

app = FastAPI(title="FairValue Multiplayer")

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


# ─── Room & Player Data ──────────────────────────────────────────────

@dataclass
class PlayerBet:
    outcome: str
    wager: float
    shares: float
    prob_at_entry: float
    timestamp: float

@dataclass
class Player:
    session_id: str
    nickname: str
    balance: float = 1000.0
    bets: list = field(default_factory=list)

    def to_dict(self):
        return {
            "session_id": self.session_id,
            "nickname": self.nickname,
            "balance": round(self.balance, 2),
            "bets": [
                {
                    "outcome": b.outcome,
                    "wager": round(b.wager, 2),
                    "shares": round(b.shares, 2),
                    "prob_at_entry": round(b.prob_at_entry, 4),
                    "timestamp": b.timestamp,
                }
                for b in self.bets
            ],
        }

@dataclass
class Room:
    code: str
    house: dict
    market: LMSRMarket = field(default_factory=lambda: LMSRMarket(b=100.0))
    players: dict = field(default_factory=dict)  # session_id -> Player
    connections: list = field(default_factory=list)  # WebSocket refs
    ai_enabled: bool = False
    ai_task: Optional[asyncio.Task] = None
    settled: bool = False
    activity: list = field(default_factory=list)  # activity feed entries


# ─── Global rooms store ──────────────────────────────────────────────

rooms: dict[str, Room] = {}


def generate_room_code() -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if code not in rooms:
            return code


async def broadcast(room: Room, event: dict):
    """Send JSON event to all WebSocket connections in a room. Remove dead ones."""
    dead = []
    for ws in room.connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        room.connections.remove(ws)


# ─── API Models ──────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    address: str
    asking_price: float

class JoinRoomRequest(BaseModel):
    session_id: str
    nickname: str

class BetRequest(BaseModel):
    session_id: str
    outcome: str  # "over" or "under"
    wager: float

class SettleRequest(BaseModel):
    actual_price: float


# ─── Room Endpoints ──────────────────────────────────────────────────

@app.post("/api/rooms")
async def create_room(req: CreateRoomRequest):
    code = generate_room_code()
    house = {"address": req.address, "asking_price": req.asking_price}
    room = Room(code=code, house=house)
    rooms[code] = room
    return {"room_code": code, "house": house}


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, req: JoinRoomRequest):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}, 404

    if req.session_id in room.players:
        # Returning player — update nickname if changed
        player = room.players[req.session_id]
        player.nickname = req.nickname
    else:
        player = Player(session_id=req.session_id, nickname=req.nickname)
        room.players[req.session_id] = player
        room.activity.append({
            "type": "join",
            "nickname": req.nickname,
            "timestamp": time.time(),
        })
        await broadcast(room, {
            "type": "join",
            "nickname": req.nickname,
            "player": player.to_dict(),
            "player_count": len(room.players),
        })

    return {
        "player": player.to_dict(),
        "market": room.market.get_state(),
        "players": [p.to_dict() for p in room.players.values()],
        "house": room.house,
        "activity": room.activity[-50:],
    }


@app.get("/api/rooms/{code}/state")
async def get_room_state(code: str):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}

    return {
        "market": room.market.get_state(),
        "players": [p.to_dict() for p in room.players.values()],
        "house": room.house,
        "history": room.market.trade_history,
        "activity": room.activity[-50:],
        "ai_enabled": room.ai_enabled,
        "settled": room.settled,
    }


@app.post("/api/rooms/{code}/bet")
async def place_bet(code: str, req: BetRequest):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}
    if room.settled:
        return {"error": "Market is settled"}
    if req.outcome not in ("over", "under"):
        return {"error": "Outcome must be 'over' or 'under'"}
    if req.wager <= 0:
        return {"error": "Wager must be positive"}

    player = room.players.get(req.session_id)
    if not player:
        return {"error": "Player not found in room"}
    if req.wager > player.balance:
        return {"error": "Insufficient balance"}

    # Execute LMSR buy
    shares = room.market.buy_with_budget(req.outcome, req.wager)
    trade = room.market.buy(req.outcome, shares, source=player.nickname)

    # Deduct balance, record bet
    player.balance -= trade["wager"]
    player.bets.append(PlayerBet(
        outcome=req.outcome,
        wager=trade["wager"],
        shares=shares,
        prob_at_entry=trade["prob_over_after"] if req.outcome == "over" else trade["prob_under_after"],
        timestamp=trade["timestamp"],
    ))

    activity_entry = {
        "type": "bet",
        "nickname": player.nickname,
        "outcome": req.outcome,
        "wager": trade["wager"],
        "timestamp": trade["timestamp"],
    }
    room.activity.append(activity_entry)

    # Broadcast to all connections
    await broadcast(room, {
        "type": "bet",
        "nickname": player.nickname,
        "outcome": req.outcome,
        "wager": trade["wager"],
        "trade": trade,
        "market": room.market.get_state(),
        "player": player.to_dict(),
        "activity": activity_entry,
    })

    return {
        "trade": trade,
        "market": room.market.get_state(),
        "player": player.to_dict(),
    }


@app.post("/api/rooms/{code}/settle")
async def settle_market(code: str, req: SettleRequest):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}

    # Stop AI if running
    if room.ai_task and not room.ai_task.done():
        room.ai_task.cancel()
    room.ai_enabled = False
    room.settled = True

    winning_outcome = "over" if req.actual_price >= room.house["asking_price"] else "under"

    # Award payouts
    results = []
    for player in room.players.values():
        payout = 0.0
        for bet in player.bets:
            if bet.outcome == winning_outcome:
                payout += bet.shares  # each share pays $1
        player.balance += payout
        results.append({
            "nickname": player.nickname,
            "payout": round(payout, 2),
            "final_balance": round(player.balance, 2),
        })

    activity_entry = {
        "type": "settle",
        "actual_price": req.actual_price,
        "winning_outcome": winning_outcome,
        "timestamp": time.time(),
    }
    room.activity.append(activity_entry)

    await broadcast(room, {
        "type": "settle",
        "actual_price": req.actual_price,
        "winning_outcome": winning_outcome,
        "results": results,
        "activity": activity_entry,
    })

    return {
        "winning_outcome": winning_outcome,
        "actual_price": req.actual_price,
        "results": results,
    }


@app.post("/api/rooms/{code}/toggle-ai")
async def toggle_ai(code: str):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}
    if room.settled:
        return {"error": "Market is settled"}

    room.ai_enabled = not room.ai_enabled

    if room.ai_enabled:
        room.ai_task = asyncio.create_task(_run_ai_agents(room))
    else:
        if room.ai_task and not room.ai_task.done():
            room.ai_task.cancel()

    return {"ai_enabled": room.ai_enabled}


async def _run_ai_agents(room: Room):
    """Background task: contrarian AI agent places a bet every 5 seconds."""
    try:
        while room.ai_enabled and not room.settled:
            await asyncio.sleep(5)
            if not room.ai_enabled or room.settled:
                break

            prob_over = room.market.price_over()

            # Mean-reversion contrarian logic
            contrarian_strength = 0.6
            noise = random.gauss(0, 0.15)
            p_bet_over = (1.0 - prob_over) * contrarian_strength + 0.5 * (1.0 - contrarian_strength) + noise
            p_bet_over = max(0.05, min(0.95, p_bet_over))

            outcome = "over" if random.random() < p_bet_over else "under"

            shares = random.choices(
                [1, 2, 3, 5, 8, 10, 15, 20],
                weights=[25, 20, 15, 12, 8, 8, 7, 5],
                k=1,
            )[0]

            trade = room.market.buy(outcome, shares, source="AI")

            activity_entry = {
                "type": "ai_trade",
                "outcome": outcome,
                "wager": trade["wager"],
                "timestamp": trade["timestamp"],
            }
            room.activity.append(activity_entry)

            await broadcast(room, {
                "type": "ai_trade",
                "outcome": outcome,
                "wager": trade["wager"],
                "trade": trade,
                "market": room.market.get_state(),
                "activity": activity_entry,
            })
    except asyncio.CancelledError:
        pass


@app.get("/api/rooms/{code}/leaderboard")
async def get_leaderboard(code: str):
    room = rooms.get(code.upper())
    if not room:
        return {"error": "Room not found"}

    sorted_players = sorted(room.players.values(), key=lambda p: p.balance, reverse=True)
    return {
        "leaderboard": [
            {"nickname": p.nickname, "balance": round(p.balance, 2)}
            for p in sorted_players
        ]
    }


# ─── WebSocket ───────────────────────────────────────────────────────

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    room = rooms.get(room_code.upper())
    if not room:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    room.connections.append(websocket)

    try:
        while True:
            # Keep connection alive; client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in room.connections:
            room.connections.remove(websocket)


# ─── Legacy endpoints (keep for standalone testing) ──────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    html_path = Path("index.html")
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text())
    return HTMLResponse(content="<h1>FairValue Multiplayer Backend</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
