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
    this.lastMessageTimes = new Map();
    this.messageThrottleMs = 8; // ~120fps max update rate for better responsiveness
    this.activeSubscriptions = new Set(); // Track active subscriptions
    
    // Market data cache for real-time updates
    this.marketDataCache = new Map();
    this.allMidsCache = new Map();
    this.assetContextCache = new Map(); // For oracle prices and funding
    this.universeData = null; // Meta data about tokens
    this.isInitialized = false;
    
    // User data cache for real-time updates
    this.userDataCache = new Map(); // Cache for webData2 user data
    this.userSubscriptions = new Set(); // Track user subscriptions
    this.userHistoricalOrdersCache = new Map(); // Cache for user historical orders
    this.userHistoricalOrdersSubscriptions = new Set(); // Track historical orders subscriptions
    
    // Wallet connection tracking
    this.currentWalletAddress = null; // Current connected wallet address
    this.zeroAddress = '0x0000000000000000000000000000000000000000'; // Zero address for public data
    this.isPublicDataSubscribed = false; // Track if we're subscribed to public data
    
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
    console.log(`✅ Subscribed to ${key}, total subscribers: ${this.subscribers.get(key).size}`);
    console.log(`✅ All active subscriptions:`, Array.from(this.subscribers.keys()));
  }

  unsubscribe(key, callback) {
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).delete(callback);
      if (this.subscribers.get(key).size === 0) {
        this.subscribers.delete(key);
        console.log(`🗑️ Removed subscription for ${key}`);
      } else {
        console.log(`🗑️ Unsubscribed from ${key}, remaining subscribers: ${this.subscribers.get(key).size}`);
      }
    }
    console.log(`🗑️ All active subscriptions after unsubscribe:`, Array.from(this.subscribers.keys()));
  }

  broadcast(key, data) {
    // Throttle messages per-key to prevent excessive updates
    const now = Date.now();
    if (!this.lastMessageTimes) {
      this.lastMessageTimes = new Map();
    }
    
    const lastTime = this.lastMessageTimes.get(key) || 0;
    if (now - lastTime < this.messageThrottleMs) {
      return;
    }
    this.lastMessageTimes.set(key, now);

    if (this.subscribers.has(key)) {
      const subscribers = this.subscribers.get(key);
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket callback:', error);
        }
      });
    } else {
    }
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.broadcast('connection', { connected: true });
      
      // Initialize with WebSocket requests instead of REST API
      this.initializeMarketData();
      
      // Subscribe to public data (zero address) initially
      this.subscribeToPublicData();
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
          return;
        }

        // Handle webData2 updates for user account data
        if (data.channel === 'webData2' && data.data) {
          this.handleWebData2Update(data.data);
          return;
        }

        // Handle userHistoricalOrders updates
        if (data.channel === 'userHistoricalOrders' && data.data) {
          this.handleUserHistoricalOrdersUpdate(data.data);
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
          
          // Broadcast to components that subscribe to specific symbols
          if (data.data.coin) {
            const broadcastKey = `assetCtx:${data.data.coin}`;
            this.broadcast(broadcastKey, data);
          } else {
          }
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
      this.isConnected = false;
      this.activeSubscriptions.clear(); // Clear active subscriptions on disconnect
      this.broadcast('connection', { connected: false });
      
      // Reset connection state
      this.ws = null;
      
      // Reset wallet tracking on disconnect
      this.currentWalletAddress = null;
      this.isPublicDataSubscribed = false;
      
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
    
    // Reset wallet tracking
    this.currentWalletAddress = null;
    this.isPublicDataSubscribed = false;
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
      } else {
        console.warn('Invalid metaAndAssetCtxs response structure:', response);
      }
    } else {
      console.log('Received non-metaAndAssetCtxs POST response:', response);
    }
  }

  // Process meta and asset contexts data
  processMetaAndAssetCtxs(universe, assetCtxs) {
    const processedTokens = universe.map((token, index) => {
      const assetCtx = assetCtxs[index];
      if (!assetCtx || !token) return null;
      
      const prevPrice = parseFloat(assetCtx.prevDayPx) || 0;
      const currentPrice = parseFloat(assetCtx.markPx) || 0;
      const change24h = currentPrice - prevPrice;
      
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

  // Process market data from webData2 (same structure as metaAndAssetCtxs)
  processWebData2MarketData(meta, assetCtxs) {
    if (!meta || !meta.universe || !assetCtxs) return;
    
    const universe = meta.universe;
    const processedTokens = universe.map((token, index) => {
      const assetCtx = assetCtxs[index];
      if (!assetCtx || !token) return null;
      
      const prevPrice = parseFloat(assetCtx.prevDayPx) || 0;
      const currentPrice = parseFloat(assetCtx.markPx) || 0;
      const change24h = currentPrice - prevPrice;
      
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
    
    // Update universe data for future use
    this.universeData = universe;
    this.isInitialized = true;
    
    // Broadcast the market data update
    this.broadcast('marketDataUpdate', {
      tokens: sortedTokens,
      timestamp: Date.now()
    });
    
    console.log('✓ Market data updated from webData2:', {
      tokenCount: sortedTokens.length,
      timestamp: new Date().toLocaleTimeString()
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

  // Subscribe to activeAssetCtx for a specific symbol
  subscribeToAssetCtx(symbol) {
    if (!this.isConnected) {
      console.log(`Cannot subscribe to activeAssetCtx for ${symbol}: WebSocket not connected`);
      return false;
    }
    
    const activeAssetCtxKey = `activeAssetCtx:${symbol}`;
    
    if (!this.activeSubscriptions.has(activeAssetCtxKey)) {
      // Use the correct format based on the working Node.js code
      const subscriptionMessage = {
        method: 'subscribe',
        subscription: { 
          type: 'activeAssetCtx', 
          coin: symbol,
          user: '0x0000000000000000000000000000000000000000'
        }
      };
      
      console.log(`🎯 Subscribing to activeAssetCtx for ${symbol}:`, JSON.stringify(subscriptionMessage, null, 2));
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.activeSubscriptions.add(activeAssetCtxKey);
        console.log(`✓ Subscribed to activeAssetCtx for ${symbol}`);
        return true;
      } else {
        console.log(`✗ Failed to subscribe to activeAssetCtx for ${symbol}`);
        return false;
      }
    } else {
      console.log(`Already subscribed to activeAssetCtx for ${symbol}`);
      return true;
    }
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
      const change24h = currentPrice - prevPrice;
      
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
      
      // console.log(`✓ Updated oracle price and funding for ${symbol}: Oracle=${updatedData.oraclePrice}, Funding=${updatedData.funding}`);
    }
  }

  // Subscribe to public data (zero address) for market data
  subscribeToPublicData() {
    if (!this.isConnected) {
      console.log('Cannot subscribe to public data: WebSocket not connected');
      return false;
    }
    
    if (!this.isPublicDataSubscribed) {
      const subscriptionMessage = {
        method: 'subscribe',
        subscription: { 
          type: 'webData2', 
          user: this.zeroAddress
        }
      };
      
      console.log(`🎯 Subscribing to public data (zero address):`, JSON.stringify(subscriptionMessage, null, 2));
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.isPublicDataSubscribed = true;
        this.userSubscriptions.add(`webData2:${this.zeroAddress}`);
        console.log(`✓ Subscribed to public data (zero address)`);
        return true;
      } else {
        console.log(`✗ Failed to subscribe to public data (zero address)`);
        return false;
      }
    } else {
      console.log(`Already subscribed to public data (zero address)`);
      return true;
    }
  }

  // Unsubscribe from public data (zero address)
  unsubscribeFromPublicData() {
    if (!this.isConnected) return false;
    
    if (this.isPublicDataSubscribed) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { 
          type: 'webData2', 
          user: this.zeroAddress
        }
      });
      
      if (success) {
        this.isPublicDataSubscribed = false;
        this.userSubscriptions.delete(`webData2:${this.zeroAddress}`);
        console.log(`✓ Unsubscribed from public data (zero address)`);
        return true;
      }
    }
    
    return false;
  }

  // Subscribe to webData2 for user account data (positions, balances, orders)
  subscribeToUserData(userAddress) {
    if (!this.isConnected) {
      console.log(`Cannot subscribe to webData2 for ${userAddress}: WebSocket not connected`);
      return false;
    }
    
    const userDataKey = `webData2:${userAddress}`;
    
    if (!this.userSubscriptions.has(userDataKey)) {
      const subscriptionMessage = {
        method: 'subscribe',
        subscription: { 
          type: 'webData2', 
          user: userAddress
        }
      };
      
      console.log(`🎯 Subscribing to webData2 for user ${userAddress}:`, JSON.stringify(subscriptionMessage, null, 2));
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.userSubscriptions.add(userDataKey);
        console.log(`✓ Subscribed to webData2 for user ${userAddress}`);
        return true;
      } else {
        console.log(`✗ Failed to subscribe to webData2 for user ${userAddress}`);
        return false;
      }
    } else {
      console.log(`Already subscribed to webData2 for user ${userAddress}`);
      return true;
    }
  }

  // Unsubscribe from webData2 for a specific user
  unsubscribeFromUserData(userAddress) {
    if (!this.isConnected) return false;
    
    const userDataKey = `webData2:${userAddress}`;
    
    if (this.userSubscriptions.has(userDataKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { 
          type: 'webData2', 
          user: userAddress
        }
      });
      
      if (success) {
        this.userSubscriptions.delete(userDataKey);
        console.log(`✓ Unsubscribed from webData2 for user ${userAddress}`);
        return true;
      }
    }
    
    return false;
  }

  // Update wallet address and manage subscriptions
  updateWalletAddress(walletAddress) {
    console.log(`🔄 Updating wallet address: ${this.currentWalletAddress} -> ${walletAddress}`);
    
    // If wallet is being disconnected (null or undefined)
    if (!walletAddress) {
      if (this.currentWalletAddress) {
        // Unsubscribe from user data
        this.unsubscribeFromUserData(this.currentWalletAddress);
        this.unsubscribeFromUserHistoricalOrders(this.currentWalletAddress);
        
        // Subscribe back to public data if not already subscribed
        if (!this.isPublicDataSubscribed) {
          this.subscribeToPublicData();
        }
        
        this.currentWalletAddress = null;
        console.log('✓ Wallet disconnected, switched back to public data');
      }
      return;
    }
    
    // If wallet is being connected or changed
    if (this.currentWalletAddress !== walletAddress) {
      // If we had a previous wallet, unsubscribe from it
      if (this.currentWalletAddress) {
        this.unsubscribeFromUserData(this.currentWalletAddress);
        this.unsubscribeFromUserHistoricalOrders(this.currentWalletAddress);
      }
      
      // Unsubscribe from public data since we now have user data
      if (this.isPublicDataSubscribed) {
        this.unsubscribeFromPublicData();
      }
      
      // Subscribe to new wallet address
      this.subscribeToUserData(walletAddress);
      this.subscribeToUserHistoricalOrders(walletAddress);
      
      this.currentWalletAddress = walletAddress;
      console.log(`✓ Wallet connected: ${walletAddress}, switched from public data to user data`);
    }
  }

  // Get current wallet address
  getCurrentWalletAddress() {
    return this.currentWalletAddress;
  }

  // Check if currently subscribed to public data
  isSubscribedToPublicData() {
    return this.isPublicDataSubscribed;
  }

  // Subscribe to userHistoricalOrders for a specific user
  subscribeToUserHistoricalOrders(userAddress) {
    if (!this.isConnected) {
      console.log(`Cannot subscribe to userHistoricalOrders for ${userAddress}: WebSocket not connected`);
      return false;
    }
    
    const historicalOrdersKey = `userHistoricalOrders:${userAddress}`;
    
    if (!this.userHistoricalOrdersSubscriptions.has(historicalOrdersKey)) {
      const subscriptionMessage = {
        method: 'subscribe',
        subscription: { 
          type: 'userHistoricalOrders', 
          user: userAddress
        }
      };
      
      console.log(`🎯 Subscribing to userHistoricalOrders for user ${userAddress}:`, JSON.stringify(subscriptionMessage, null, 2));
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.userHistoricalOrdersSubscriptions.add(historicalOrdersKey);
        console.log(`✓ Subscribed to userHistoricalOrders for user ${userAddress}`);
        return true;
      } else {
        console.log(`✗ Failed to subscribe to userHistoricalOrders for user ${userAddress}`);
        return false;
      }
    } else {
      console.log(`Already subscribed to userHistoricalOrders for user ${userAddress}`);
      return true;
    }
  }

  // Unsubscribe from userHistoricalOrders for a specific user
  unsubscribeFromUserHistoricalOrders(userAddress) {
    if (!this.isConnected) return false;
    
    const historicalOrdersKey = `userHistoricalOrders:${userAddress}`;
    
    if (this.userHistoricalOrdersSubscriptions.has(historicalOrdersKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { 
          type: 'userHistoricalOrders', 
          user: userAddress
        }
      });
      
      if (success) {
        this.userHistoricalOrdersSubscriptions.delete(historicalOrdersKey);
        console.log(`✓ Unsubscribed from userHistoricalOrders for user ${userAddress}`);
        return true;
      }
    }
    
    return false;
  }

  // Handle webData2 updates for user account data
  handleWebData2Update(webData2Data) {
    if (!webData2Data || !webData2Data.user) return;
    
    const userAddress = webData2Data.user;
    const userDataKey = `webData2:${userAddress}`;
    
    // Cache the user data
    this.userDataCache.set(userAddress, {
      ...webData2Data,
      lastUpdated: Date.now()
    });
    
    // Process market data from webData2 if available
    if (webData2Data.meta && webData2Data.assetCtxs) {
      this.processWebData2MarketData(webData2Data.meta, webData2Data.assetCtxs);
    }
    
    // Broadcast the user data update
    this.broadcast(userDataKey, webData2Data);
    
    // Also broadcast to general webData2 subscribers
    this.broadcast('webData2', webData2Data);
    
    console.log(`✓ Updated webData2 data for user ${userAddress}:`, {
      positions: webData2Data.clearinghouseState?.assetPositions?.length || 0,
      orders: webData2Data.openOrders?.length || 0,
      accountValue: webData2Data.clearinghouseState?.marginSummary?.accountValue,
      timestamp: new Date(webData2Data.serverTime).toLocaleTimeString()
    });
  }

  // Handle userHistoricalOrders updates
  handleUserHistoricalOrdersUpdate(historicalOrdersData) {
    if (!historicalOrdersData || !historicalOrdersData.user) return;
    
    const userAddress = historicalOrdersData.user;
    const historicalOrdersKey = `userHistoricalOrders:${userAddress}`;
    
    // Cache the historical orders data
    this.userHistoricalOrdersCache.set(userAddress, {
      ...historicalOrdersData,
      lastUpdated: Date.now()
    });
    
    // Broadcast the historical orders update
    this.broadcast(historicalOrdersKey, historicalOrdersData);
    
    // Also broadcast to general userHistoricalOrders subscribers
    this.broadcast('userHistoricalOrders', historicalOrdersData);
    
    console.log(`✓ Updated userHistoricalOrders data for user ${userAddress}:`, {
      orderHistoryCount: historicalOrdersData.orderHistory?.length || 0,
      isSnapshot: historicalOrdersData.isSnapshot,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  // Get cached user data for a specific address
  getCachedUserData(userAddress) {
    return this.userDataCache.get(userAddress);
  }

  // Get all cached user data
  getAllCachedUserData() {
    return Array.from(this.userDataCache.values());
  }

  // Get cached historical orders data for a specific address
  getCachedHistoricalOrders(userAddress) {
    return this.userHistoricalOrdersCache.get(userAddress);
  }

  // Get all cached historical orders data
  getAllCachedHistoricalOrders() {
    return Array.from(this.userHistoricalOrdersCache.values());
  }

  subscribeToSymbol(symbol, tickSizeParams = null) {
    if (!this.isConnected) return false;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    let subscribed = false;
    
    // Always unsubscribe from existing l2Book subscription first to avoid duplicates
    if (this.activeSubscriptions.has(l2BookKey)) {
      // Internal unsubscribe without calling the public method to avoid recursion
      const subscriptionParams = { type: 'l2Book', coin: symbol };
      this.send({
        method: 'unsubscribe',
        subscription: subscriptionParams
      });
      this.activeSubscriptions.delete(l2BookKey);
      console.log(`✓ Internal unsubscribed from l2Book for ${symbol}`);
    }
    
    // Create new subscription
    const subscriptionParams = { type: 'l2Book', coin: symbol };
    
    // Add tick size parameters if provided
    if (tickSizeParams) {
      if (tickSizeParams.nSigFigs !== undefined) {
        subscriptionParams.nSigFigs = tickSizeParams.nSigFigs;
      }
      if (tickSizeParams.mantissa !== undefined) {
        subscriptionParams.mantissa = tickSizeParams.mantissa;
      }
    }
    
    const success = this.send({
      method: 'subscribe',
      subscription: subscriptionParams
    });
    
    if (success) {
      this.activeSubscriptions.add(l2BookKey);
      console.log(`✓ Subscribed to l2Book for ${symbol} with params:`, subscriptionParams);
      subscribed = true;
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

  unsubscribeFromSymbol(symbol, tickSizeParams = null) {
    if (!this.isConnected) return false;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    let unsubscribed = false;
    
    // Only unsubscribe if currently subscribed
    if (this.activeSubscriptions.has(l2BookKey)) {
      const subscriptionParams = { type: 'l2Book', coin: symbol };
      
      // Add tick size parameters if provided (must match subscription)
      if (tickSizeParams) {
        if (tickSizeParams.nSigFigs !== undefined) {
          subscriptionParams.nSigFigs = tickSizeParams.nSigFigs;
        }
        if (tickSizeParams.mantissa !== undefined) {
          subscriptionParams.mantissa = tickSizeParams.mantissa;
        }
      }
      
      const success = this.send({
        method: 'unsubscribe',
        subscription: subscriptionParams
      });
      
      if (success) {
        this.activeSubscriptions.delete(l2BookKey);
        console.log(`✓ Unsubscribed from l2Book for ${symbol} with params:`, subscriptionParams);
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
      userSubscriptions: Array.from(this.userSubscriptions),
      userHistoricalOrdersSubscriptions: Array.from(this.userHistoricalOrdersSubscriptions),
      cachedTokens: this.marketDataCache.size,
      cachedUsers: this.userDataCache.size,
      cachedHistoricalOrders: this.userHistoricalOrdersCache.size,
      currentWalletAddress: this.currentWalletAddress,
      isPublicDataSubscribed: this.isPublicDataSubscribed
    };
  }

  // Get subscriber count for a specific key
  getSubscriberCount(key) {
    return this.subscribers.has(key) ? this.subscribers.get(key).size : 0;
  }

  // Health check method
  isHealthy() {
    // Basic connection health - WebSocket is connected and ready
    const isConnected = this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
    
    // If not connected, definitely unhealthy
    if (!isConnected) {
      return false;
    }
    
    // If connected but not initialized, still consider healthy for basic operations
    // The initialization is mainly for market data, but the connection itself is working
    return true;
  }

  // Check if the service is fully initialized with market data
  isFullyInitialized() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN && this.isInitialized;
  }

  // Ping method to check connection health
  ping() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ method: 'ping' }));
        return true;
      } catch (error) {
        console.error('Ping failed:', error);
        return false;
      }
    }
    return false;
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