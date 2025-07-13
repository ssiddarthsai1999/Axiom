// utils/hyperliquidApi.js

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';

/**
 * Fetch perpetuals metadata and asset contexts from Hyperliquid API
 * This provides all the market data needed for the dropdown
 */
export async function fetchMarketData() {
  try {
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'metaAndAssetCtxs',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return processMarketData(data);
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

/**
 * Process the raw API data into the format expected by the TokenData component
 */
function processMarketData(rawData) {
  const [meta, assetCtxs] = rawData;
  
  const processedTokens = meta.universe.map((asset, index) => {
    const assetCtx = assetCtxs[index];
    
    return {
      symbol: asset.name,
      maxLeverage: asset.maxLeverage,
      price: parseFloat(assetCtx.markPx),
      oraclePrice: parseFloat(assetCtx.oraclePx),
      change24h: calculatePriceChange(assetCtx), // You'll need to implement this based on available data
      funding: parseFloat(assetCtx.funding),
      volume24h: parseFloat(assetCtx.dayNtlVlm),
      openInterest: parseFloat(assetCtx.openInterest),
      
      // Additional useful data from the API
      impactNotional: parseFloat(assetCtx.impactNotional),
      premium: parseFloat(assetCtx.premium),
      prevDayPx: parseFloat(assetCtx.prevDayPx),
      
      // Asset metadata
      szDecimals: asset.szDecimals,
      onlyIsolated: asset.onlyIsolated,
    };
  });

  return processedTokens;
}

/**
 * Calculate 24h price change percentage
 * This uses the current price vs previous day price
 */
function calculatePriceChange(assetCtx) {
  const currentPrice = parseFloat(assetCtx.markPx);
  const prevDayPrice = parseFloat(assetCtx.prevDayPx);
  
  if (prevDayPrice === 0) return 0;
  
  return ((currentPrice - prevDayPrice) / prevDayPrice) * 100;
}

/**
 * Fetch specific asset data by symbol
 */
export async function fetchAssetData(symbol) {
  try {
    const allMarketData = await fetchMarketData();
    return allMarketData.find(asset => asset.symbol === symbol);
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Fetch user's perpetuals account summary
 */
export async function fetchUserAccount(userAddress) {
  try {
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user account:', error);
    throw error;
  }
}

/**
 * Fetch historical funding rates for a specific coin
 */
export async function fetchFundingHistory(coin, startTime, endTime) {
  try {
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'fundingHistory',
        coin,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching funding history:', error);
    throw error;
  }
}

/**
 * Fetch order book data for a specific coin
 */
export async function fetchOrderBook(coin, nSigFigs = null) {
  try {
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'l2Book',
        coin,
        nSigFigs,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching order book:', error);
    throw error;
  }
}

/**
 * Get 24h trading stats for all markets
 */
export async function fetch24hStats() {
  try {
    const marketData = await fetchMarketData();
    
    // Calculate aggregated stats
    const totalVolume = marketData.reduce((sum, asset) => sum + asset.volume24h, 0);
    const totalOpenInterest = marketData.reduce((sum, asset) => sum + (asset.openInterest * asset.price), 0);
    
    return {
      totalVolume,
      totalOpenInterest,
      marketCount: marketData.length,
      topVolume: marketData.sort((a, b) => b.volume24h - a.volume24h).slice(0, 10),
      topMovers: marketData.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 10),
    };
  } catch (error) {
    console.error('Error fetching 24h stats:', error);
    throw error;
  }
}

/**
 * Real-time data subscription using WebSocket (optional)
 * You can use this to get real-time updates for the selected tokens
 */
export class HyperliquidWebSocket {
  constructor() {
    this.ws = null;
    this.subscriptions = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        // Resubscribe to all previous subscriptions
        this.subscriptions.forEach(subscription => {
          this.ws.send(JSON.stringify(subscription));
        });
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        this.connect();
      }, 1000 * this.reconnectAttempts);
    }
  }

  subscribe(subscription) {
    this.subscriptions.add(subscription);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscription));
    }
  }

  unsubscribe(subscription) {
    this.subscriptions.delete(subscription);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...subscription, method: 'unsubscribe' }));
    }
  }

  handleMessage(data) {
    // Handle incoming WebSocket messages
    // Implement based on your specific needs
    console.log('WebSocket message:', data);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

// Export a singleton instance for convenience
export const wsInstance = new HyperliquidWebSocket();