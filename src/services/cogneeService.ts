// Cognee AI Memory Service for FairValue
// API Documentation: https://docs.cognee.ai

const COGNEE_BASE_URL = 'https://api.cognee.ai';
const API_KEY = 'eb6226f5d948d3a48e1c5867043fc5fba7573ec9db11a56f';

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

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
};

/**
 * Initialize the knowledge graph for a property market
 */
export const initializeMarketGraph = async (propertyId: string, askingPrice: number) => {
  try {
    const marketDescription = `
Property Market ${propertyId}: Real estate prediction market with asking price $${askingPrice}.
This market uses LMSR (Logarithmic Market Scoring Rule) algorithm for fair value pricing.
Bettors predict if the property will appraise OVER or UNDER the asking price.
The fair value is calculated as: asking_price + (prob_over - 0.5) * 2 * asking_price * 0.10
`;

    // Add market context to Cognee
    const addResponse = await fetch(`${COGNEE_BASE_URL}/api/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: marketDescription,
        dataset_name: `property_market_${propertyId}`,
      }),
    });

    if (!addResponse.ok) {
      throw new Error(`Failed to add market data: ${addResponse.statusText}`);
    }

    // Cognify the data into knowledge graph
    const cognifyResponse = await fetch(`${COGNEE_BASE_URL}/api/cognify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        datasets: [`property_market_${propertyId}`],
      }),
    });

    if (!cognifyResponse.ok) {
      throw new Error(`Failed to cognify market data: ${cognifyResponse.statusText}`);
    }

    console.log(`Market graph initialized for property ${propertyId}`);
    return true;
  } catch (error) {
    console.error('Error initializing market graph:', error);
    return false;
  }
};

/**
 * Store LMSR state and bet data to Cognee knowledge graph
 */
export const storeLMSRState = async (state: LMSRState, bet?: BetData) => {
  try {
    const stateDescription = `
LMSR Market State at ${state.timestamp}:
- Property ID: ${state.propertyId}
- Asking Price: $${state.askingPrice}
- Current Fair Value: $${state.fairValue.toFixed(2)}
- qOver (OVER shares outstanding): ${state.qOver.toFixed(2)}
- qUnder (UNDER shares outstanding): ${state.qUnder.toFixed(2)}
- Total Wagered: $${state.totalWagered.toFixed(2)}
- Total Trades: ${state.totalTrades}
- Probability OVER: ${(state.qOver / (state.qOver + state.qUnder || 1)).toFixed(4)}
`;

    // Add market state
    const addResponse = await fetch(`${COGNEE_BASE_URL}/api/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: stateDescription,
        dataset_name: `lmsr_state_${state.propertyId}`,
      }),
    });

    if (!addResponse.ok) {
      throw new Error(`Failed to add LMSR state: ${addResponse.statusText}`);
    }

    // Add bet data if provided
    if (bet) {
      const betDescription = `
Trade Executed at ${bet.timestamp.toISOString()}:
- Property: ${bet.propertyId}
- Direction: ${bet.direction === 'higher' ? 'OVER (higher)' : 'UNDER (lower)'}
- Wager Amount: $${bet.amount.toFixed(2)}
- Shares Purchased: ${bet.shares.toFixed(2)}
- Actual Cost: $${bet.actualCost.toFixed(2)}
- Price at Bet: $${bet.priceAtBet.toFixed(2)}
- Bet ID: ${bet.id}
This trade updated the market state through LMSR cost function mechanics.
`;

      const betResponse = await fetch(`${COGNEE_BASE_URL}/api/add`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: betDescription,
          dataset_name: `bets_${bet.propertyId}`,
        }),
      });

      if (!betResponse.ok) {
        throw new Error(`Failed to add bet data: ${betResponse.statusText}`);
      }
    }

    // Cognify to update knowledge graph
    const cognifyResponse = await fetch(`${COGNEE_BASE_URL}/api/cognify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        datasets: [`lmsr_state_${state.propertyId}`, `bets_${state.propertyId}`],
      }),
    });

    if (!cognifyResponse.ok) {
      throw new Error(`Failed to cognify state: ${cognifyResponse.statusText}`);
    }

    console.log('LMSR state stored in Cognee');
    return true;
  } catch (error) {
    console.error('Error storing LMSR state:', error);
    return false;
  }
};

/**
 * Search the knowledge graph with natural language query
 */
export const searchMarketInsights = async (
  query: string,
  propertyId: string,
  searchType: 'GRAPH_COMPLETION' | 'CHUNKS' | 'SUMMARIES' | 'INSIGHTS' = 'GRAPH_COMPLETION'
) => {
  try {
    const response = await fetch(`${COGNEE_BASE_URL}/api/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        search_type: searchType,
        datasets: [`property_market_${propertyId}`, `lmsr_state_${propertyId}`, `bets_${propertyId}`],
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching market insights:', error);
    throw error;
  }
};

/**
 * Get dataset graph structure
 */
export const getMarketGraph = async (propertyId: string) => {
  try {
    const response = await fetch(
      `${COGNEE_BASE_URL}/api/datasets/property_market_${propertyId}/graph`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get graph: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching market graph:', error);
    return null;
  }
};

/**
 * Generate graph visualization HTML
 */
export const visualizeMarketGraph = async (outputPath?: string) => {
  try {
    const url = outputPath 
      ? `${COGNEE_BASE_URL}/api/visualize?output_path=${encodeURIComponent(outputPath)}`
      : `${COGNEE_BASE_URL}/api/visualize`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Visualization failed: ${response.statusText}`);
    }

    // Returns HTML content for the graph
    const html = await response.text();
    return html;
  } catch (error) {
    console.error('Error generating visualization:', error);
    return null;
  }
};

export type { LMSRState, BetData };
