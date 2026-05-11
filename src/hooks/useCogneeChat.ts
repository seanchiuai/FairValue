import { useState, useRef, useCallback } from 'react';
import {
  initializeMarketGraph,
  storeLMSRState,
  searchMarketInsights,
  type LMSRState,
  type AnalystMarketContext,
} from '../services/cogneeService';
import { calculateImpliedPrice } from '../lib/lmsr';
import type { Market, ActivityEntry, PlayerData, ChatMessage, CogneeCitation, CogneeSearchResponse } from '../types';

interface UseCogneeChatProps {
  propertyId: string;
  askingPrice: number;
  market: Market | null;
  activity: ActivityEntry[];
  players: PlayerData[];
}

function formatCogneeResponse(data: CogneeSearchResponse | string): string {
  if (typeof data === 'string') return data;

  if (Array.isArray(data)) {
    const withSearchResult = data.find((item) =>
      Array.isArray(item.search_result) && item.search_result.length > 0
    );
    if (withSearchResult && withSearchResult.search_result) return withSearchResult.search_result[0];

    const texts = data
      .map((item) => item.content || item.text || item.description || item.summary || '')
      .filter(Boolean);
    if (texts.length > 0) return texts.join('\n\n');
    return JSON.stringify(data, null, 2);
  }

  const evidence = formatEvidence(data.citations, data.limitations);

  if (data.search_result) {
    if (Array.isArray(data.search_result) && data.search_result.length > 0) {
      return `${data.search_result[0]}${evidence}`;
    }
    if (typeof data.search_result === 'string') return `${data.search_result}${evidence}`;
  }
  if (data.results) return formatCogneeResponse(data.results);
  if (data.data) return formatCogneeResponse(data.data);
  if (data.content) return `${data.content}${evidence}`;
  if (data.text) return `${data.text}${evidence}`;
  if (data.message) return `${data.message}${evidence}`;

  return JSON.stringify(data, null, 2);
}

function formatEvidence(citations?: CogneeCitation[], limitations?: string[]) {
  const lines: string[] = [];
  if (citations?.length) {
    lines.push('', 'Evidence used:');
    citations.forEach((citation, index) => {
      lines.push(`[${index + 1}] ${citation.label}: ${citation.detail}`);
    });
  }
  if (limitations?.length) {
    lines.push('', 'Limits:');
    limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  }
  return lines.length ? `\n${lines.join('\n')}` : '';
}

export function useCogneeChat({ propertyId, askingPrice, market, activity, players }: UseCogneeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const graphInitialized = useRef(false);

  const pushCurrentState = useCallback(async () => {
    if (!market) return;
    const fairValue = calculateImpliedPrice(market.prob_over, askingPrice);
    const state: LMSRState = {
      qOver: market.q_over,
      qUnder: market.q_under,
      totalWagered: market.total_wagered,
      totalTrades: market.total_trades,
      fairValue,
      askingPrice,
      timestamp: new Date().toISOString(),
      propertyId,
    };
    await storeLMSRState(state);
  }, [market, askingPrice, propertyId]);

  const sendMessage = useCallback(async (query: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Lazy graph initialization
      if (!graphInitialized.current) {
        setIsInitializing(true);
        await initializeMarketGraph(propertyId, askingPrice);
        graphInitialized.current = true;
        setIsInitializing(false);
      }

      // Push current market state so Cognee has latest context
      await pushCurrentState();

      // Build enriched query with market context
      const betSummary = activity
        .filter(a => a.type === 'bet' || a.type === 'ai_trade')
        .slice(-10)
        .map(a => `${a.nickname || 'AI'} bet $${a.wager?.toFixed(0)} on ${a.outcome?.toUpperCase()}`)
        .join('; ');

      const contextQuery = market
        ? `${query}\n\nCurrent market: ${Math.round(market.prob_over * 100)}% think OVER, ${market.total_trades} trades, $${market.total_wagered.toFixed(0)} volume, asking price $${askingPrice.toLocaleString()}. Recent bets: ${betSummary || 'none yet'}.`
        : query;

      const marketContext: AnalystMarketContext | undefined = market
        ? {
          probability_over: market.prob_over,
          total_trades: market.total_trades,
          total_wagered: market.total_wagered,
          asking_price: askingPrice,
          implied_fair_value: calculateImpliedPrice(market.prob_over, askingPrice),
          player_count: players.length,
          timestamp: new Date().toISOString(),
          recent_bets: activity
            .filter(a => a.type === 'bet' || a.type === 'ai_trade')
            .slice(-5)
            .map(a => ({
              nickname: a.nickname,
              outcome: a.outcome,
              wager: a.wager,
            })),
        }
        : undefined;

      const response = await searchMarketInsights(contextQuery, propertyId, 'GRAPH_COMPLETION', marketContext);
      const content = formatCogneeResponse(response);
      const isDegradedInsight =
        typeof response === 'object' && !Array.isArray(response) &&
        Boolean(response.degraded && !response.local_analysis);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: content || 'No insights available for that question. Try asking about the market state, bet patterns, or fair value.',
        timestamp: new Date(),
        isError: isDegradedInsight,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Failed to get insights: ${error instanceof Error ? error.message : 'Unknown error'}. Try again.`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setIsInitializing(false);
    }
  }, [propertyId, askingPrice, market, activity, players, pushCurrentState]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, isInitializing, sendMessage, clearMessages };
}
