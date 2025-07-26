// Enhanced WebSocket service that uses ONLY WebSocket subscriptions for all data
// No REST API calls - everything is real-time via WebSocket

class WebSocketService {
  static instance = null;
  
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.subscribers = new Map();
    this.messageQueue = [];
    this.lastMessageTime = 0;
    this.messageThrottleMs = 16; // ~60fps max update rate
    this.activeSubscriptions = new Set(); // Track active subscriptions
    
    // Market data cache for real-time updates
    this.marketDataCache = new Map();
    this.allMidsCache = new Map();
    this.assetContextCache = new Map(); // For oracle prices and funding
    this.universeData = null; // Meta data about tokens
    this.isInitialized = false;
    
    // WebSocket POST request counter for unique IDs
    this.requestId = 1;
  }

  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);
  }

  unsubscribe(key, callback) {
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).delete(callback);
      if (this.subscribers.get(key).size === 0) {
        this.subscribers.delete(key);
      }
    }
  }

  broadcast(key, data) {
    // Throttle messages to prevent excessive updates
    const now = Date.now();
    if (now - this.lastMessageTime < this.messageThrottleMs) {
      return;
    }
    this.lastMessageTime = now;

    if (this.subscribers.has(key)) {
      this.subscribers.get(key).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket callback:', error);
        }
      });
    }
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('Connecting to Hyperliquid WebSocket...');
    this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

    this.ws.onopen = () => {
      console.log('WebSocket connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.broadcast('connection', { connected: true });
      
      // Initialize with WebSocket requests instead of REST API
      this.initializeMarketData();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle WebSocket POST responses (from our info requests)
        if (data.channel === 'post' && data.data) {
          this.handlePostResponse(data);
          return;
        }
        
        if (data.channel === 'subscriptionResponse') {
          console.log('Subscription confirmed:', data.data);
          return;
        }

        // Handle allMids updates for real-time price data
        if (data.channel === 'allMids' && data.data && data.data.mids) {
          this.handleAllMidsUpdate(data.data);
          return;
        }

        // Handle activeAssetCtx updates for oracle prices and funding
        if (data.channel === 'activeAssetCtx' && data.data) {
          this.handleActiveAssetCtxUpdate(data.data);
          return;
        }

        // Handle different channel types and route messages properly
        if (data.channel === 'l2Book' && data.data && data.data.coin) {
          const coin = data.data.coin;
          this.broadcast(`l2Book:${coin}`, data);
        } else if (data.channel === 'trades' && data.data && Array.isArray(data.data) && data.data.length > 0) {
          const coin = data.data[0].coin; // Get coin from first trade
          this.broadcast(`trades:${coin}`, data);
        } else {
          // Fallback for other message types
          this.broadcast(data.channel, data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.isConnected = false;
      this.activeSubscriptions.clear(); // Clear active subscriptions on disconnect
      this.broadcast('connection', { connected: false });
      
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('Max reconnection attempts reached');
        this.broadcast('connectionError', { error: 'Max reconnection attempts reached' });
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.broadcast('error', error);
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.isConnected = false;
    this.activeSubscriptions.clear();
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn('WebSocket not connected, message queued:', message);
    return false;
  }

  // Send WebSocket POST request (replaces REST API calls)
  sendPost(payload) {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot send POST request');
      return false;
    }

    const requestId = this.requestId++;
    const message = {
      method: 'post',
      id: requestId,
      request: payload
    };

    return this.send(message);
  }

  // Initialize market data using WebSocket POST requests instead of REST API
  async initializeMarketData() {
    console.log('Initializing market data via WebSocket...');
    
    // First, get the meta and asset contexts via WebSocket POST
    this.sendPost({ type: 'metaAndAssetCtxs' });
    
    // Subscribe to real-time updates
    this.subscribeToAllMids();
    this.subscribeToAllActiveAssetCtx();
  }

  // Handle WebSocket POST responses
  handlePostResponse(data) {
    const response = data.data;
    
    if (!response) return;
    
    // Handle metaAndAssetCtxs response
    if (Array.isArray(response) && response.length >= 2) {
      const universe = response[0].universe;
      const assetCtxs = response[1];
      
      if (universe && assetCtxs) {
        this.universeData = universe;
        this.processMetaAndAssetCtxs(universe, assetCtxs);
        this.isInitialized = true;
        console.log('✓ Market data initialized via WebSocket');
      }
    }
  }

  // Process meta and asset contexts data
  processMetaAndAssetCtxs(universe, assetCtxs) {
    const processedTokens = universe.map((token, index) => {
      const assetCtx = assetCtxs[index];
      if (!assetCtx || !token) return null;
      
      const prevPrice = parseFloat(assetCtx.prevDayPx) || 0;
      const currentPrice = parseFloat(assetCtx.markPx) || 0;
      const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
      
      const tokenData = {
        symbol: token.name,
        maxLeverage: token.maxLeverage || 1,
        szDecimals: token.szDecimals || 4,
        onlyIsolated: token.onlyIsolated || false,
        price: currentPrice,
        oraclePrice: parseFloat(assetCtx.oraclePx) || currentPrice,
        change24h: change24h,
        volume24h: parseFloat(assetCtx.dayNtlVlm) || 0,
        openInterest: parseFloat(assetCtx.openInterest) || 0,
        funding: parseFloat(assetCtx.funding) || 0,
        prevDayPx: prevPrice,
        premium: parseFloat(assetCtx.premium) || 0,
        midPx: parseFloat(assetCtx.midPx) || currentPrice,
        lastUpdated: Date.now(),
        fullAssetCtx: assetCtx
      };

      // Cache the token data
      this.marketDataCache.set(token.name, tokenData);
      this.assetContextCache.set(token.name, assetCtx);
      
      return tokenData;
    }).filter(Boolean);
    
    const sortedTokens = processedTokens.sort((a, b) => b.volume24h - a.volume24h);
    
    // Broadcast the market data update
    this.broadcast('marketDataUpdate', {
      tokens: sortedTokens,
      timestamp: Date.now()
    });
  }

  // Subscribe to allMids for real-time price updates
  subscribeToAllMids() {
    if (!this.isConnected) return;
    
    const allMidsKey = 'allMids';
    
    if (!this.activeSubscriptions.has(allMidsKey)) {
      const success = this.send({
        method: 'subscribe',
        subscription: { type: 'allMids' }
      });
      
      if (success) {
        this.activeSubscriptions.add(allMidsKey);
        console.log('✓ Subscribed to allMids for real-time price updates');
      }
    }
  }

  // Subscribe to activeAssetCtx for all tokens to get oracle prices and funding updates
  subscribeToAllActiveAssetCtx() {
    if (!this.isConnected || !this.universeData) return;
    
    // Subscribe to activeAssetCtx for each token
    this.universeData.forEach(token => {
      const activeAssetCtxKey = `activeAssetCtx:${token.name}`;
      
      if (!this.activeSubscriptions.has(activeAssetCtxKey)) {
        const success = this.send({
          method: 'subscribe',
          subscription: { type: 'activeAssetCtx', coin: token.name }
        });
        
        if (success) {
          this.activeSubscriptions.add(activeAssetCtxKey);
          console.log(`✓ Subscribed to activeAssetCtx for ${token.name}`);
        }
      }
    });
  }

  // Handle allMids updates to update cached market data
  handleAllMidsUpdate(allMidsData) {
    if (!allMidsData.mids) return;

    const updateCount = Object.keys(allMidsData.mids).length;
    
    // Update market data cache with new prices
    Object.entries(allMidsData.mids).forEach(([symbol, midPrice]) => {
      const price = parseFloat(midPrice);
      if (isNaN(price)) return;

      // Store in allMids cache
      this.allMidsCache.set(symbol, price);

      const cachedData = this.marketDataCache.get(symbol);
      if (cachedData) {
        // Calculate 24h change if we have previous price data
        const prevPrice = cachedData.prevDayPx || cachedData.price;
        const change24h = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
        
        const updatedData = {
          ...cachedData,
          price: price,
          change24h: change24h,
          lastUpdated: Date.now()
        };
        
        this.marketDataCache.set(symbol, updatedData);
        
        // Broadcast updated market data for this symbol
        this.broadcast(`marketData:${symbol}`, updatedData);
      }
    });

    // Broadcast the allMids update for components that want raw data
    this.broadcast('allMids', allMidsData);
  }

  // Handle activeAssetCtx updates for oracle prices and funding
  handleActiveAssetCtxUpdate(assetCtxData) {
    if (!assetCtxData.coin) return;
    
    const symbol = assetCtxData.coin;
    
    // Update asset context cache
    this.assetContextCache.set(symbol, assetCtxData);
    
    const cachedData = this.marketDataCache.get(symbol);
    if (cachedData) {
      const currentPrice = this.allMidsCache.get(symbol) || cachedData.price;
      const prevPrice = parseFloat(assetCtxData.prevDayPx) || cachedData.prevDayPx;
      const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
      
      const updatedData = {
        ...cachedData,
        oraclePrice: parseFloat(assetCtxData.oraclePx) || cachedData.oraclePrice,
        funding: parseFloat(assetCtxData.funding) || cachedData.funding,
        volume24h: parseFloat(assetCtxData.dayNtlVlm) || cachedData.volume24h,
        openInterest: parseFloat(assetCtxData.openInterest) || cachedData.openInterest,
        premium: parseFloat(assetCtxData.premium) || cachedData.premium,
        prevDayPx: prevPrice,
        change24h: change24h,
        lastUpdated: Date.now(),
        fullAssetCtx: assetCtxData
      };
      
      this.marketDataCache.set(symbol, updatedData);
      
      // Broadcast updated market data for this symbol
      this.broadcast(`marketData:${symbol}`, updatedData);
      
      console.log(`✓ Updated oracle price and funding for ${symbol}: Oracle=${updatedData.oraclePrice}, Funding=${updatedData.funding}`);
    }
  }

  subscribeToSymbol(symbol) {
    if (!this.isConnected) return false;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    let subscribed = false;
    
    // Only subscribe if not already subscribed
    if (!this.activeSubscriptions.has(l2BookKey)) {
      const success = this.send({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: symbol }
      });
      
      if (success) {
        this.activeSubscriptions.add(l2BookKey);
        console.log(`✓ Subscribed to l2Book for ${symbol}`);
        subscribed = true;
      }
    }

    if (!this.activeSubscriptions.has(tradesKey)) {
      const success = this.send({
        method: 'subscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      
      if (success) {
        this.activeSubscriptions.add(tradesKey);
        console.log(`✓ Subscribed to trades for ${symbol}`);
        subscribed = true;
      }
    }
    
    return subscribed;
  }

  unsubscribeFromSymbol(symbol) {
    if (!this.isConnected) return false;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    let unsubscribed = false;
    
    // Only unsubscribe if currently subscribed
    if (this.activeSubscriptions.has(l2BookKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { type: 'l2Book', coin: symbol }
      });
      
      if (success) {
        this.activeSubscriptions.delete(l2BookKey);
        console.log(`✓ Unsubscribed from l2Book for ${symbol}`);
        unsubscribed = true;
      }
    }

    if (this.activeSubscriptions.has(tradesKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      
      if (success) {
        this.activeSubscriptions.delete(tradesKey);
        console.log(`✓ Unsubscribed from trades for ${symbol}`);
        unsubscribed = true;
      }
    }
    
    return unsubscribed;
  }

  // Get cached market data for a symbol
  getCachedMarketData(symbol) {
    return this.marketDataCache.get(symbol);
  }

  // Get all cached market data
  getAllCachedMarketData() {
    return Array.from(this.marketDataCache.values());
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: Array.from(this.activeSubscriptions),
      cachedTokens: this.marketDataCache.size
    };
  }

  // Health check method
  isHealthy() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN && this.isInitialized;
  }

  // Wait for initialization
  async waitForInitialization(timeout = 10000) {
    const startTime = Date.now();
    
    while (!this.isInitialized && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!this.isInitialized) {
      throw new Error('WebSocket service initialization timeout');
    }
    
    return true;
  }

  // Public method to get market data (replaces the old fetchMarketData)
  async getMarketData() {
    if (!this.isInitialized) {
      await this.waitForInitialization();
    }
    
    return this.getAllCachedMarketData().sort((a, b) => b.volume24h - a.volume24h);
  }
}

export default WebSocketService;