// Cognee AI Memory Service for FairValue.
// Browser code must call the local server boundary only; the server owns secrets.

interface LMSRState {
  qOver: number;
  qUnder: number;
  totalWagered: number;
  totalTrades: number;
  fairValue: number;
  askingPrice: number;
  timestamp: string;
  propertyId: string;
}

interface BetData {
  id: string;
  direction: 'higher' | 'lower';
  amount: number;
  priceAtBet: number;
  timestamp: Date;
  propertyId: string;
  shares: number;
  actualCost: number;
}

interface DegradedAIResponse {
  degraded?: boolean;
  error?: string;
  message?: string;
}

const headers = {
  'Content-Type': 'application/json',
};

function isDegradedAIResponse(data: unknown): data is DegradedAIResponse {
  return Boolean(data && typeof data === 'object' && 'degraded' in data);
}

async function requestAI(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.status === 503 && isDegradedAIResponse(data)) {
    return data;
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: string }).message)
        : `AI request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

/**
 * Initialize the knowledge graph for a property market.
 */
export const initializeMarketGraph = async (propertyId: string, askingPrice: number) => {
  try {
    const data = await requestAI(`/api/ai/cognee/markets/${encodeURIComponent(propertyId)}/initialize`, {
      method: 'POST',
      body: JSON.stringify({
        asking_price: askingPrice,
      }),
    });

    if (isDegradedAIResponse(data)) {
      console.warn(data.message || 'AI analyst unavailable');
      return false;
    }

    console.log(`Market graph initialized for property ${propertyId}`);
    return true;
  } catch (error) {
    console.error('Error initializing market graph:', error);
    return false;
  }
};

/**
 * Store LMSR state and bet data to the server-side Cognee boundary.
 */
export const storeLMSRState = async (state: LMSRState, bet?: BetData) => {
  try {
    const data = await requestAI(`/api/ai/cognee/markets/${encodeURIComponent(state.propertyId)}/state`, {
      method: 'POST',
      body: JSON.stringify({
        state,
        bet,
      }),
    });

    if (isDegradedAIResponse(data)) {
      console.warn(data.message || 'AI analyst unavailable');
      return false;
    }

    console.log('LMSR state stored in Cognee');
    return true;
  } catch (error) {
    console.error('Error storing LMSR state:', error);
    return false;
  }
};

/**
 * Search the knowledge graph with natural language query.
 */
export const searchMarketInsights = async (
  query: string,
  propertyId: string,
  searchType: 'GRAPH_COMPLETION' | 'CHUNKS' | 'SUMMARIES' | 'INSIGHTS' = 'GRAPH_COMPLETION'
) => {
  try {
    const data = await requestAI(`/api/ai/cognee/markets/${encodeURIComponent(propertyId)}/search`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        search_type: searchType,
      }),
    });

    if (isDegradedAIResponse(data)) {
      return data.message || 'AI Analyst is unavailable until COGNEE_API_KEY is configured on the server.';
    }

    return data;
  } catch (error) {
    console.error('Error searching market insights:', error);
    throw error;
  }
};

/**
 * Get dataset graph structure.
 */
export const getMarketGraph = async (propertyId: string) => {
  try {
    const data = await requestAI(`/api/ai/cognee/markets/${encodeURIComponent(propertyId)}/graph`, {
      method: 'GET',
    });
    if (isDegradedAIResponse(data)) return null;
    return data;
  } catch (error) {
    console.error('Error fetching market graph:', error);
    return null;
  }
};

/**
 * Generate graph visualization HTML.
 */
export const visualizeMarketGraph = async (outputPath?: string) => {
  try {
    const url = outputPath
      ? `/api/ai/cognee/visualize?output_path=${encodeURIComponent(outputPath)}`
      : '/api/ai/cognee/visualize';

    const data = await requestAI(url, {
      method: 'GET',
    });
    if (isDegradedAIResponse(data)) return null;
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (error) {
    console.error('Error generating visualization:', error);
    return null;
  }
};

export type { LMSRState, BetData };
