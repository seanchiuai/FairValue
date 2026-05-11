import { expect, test, type APIRequestContext } from '@playwright/test';
import WebSocket from 'ws';
import { loadRoomSnapshot } from './snapshot';

const backendPort = process.env.E2E_BACKEND_PORT || '8031';
const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
const wsBaseUrl = `ws://127.0.0.1:${backendPort}`;
const storePath = process.env.FAIRVALUE_ROOM_STORE_PATH || '';

const property = {
  address: '515 Soak Profile Circle',
  askingPrice: 740000,
  actualPrice: 758000,
};

type RoomResponse = {
  room_code: string;
  host_token: string;
};

type RoomSocket = {
  messages: Array<Record<string, unknown>>;
  socket: WebSocket;
};

async function createRoom(request: APIRequestContext): Promise<RoomResponse> {
  const response = await request.post(`${apiBaseUrl}/api/rooms`, {
    data: { address: property.address, asking_price: property.askingPrice },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.room_code).toMatch(/^[A-Z0-9]{4}$/);
  expect(body.host_token).toBeTruthy();
  return body;
}

async function connectRoomSocket(roomCode: string): Promise<RoomSocket> {
  const socket = new WebSocket(`${wsBaseUrl}/ws/${roomCode}`);
  const messages: Array<Record<string, unknown>> = [];
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out opening room socket ${roomCode}`)), 10_000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return { socket, messages };
}

async function joinByApi(request: APIRequestContext, roomCode: string, sessionId: string, nickname: string) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/join`, {
    data: { session_id: sessionId, nickname },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function betByApi(
  request: APIRequestContext,
  roomCode: string,
  sessionId: string,
  idempotencyKey: string,
  outcome: 'over' | 'under',
  wager: number
) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/bet`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { session_id: sessionId, outcome, wager },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function settleByApi(request: APIRequestContext, roomCode: string, hostToken: string) {
  const response = await request.post(`${apiBaseUrl}/api/rooms/${roomCode}/settle`, {
    headers: { 'X-FairValue-Host-Token': hostToken },
    data: { actual_price: property.actualPrice },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

function countMessages(messages: Array<Record<string, unknown>>, type: string) {
  return messages.filter((message) => message.type === type).length;
}

test('room API and WebSocket loop survives sustained join and bet waves', async ({ request }) => {
  const waves = 4;
  const playersPerWave = 6;
  const { room_code: roomCode, host_token: hostToken } = await createRoom(request);
  const { socket, messages } = await connectRoomSocket(roomCode);
  let joinedPlayers = 0;
  let placedBets = 0;
  let expectedWagered = 0;
  const firstBet = {
    sessionId: '',
    idempotencyKey: '',
    outcome: 'over' as const,
    wager: 0,
  };

  try {
    for (let wave = 0; wave < waves; wave += 1) {
      const players = Array.from({ length: playersPerWave }, (_, index) => {
        const absoluteIndex = wave * playersPerWave + index;
        const wager = 10 + (absoluteIndex % 5) * 5;
        return {
          sessionId: `soak-player-${Date.now()}-${wave}-${index}`,
          nickname: `Soak ${wave + 1}.${index + 1}`,
          outcome: absoluteIndex % 2 === 0 ? 'over' as const : 'under' as const,
          wager,
          idempotencyKey: `soak-bet-${wave}-${index}-${Date.now()}`,
        };
      });

      await Promise.all(players.map((player) => joinByApi(request, roomCode, player.sessionId, player.nickname)));
      joinedPlayers += players.length;
      await expect.poll(() => countMessages(messages, 'join'), { timeout: 10_000 }).toBe(joinedPlayers);

      const bets = await Promise.all(
        players.map((player) =>
          betByApi(request, roomCode, player.sessionId, player.idempotencyKey, player.outcome, player.wager)
        )
      );
      expect(bets).toHaveLength(players.length);
      placedBets += players.length;
      expectedWagered += players.reduce((sum, player) => sum + player.wager, 0);
      await expect.poll(() => countMessages(messages, 'bet'), { timeout: 10_000 }).toBe(placedBets);

      if (!firstBet.sessionId) {
        Object.assign(firstBet, players[0]);
      }

      const stateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
      expect(stateResponse.status()).toBe(200);
      const state = await stateResponse.json();
      expect(state.players).toHaveLength(joinedPlayers);
      expect(state.market.total_trades).toBe(placedBets);
      expect(state.market.total_wagered).toBe(expectedWagered);
      expect(state.event_sequence).toBeGreaterThanOrEqual(joinedPlayers + placedBets);
    }

    const duplicate = await betByApi(
      request,
      roomCode,
      firstBet.sessionId,
      firstBet.idempotencyKey,
      firstBet.outcome,
      firstBet.wager
    );
    expect(duplicate.idempotent_replay).toBe(true);

    const settlement = await settleByApi(request, roomCode, hostToken);
    expect(settlement.winning_outcome).toBe('over');

    const finalStateResponse = await request.get(`${apiBaseUrl}/api/rooms/${roomCode}/state`);
    expect(finalStateResponse.status()).toBe(200);
    const finalState = await finalStateResponse.json();
    expect(finalState.settled).toBe(true);
    expect(finalState.market.total_trades).toBe(placedBets);
    expect(finalState.market.total_wagered).toBe(expectedWagered);

    if (storePath) {
      const snapshot = loadRoomSnapshot(storePath);
      expect(snapshot.rooms[roomCode]).toBeTruthy();
      expect(Object.keys(snapshot.rooms[roomCode].players)).toHaveLength(joinedPlayers);
      expect(snapshot.rooms[roomCode].market.total_trades).toBe(placedBets);
      expect(snapshot.rooms[roomCode].settled).toBe(true);
    }
  } finally {
    socket.close();
  }
});
