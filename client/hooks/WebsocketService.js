// Enhanced WebSocket service that uses ONLY WebSocket subscriptions for all data
// No REST API calls - everything is real-time via WebSocket

class WebSocketService {
  static instance = null;
  static isConnecting = false; // Global flag to prevent multiple connection attempts
  
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.subscribers = new Map();
    this.messageQueue = [];
    this.lastMessageTimes = new Map();
    this.messageThrottleMs = 8; // ~10fps max update rate for better performance balance
    this.activeSubscriptions = new Set(); // Track active subscriptions
    
    // Essential data for WebSocket functionality
    this.universeData = null; // Meta data about tokens
    this.isInitialized = false;
    
    // User subscriptions tracking (still needed for subscription management)
    this.userSubscriptions = new Set(); // Track user subscriptions
    this.userHistoricalOrdersSubscriptions = new Set(); // Track historical orders subscriptions
    
    // Subscription state tracking to prevent rapid churn
    this.pendingSubscriptions = new Map(); // Track pending subscriptions to avoid duplicates
    this.subscriptionDebounceMs = 100; // Debounce rapid subscription changes
    
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
  }

  unsubscribe(key, callback) {
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).delete(callback);
      if (this.subscribers.get(key).size === 0) {
        this.subscribers.delete(key);
      } else {
      }
    }
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

  connect(initialWalletAddress = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    
    // Global flag to prevent multiple connection attempts from different components
    if (WebSocketService.isConnecting) {
      return;
    }
    
    WebSocketService.isConnecting = true;
    this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      WebSocketService.isConnecting = false; // Clear the connecting flag
      this.broadcast('connection', { connected: true });
      
      // Initialize with WebSocket requests instead of REST API
      this.initializeMarketData();
      
      // Check if we have an initial wallet address, otherwise subscribe to public data
      if (initialWalletAddress) {
        this.updateWalletAddress(initialWalletAddress);
      } else {
        this.subscribeToPublicData();
      }
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
        } else if (data.channel === 'candle' && data.data) {
          // Handle candle updates for TradingView chart
          this.handleCandleUpdate(data);
          return;
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
      WebSocketService.isConnecting = false; // Clear the connecting flag on close
      this.activeSubscriptions.clear(); // Clear active subscriptions on disconnect
      this.broadcast('connection', { connected: false });
      
      // Reset connection state
      this.ws = null;
      
      // Reset wallet tracking on disconnect
      this.currentWalletAddress = null;
      this.isPublicDataSubscribed = false;
      
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect(this.currentWalletAddress);
        }, delay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.broadcast('connectionError', { error: 'Max reconnection attempts reached' });
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      WebSocketService.isConnecting = false; // Clear the connecting flag on error
      this.broadcast('error', error);
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Properly unsubscribe from all active subscriptions before disconnecting
    if (this.isConnected) {
      this.unsubscribeFromAllSymbols();
      
      // Unsubscribe from asset context subscriptions
      const assetCtxSubscriptions = Array.from(this.activeSubscriptions).filter(key => 
        key.startsWith('activeAssetCtx:')
      );
      
      for (const subscriptionKey of assetCtxSubscriptions) {
        const symbol = subscriptionKey.replace('activeAssetCtx:', '');
        this.unsubscribeFromAssetCtx(symbol);
      }
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.isConnected = false;
    WebSocketService.isConnecting = false; // Clear the connecting flag
    this.activeSubscriptions.clear();
    
    // Clear pending subscriptions
    this.pendingSubscriptions.clear();
    
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
    
    // First, get the meta and asset contexts via WebSocket POST
    this.sendPost({ type: 'metaAndAssetCtxs' });
    
    // Subscribe to real-time updates
    this.subscribeToAllMids();
    // Note: activeAssetCtx subscriptions are now managed per selected token
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
        szDecimals: token.szDecimals !== undefined ? token.szDecimals : null, // Use actual value from HyperLiquid, no fallback
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
      
      return tokenData;
    }).filter(Boolean);
    
    const sortedTokens = processedTokens.sort((a, b) => b.volume24h - a.volume24h);
    
    // Broadcast the market data update directly - no caching needed
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
        szDecimals: token.szDecimals !== undefined ? token.szDecimals : null, // Use actual value from HyperLiquid, no fallback
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
      
      return tokenData;
    }).filter(Boolean);
    
    const sortedTokens = processedTokens.sort((a, b) => b.volume24h - a.volume24h);
    
    // Update universe data for future use
    this.universeData = universe;
    this.isInitialized = true;
    
    // Broadcast the market data update directly - no caching needed
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
        }
      }
    });
  }

  // Subscribe to activeAssetCtx for a specific symbol
  subscribeToAssetCtx(symbol) {
    if (!this.isConnected) {
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
      
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.activeSubscriptions.add(activeAssetCtxKey);
        return true;
      } else {
        return false;
      }
    } else {
      return true;
    }
  }

  // Unsubscribe from activeAssetCtx for a specific symbol
  unsubscribeFromAssetCtx(symbol) {
    if (!this.isConnected) return false;
    
    const activeAssetCtxKey = `activeAssetCtx:${symbol}`;
    
    if (this.activeSubscriptions.has(activeAssetCtxKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { 
          type: 'activeAssetCtx', 
          coin: symbol,
          // user: '0x0000000000000000000000000000000000000000'
        }
      });
      
      if (success) {
        this.activeSubscriptions.delete(activeAssetCtxKey);
        return true;
      } else {
        return false;
      }
    } else {
      return true;
    }
  }

  // Handle allMids updates - simplified to just broadcast the data
  handleAllMidsUpdate(allMidsData) {
    if (!allMidsData.mids) return;

    // Broadcast the allMids update directly to components
    this.broadcast('allMids', allMidsData);
  }

  // Handle activeAssetCtx updates - simplified to just broadcast the data
  handleActiveAssetCtxUpdate(assetCtxData) {
    if (!assetCtxData.coin) return;
    
    // Broadcast the asset context update directly to components
    this.broadcast(`assetCtx:${assetCtxData.coin}`, { data: assetCtxData });
  }

  // Subscribe to public data (zero address) for market data
  subscribeToPublicData() {
    if (!this.isConnected) {
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
      
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.isPublicDataSubscribed = true;
        this.userSubscriptions.add(`webData2:${this.zeroAddress}`);
        return true;
      } else {
        return false;
      }
    } else {
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
        return true;
      }
    }
    
    return false;
  }

  // Subscribe to webData2 for user account data (positions, balances, orders)
  subscribeToUserData(userAddress) {
    if (!this.isConnected) {
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
      
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.userSubscriptions.add(userDataKey);
        return true;
      } else {
        return false;
      }
    } else {
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
        return true;
      }
    }
    
    return false;
  }

  // Update wallet address and manage subscriptions
  updateWalletAddress(walletAddress) {
    
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
      
      const success = this.send(subscriptionMessage);
      
      if (success) {
        this.userHistoricalOrdersSubscriptions.add(historicalOrdersKey);
        return true;
      } else {
        return false;
      }
    } else {
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
    
    // Process market data from webData2 if available
    if (webData2Data.meta && webData2Data.assetCtxs) {
      this.processWebData2MarketData(webData2Data.meta, webData2Data.assetCtxs);
    }
    
    // Broadcast the user data update directly - no caching needed
    this.broadcast(userDataKey, webData2Data);
    
    // Also broadcast to general webData2 subscribers
    this.broadcast('webData2', webData2Data);
  }

  // Handle userHistoricalOrders updates
  handleUserHistoricalOrdersUpdate(historicalOrdersData) {
    if (!historicalOrdersData || !historicalOrdersData.user) return;
    
    const userAddress = historicalOrdersData.user;
    const historicalOrdersKey = `userHistoricalOrders:${userAddress}`;
    
    // Broadcast the historical orders update directly - no caching needed
    this.broadcast(historicalOrdersKey, historicalOrdersData);
    
    // Also broadcast to general userHistoricalOrders subscribers
    this.broadcast('userHistoricalOrders', historicalOrdersData);
  }

  // Removed unused cache getter methods - data is now broadcast directly to components

  subscribeToSymbol(symbol, tickSizeParams = null) {
    if (!this.isConnected) return false;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    // Create a unique key for this subscription request
    const subscriptionRequestKey = `${symbol}:${JSON.stringify(tickSizeParams)}`;
    
    // Check if we have a pending subscription for this exact request
    if (this.pendingSubscriptions.has(subscriptionRequestKey)) {
      return false;
    }
    
    // Mark this subscription as pending
    this.pendingSubscriptions.set(subscriptionRequestKey, Date.now());
    
    // Clear the pending status after debounce period
    setTimeout(() => {
      this.pendingSubscriptions.delete(subscriptionRequestKey);
    }, this.subscriptionDebounceMs);
    
    let subscribed = false;
    
    // Store tick size params with the subscription key for proper cleanup
    const l2BookKeyWithParams = tickSizeParams 
      ? `${l2BookKey}:${JSON.stringify(tickSizeParams)}`
      : l2BookKey;
    
    // Check if we already have this exact subscription
    if (this.activeSubscriptions.has(l2BookKeyWithParams)) {
      return true;
    }
    
    // Always unsubscribe from existing l2Book subscription first to avoid duplicates
    // Check for any existing l2Book subscription for this symbol (regardless of tick size)
    const existingL2BookSubs = Array.from(this.activeSubscriptions).filter(key => 
      key.startsWith(`l2Book:${symbol}`)
    );
    
    for (const existingKey of existingL2BookSubs) {
      // Extract tick size params from existing subscription if any
      const existingTickSizeParams = existingKey.includes(':') && existingKey.split(':').length > 2
        ? JSON.parse(existingKey.split(':').slice(2).join(':'))
        : null;
      
      const subscriptionParams = { type: 'l2Book', coin: symbol };
      if (existingTickSizeParams) {
        if (existingTickSizeParams.nSigFigs !== undefined) {
          subscriptionParams.nSigFigs = existingTickSizeParams.nSigFigs;
        }
        if (existingTickSizeParams.mantissa !== undefined) {
          subscriptionParams.mantissa = existingTickSizeParams.mantissa;
        }
      }
      
      this.send({
        method: 'unsubscribe',
        subscription: subscriptionParams
      });
      this.activeSubscriptions.delete(existingKey);
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
    
    const l2BookSuccess = this.send({
      method: 'subscribe',
      subscription: subscriptionParams
    });
    
    if (l2BookSuccess) {
      this.activeSubscriptions.add(l2BookKeyWithParams);
      subscribed = true;
    }

    // Subscribe to trades if not already subscribed
    if (!this.activeSubscriptions.has(tradesKey)) {
      const tradesSuccess = this.send({
        method: 'subscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      
      if (tradesSuccess) {
        this.activeSubscriptions.add(tradesKey);
        subscribed = true;
      }
    }
    
    return subscribed;
  }

  unsubscribeFromSymbol(symbol, tickSizeParams = null) {
    if (!this.isConnected) return false;
    
    const tradesKey = `trades:${symbol}`;
    let unsubscribed = false;
    
    // Find and unsubscribe from all l2Book subscriptions for this symbol
    const existingL2BookSubs = Array.from(this.activeSubscriptions).filter(key => 
      key.startsWith(`l2Book:${symbol}`)
    );
    
    for (const existingKey of existingL2BookSubs) {
      // Extract tick size params from existing subscription if any
      const existingTickSizeParams = existingKey.includes(':') && existingKey.split(':').length > 2
        ? JSON.parse(existingKey.split(':').slice(2).join(':'))
        : null;
      
      const subscriptionParams = { type: 'l2Book', coin: symbol };
      if (existingTickSizeParams) {
        if (existingTickSizeParams.nSigFigs !== undefined) {
          subscriptionParams.nSigFigs = existingTickSizeParams.nSigFigs;
        }
        if (existingTickSizeParams.mantissa !== undefined) {
          subscriptionParams.mantissa = existingTickSizeParams.mantissa;
        }
      }
      
      const success = this.send({
        method: 'unsubscribe',
        subscription: subscriptionParams
      });
      
      if (success) {
        this.activeSubscriptions.delete(existingKey);
        unsubscribed = true;
      }
    }

    // Unsubscribe from trades
    if (this.activeSubscriptions.has(tradesKey)) {
      const success = this.send({
        method: 'unsubscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      
      if (success) {
        this.activeSubscriptions.delete(tradesKey);
        unsubscribed = true;
      }
    }
    
    return unsubscribed;
  }

  // Bulk subscription management methods for better cleanup
  
  // Unsubscribe from all symbol-related subscriptions
  unsubscribeFromAllSymbols() {
    if (!this.isConnected) return false;
    
    let unsubscribed = false;
    const symbolSubscriptions = Array.from(this.activeSubscriptions).filter(key => 
      key.startsWith('l2Book:') || key.startsWith('trades:')
    );
    
    for (const subscriptionKey of symbolSubscriptions) {
      const [type, symbol] = subscriptionKey.split(':');
      
      if (type === 'l2Book') {
        // Handle l2Book subscriptions with potential tick size params
        const existingTickSizeParams = subscriptionKey.includes(':') && subscriptionKey.split(':').length > 2
          ? JSON.parse(subscriptionKey.split(':').slice(2).join(':'))
          : null;
        
        const subscriptionParams = { type: 'l2Book', coin: symbol };
        if (existingTickSizeParams) {
          if (existingTickSizeParams.nSigFigs !== undefined) {
            subscriptionParams.nSigFigs = existingTickSizeParams.nSigFigs;
          }
          if (existingTickSizeParams.mantissa !== undefined) {
            subscriptionParams.mantissa = existingTickSizeParams.mantissa;
          }
        }
        
        const success = this.send({
          method: 'unsubscribe',
          subscription: subscriptionParams
        });
        
        if (success) {
          this.activeSubscriptions.delete(subscriptionKey);
          unsubscribed = true;
        }
      } else if (type === 'trades') {
        const success = this.send({
          method: 'unsubscribe',
          subscription: { type: 'trades', coin: symbol }
        });
        
        if (success) {
          this.activeSubscriptions.delete(subscriptionKey);
          unsubscribed = true;
        }
      }
    }
    
    return unsubscribed;
  }

  // Get all active symbol subscriptions for debugging
  getActiveSymbolSubscriptions() {
    return Array.from(this.activeSubscriptions).filter(key => 
      key.startsWith('l2Book:') || key.startsWith('trades:')
    );
  }

  // Removed unused market data cache getter methods - data is now broadcast directly to components

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: Array.from(this.activeSubscriptions),
      userSubscriptions: Array.from(this.userSubscriptions),
      userHistoricalOrdersSubscriptions: Array.from(this.userHistoricalOrdersSubscriptions),
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

  // Removed unused getMarketData method - components now use broadcast data directly

  // ===== CANDLE SUBSCRIPTION METHODS FOR TRADINGVIEW CHART =====

  /**
   * Handle candle data updates from WebSocket
   */
  handleCandleUpdate(data) {
    const candleData = data.data;
    const coin = candleData.s; // symbol from candle data
    const interval = candleData.i; // interval from candle data
    
    if (!candleData || !coin || !interval) {
      return;
    }

    const channelString = `${coin}_${interval}`;
    
    // Map HyperLiquid field names to TradingView format
    const bar = {
      time: candleData.t,                    // t -> time (already in milliseconds)
      open: +candleData.o,                   // o -> open (faster than parseFloat)
      high: +candleData.h,                   // h -> high
      low: +candleData.l,                    // l -> low
      close: +candleData.c,                  // c -> close
      volume: +candleData.v || 0             // v -> volume
    };
    
    // Broadcast to candle subscribers
    this.broadcast(`candle:${channelString}`, bar);
  }

  /**
   * Subscribe to candle data for TradingView chart
   */
  subscribeToCandle(symbol, interval, callback) {
    if (!this.isConnected) return false;
    
    const channelString = `${symbol}_${interval}`;
    const candleKey = `candle:${channelString}`;
    
    // Subscribe to the callback
    this.subscribe(candleKey, callback);
    
    // Subscribe to WebSocket candle data if not already subscribed
    const subscriptionKey = `candle:${channelString}`;
    if (!this.activeSubscriptions.has(subscriptionKey)) {
      const success = this.send({
        method: 'subscribe',
        subscription: { type: 'candle', coin: symbol, interval: interval }
      });
      
      if (success) {
        this.activeSubscriptions.add(subscriptionKey);
        return true;
      } else {
        // If subscription failed, remove the callback subscription
        this.unsubscribe(candleKey, callback);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Unsubscribe from candle data
   */
  unsubscribeFromCandle(symbol, interval, callback) {
    if (!this.isConnected) return false;
    
    const channelString = `${symbol}_${interval}`;
    const candleKey = `candle:${channelString}`;
    const subscriptionKey = `candle:${channelString}`;
    
    // Unsubscribe from the callback
    this.unsubscribe(candleKey, callback);
    
    // If no more subscribers for this candle, unsubscribe from WebSocket
    if (!this.subscribers.has(candleKey) || this.subscribers.get(candleKey).size === 0) {
      if (this.activeSubscriptions.has(subscriptionKey)) {
        const success = this.send({
          method: 'unsubscribe',
          subscription: { type: 'candle', coin: symbol, interval: interval }
        });
        
        if (success) {
          this.activeSubscriptions.delete(subscriptionKey);
          return true;
        }
      }
    }
    
    return true;
  }
}

export default WebSocketService;