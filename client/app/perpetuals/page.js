"use client"
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import TradingViewChart from '@/components/TradingViewChart'
import OrderBook from '@/components/OrderBook'
import TokenData from '@/components/TokenData'
import TradingPanel from '@/components/TradingPanel'
import UserPositions from '@/components/UserPositions'
import SimpleAtomTrader from '@/components/SimpleAtomTrader'
import Navbar from '@/components/Navbar'
import FavoritesTicker from '@/components/FavoritesTicker'

// WebSocket service singleton to prevent multiple connections
// WebSocket service singleton to prevent multiple connections
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

    console.log('Connecting to WebSocket...');
    this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.broadcast('connection', { connected: true });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.channel === 'subscriptionResponse') {
          console.log('Subscription confirmed:', data.data);
          return;
        }

        // Handle allMids updates (contains real-time mid prices for all symbols)
        if (data.channel === 'allMids' && data.data && data.data.mids) {
          this.broadcast('allMids', data);
        }
        // Handle webData2 updates (comprehensive user and market data)
        else if (data.channel === 'webData2' && data.data) {
          this.broadcast('webData2', data);
        }
        // Handle l2Book updates
        else if (data.channel === 'l2Book' && data.data && data.data.coin) {
          const coin = data.data.coin;
          this.broadcast(`l2Book:${coin}`, data);
        }
        // Handle trades updates
        else if (data.channel === 'trades' && data.data && Array.isArray(data.data) && data.data.length > 0) {
          const coin = data.data[0].coin;
          this.broadcast(`trades:${coin}`, data);
        }
        // Handle user funding updates
        else if (data.channel === 'userFundings' && data.data) {
          this.broadcast('userFundings', data);
        }
        // Handle user fills updates
        else if (data.channel === 'userFills' && data.data) {
          this.broadcast('userFills', data);
        }
        // Handle user events
        else if (data.channel === 'user' && data.data) {
          this.broadcast('userEvents', data);
        }
        // Handle BBO (Best Bid Offer) updates
        else if (data.channel === 'bbo' && data.data && data.data.coin) {
          const coin = data.data.coin;
          this.broadcast(`bbo:${coin}`, data);
        }
        // Handle candle updates
        else if (data.channel === 'candle' && data.data) {
          const coin = data.data.s;
          const interval = data.data.i;
          this.broadcast(`candle:${coin}:${interval}`, data);
        }
        // Handle notification updates
        else if (data.channel === 'notification' && data.data) {
          this.broadcast('notification', data);
        }
        else {
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
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
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
    }
  }

  // Subscribe to real-time mid prices for all symbols
  subscribeToAllMids() {
    if (!this.isConnected) return;
    
    const allMidsKey = 'allMids';
    
    if (!this.activeSubscriptions.has(allMidsKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'allMids' }
      });
      this.activeSubscriptions.add(allMidsKey);
      console.log('Subscribed to allMids for real-time price updates');
    }
  }

subscribeToAllSymbolData() {
  if (!this.isConnected) return;
  
  // Subscribe to a few major symbols' BBO data which updates every 3 seconds
  const majorSymbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK']; // Add more as needed
  
  majorSymbols.forEach(symbol => {
    const bboKey = `bbo:${symbol}`;
    if (!this.activeSubscriptions.has(bboKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'bbo', coin: symbol }
      });
      this.activeSubscriptions.add(bboKey);
      console.log(`Subscribed to BBO for ${symbol}`);
    }
  });
}

  // Subscribe to comprehensive user and market data
  subscribeToWebData2(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const webData2Key = `webData2:${userAddress}`;
    
    if (!this.activeSubscriptions.has(webData2Key)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'webData2', user: userAddress }
      });
      this.activeSubscriptions.add(webData2Key);
      console.log(`Subscribed to webData2 for ${userAddress}`);
    }
  }

  // Subscribe to user funding updates
  subscribeToUserFundings(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const userFundingsKey = `userFundings:${userAddress}`;
    
    if (!this.activeSubscriptions.has(userFundingsKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'userFundings', user: userAddress }
      });
      this.activeSubscriptions.add(userFundingsKey);
      console.log(`Subscribed to userFundings for ${userAddress}`);
    }
  }

  // Subscribe to user fills
  subscribeToUserFills(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const userFillsKey = `userFills:${userAddress}`;
    
    if (!this.activeSubscriptions.has(userFillsKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'userFills', user: userAddress }
      });
      this.activeSubscriptions.add(userFillsKey);
      console.log(`Subscribed to userFills for ${userAddress}`);
    }
  }

  // Subscribe to user events
  subscribeToUserEvents(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const userEventsKey = `userEvents:${userAddress}`;
    
    if (!this.activeSubscriptions.has(userEventsKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'user', user: userAddress }
      });
      this.activeSubscriptions.add(userEventsKey);
      console.log(`Subscribed to userEvents for ${userAddress}`);
    }
  }

  // Subscribe to BBO (Best Bid Offer) for a symbol
  subscribeToBBO(symbol) {
    if (!this.isConnected) return;
    
    const bboKey = `bbo:${symbol}`;
    
    if (!this.activeSubscriptions.has(bboKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'bbo', coin: symbol }
      });
      this.activeSubscriptions.add(bboKey);
      console.log(`Subscribed to BBO for ${symbol}`);
    }
  }

  // Subscribe to candles for a symbol
  subscribeToCandles(symbol, interval = '1m') {
    if (!this.isConnected) return;
    
    const candleKey = `candle:${symbol}:${interval}`;
    
    if (!this.activeSubscriptions.has(candleKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'candle', coin: symbol, interval: interval }
      });
      this.activeSubscriptions.add(candleKey);
      console.log(`Subscribed to candles for ${symbol} with ${interval} interval`);
    }
  }

  // Subscribe to notifications for a user
  subscribeToNotifications(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const notificationKey = `notification:${userAddress}`;
    
    if (!this.activeSubscriptions.has(notificationKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'notification', user: userAddress }
      });
      this.activeSubscriptions.add(notificationKey);
      console.log(`Subscribed to notifications for ${userAddress}`);
    }
  }

  // Original symbol subscription methods (for l2Book and trades)
  subscribeToSymbol(symbol) {
    if (!this.isConnected) return;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    // Only subscribe if not already subscribed
    if (!this.activeSubscriptions.has(l2BookKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: symbol }
      });
      this.activeSubscriptions.add(l2BookKey);
      console.log(`Subscribed to l2Book for ${symbol}`);
    }

    if (!this.activeSubscriptions.has(tradesKey)) {
      this.send({
        method: 'subscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      this.activeSubscriptions.add(tradesKey);
      console.log(`Subscribed to trades for ${symbol}`);
    }
  }

  unsubscribeFromSymbol(symbol) {
    if (!this.isConnected) return;
    
    const l2BookKey = `l2Book:${symbol}`;
    const tradesKey = `trades:${symbol}`;
    
    // Only unsubscribe if currently subscribed
    if (this.activeSubscriptions.has(l2BookKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'l2Book', coin: symbol }
      });
      this.activeSubscriptions.delete(l2BookKey);
      console.log(`Unsubscribed from l2Book for ${symbol}`);
    }

    if (this.activeSubscriptions.has(tradesKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'trades', coin: symbol }
      });
      this.activeSubscriptions.delete(tradesKey);
      console.log(`Unsubscribed from trades for ${symbol}`);
    }
  }

  // Unsubscribe from allMids
  unsubscribeFromAllMids() {
    if (!this.isConnected) return;
    
    const allMidsKey = 'allMids';
    
    if (this.activeSubscriptions.has(allMidsKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'allMids' }
      });
      this.activeSubscriptions.delete(allMidsKey);
      console.log('Unsubscribed from allMids');
    }
  }

  // Unsubscribe from webData2
  unsubscribeFromWebData2(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const webData2Key = `webData2:${userAddress}`;
    
    if (this.activeSubscriptions.has(webData2Key)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'webData2', user: userAddress }
      });
      this.activeSubscriptions.delete(webData2Key);
      console.log(`Unsubscribed from webData2 for ${userAddress}`);
    }
  }

  // Unsubscribe from user-specific feeds
  unsubscribeFromUserFundings(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const userFundingsKey = `userFundings:${userAddress}`;
    
    if (this.activeSubscriptions.has(userFundingsKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'userFundings', user: userAddress }
      });
      this.activeSubscriptions.delete(userFundingsKey);
      console.log(`Unsubscribed from userFundings for ${userAddress}`);
    }
  }

  unsubscribeFromUserFills(userAddress) {
    if (!this.isConnected || !userAddress) return;
    
    const userFillsKey = `userFills:${userAddress}`;
    
    if (this.activeSubscriptions.has(userFillsKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'userFills', user: userAddress }
      });
      this.activeSubscriptions.delete(userFillsKey);
      console.log(`Unsubscribed from userFills for ${userAddress}`);
    }
  }

  unsubscribeFromBBO(symbol) {
    if (!this.isConnected) return;
    
    const bboKey = `bbo:${symbol}`;
    
    if (this.activeSubscriptions.has(bboKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'bbo', coin: symbol }
      });
      this.activeSubscriptions.delete(bboKey);
      console.log(`Unsubscribed from BBO for ${symbol}`);
    }
  }

  unsubscribeFromCandles(symbol, interval = '1m') {
    if (!this.isConnected) return;
    
    const candleKey = `candle:${symbol}:${interval}`;
    
    if (this.activeSubscriptions.has(candleKey)) {
      this.send({
        method: 'unsubscribe',
        subscription: { type: 'candle', coin: symbol, interval: interval }
      });
      this.activeSubscriptions.delete(candleKey);
      console.log(`Unsubscribed from candles for ${symbol} with ${interval} interval`);
    }
  }

  // Utility methods
  getActiveSubscriptions() {
    return Array.from(this.activeSubscriptions);
  }

  getSubscriberCount(key) {
    return this.subscribers.has(key) ? this.subscribers.get(key).size : 0;
  }

  isSubscribedTo(subscriptionKey) {
    return this.activeSubscriptions.has(subscriptionKey);
  }

  // Send POST requests via WebSocket
  sendPostRequest(requestData, requestId = Date.now()) {
    if (!this.isConnected) {
      console.error('WebSocket not connected');
      return;
    }

    this.send({
      method: 'post',
      id: requestId,
      request: requestData
    });
  }
}

function TradingPage() {
  // Centralized state
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [marketData, setMarketData] = useState(null);
  const [orderBookData, setOrderBookData] = useState({ asks: [], bids: [] });
  const [tradesData, setTradesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('positions');
  const [wsConnected, setWsConnected] = useState(false);

  // Available tokens list
  const [availableTokens, setAvailableTokens] = useState([]);
  const [allMarketData, setAllMarketData] = useState([]);

  // Refs for optimization
  const wsService = useRef(WebSocketService.getInstance());
  const tradeHistoryRef = useRef(new Map()); // Change to Map for better symbol-based storage
  const maxTradesCount = 40;
  const lastOrderBookUpdate = useRef(0);
  const lastTradesUpdate = useRef(0);
  const updateThrottleMs = 100; // Throttle updates to 10fps max

  // Helper functions - memoized to prevent recreation
  const getTokenName = useCallback((coin) => {
    const names = {
      'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana',
      'ADA': 'Cardano', 'DOT': 'Polkadot', 'AVAX': 'Avalanche',
      'LINK': 'Chainlink', 'MATIC': 'Polygon', 'DOGE': 'Dogecoin',
      'XRP': 'Ripple', 'LTC': 'Litecoin', 'BCH': 'Bitcoin Cash',
      'UNI': 'Uniswap', 'ATOM': 'Cosmos', 'FTM': 'Fantom',
      'NEAR': 'Near Protocol', 'ALGO': 'Algorand', 'VET': 'VeChain',
      'ICP': 'Internet Computer', 'FIL': 'Filecoin'
    };
    return names[coin] || coin;
  }, []);

const handleAllMidsUpdate = useCallback((data) => {
  if (data.data && data.data.mids) {
    const midsData = data.data.mids;
    
    // Update allMarketData with real-time mid prices
    setAllMarketData(prev => prev.map(token => {
      const midPrice = midsData[token.symbol];
      if (midPrice) {
        const newPrice = parseFloat(midPrice);
        const prevPrice = token.prevDayPx || token.price;
        const change24h = prevPrice > 0 ? ((newPrice - prevPrice) / prevPrice) * 100 : 0;
        
        return {
          ...token,
          price: newPrice,
          midPx: newPrice,
          change24h: change24h
        };
      }
      return token;
    }));
    
    // Update current market data if it's for the selected symbol
    const selectedSymbolMid = midsData[selectedSymbol];
    if (selectedSymbolMid) {
      setMarketData(prev => {
        if (prev && prev.symbol === selectedSymbol) {
          const newPrice = parseFloat(selectedSymbolMid);
          const prevPrice = prev.prevDayPx || prev.price;
          const change24h = prevPrice > 0 ? ((newPrice - prevPrice) / prevPrice) * 100 : 0;
          
          return {
            ...prev,
            price: newPrice,
            midPx: newPrice,
            change24h: change24h
          };
        }
        return prev;
      });
    }
    
    // Trigger oracle/funding data fetch every time we get allMids update
    // This will effectively update every ~3 seconds when oracle updates
    fetchOracleAndFundingData();
  }
}, [selectedSymbol]);





useEffect(() => {
  const ws = wsService.current;
  
  ws.subscribe('allMids', handleAllMidsUpdate);
  
  if (wsConnected) {
    ws.subscribeToAllMids();
  }
  
  return () => {
    ws.unsubscribe('allMids', handleAllMidsUpdate);
  };
}, [wsConnected, handleAllMidsUpdate]);

const fetchOracleAndFundingData = useCallback(async () => {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    });

    if (!response.ok) return;

    const data = await response.json();
    
    if (Array.isArray(data) && data.length >= 2) {
      const universe = data[0].universe;
      const assetCtxs = data[1];
      
      if (Array.isArray(universe) && Array.isArray(assetCtxs)) {
        // Update only oracle and funding data, keeping other data intact
        setAllMarketData(prev => prev.map((token, index) => {
          const assetCtx = assetCtxs[index];
          if (assetCtx) {
            return {
              ...token,
              oraclePrice: parseFloat(assetCtx.oraclePx),
              funding: parseFloat(assetCtx.funding),
              premium: parseFloat(assetCtx.premium),
              openInterest: parseFloat(assetCtx.openInterest)
            };
          }
          return token;
        }));
        
        // Update current market data for selected symbol
        const selectedTokenIndex = universe.findIndex(token => token.name === selectedSymbol);
        if (selectedTokenIndex !== -1 && assetCtxs[selectedTokenIndex]) {
          const assetCtx = assetCtxs[selectedTokenIndex];
          setMarketData(prev => {
            if (prev && prev.symbol === selectedSymbol) {
              return {
                ...prev,
                oraclePrice: parseFloat(assetCtx.oraclePx),
                funding: parseFloat(assetCtx.funding),
                premium: parseFloat(assetCtx.premium),
                openInterest: parseFloat(assetCtx.openInterest)
              };
            }
            return prev;
          });
        }
      }
    }
  } catch (error) {
    console.error('Error fetching oracle and funding data:', error);
  }
}, [selectedSymbol]);


  useEffect(() => {
  const ws = wsService.current;
  
  ws.subscribe('allMids', handleAllMidsUpdate);
  
  if (wsConnected) {
    ws.subscribeToAllMids();
    // Also fetch once immediately when connected
    fetchOracleAndFundingData();
  }
  
  return () => {
    ws.unsubscribe('allMids', handleAllMidsUpdate);
  };
}, [wsConnected, handleAllMidsUpdate, fetchOracleAndFundingData]);

  const formatTimeAgo = useCallback((timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }, []);

  // Optimized trade history management with throttling
  const addTradesToHistory = useCallback((newTrades, symbol) => {
    const now = Date.now();
    if (now - lastTradesUpdate.current < updateThrottleMs) {
      return;
    }
    lastTradesUpdate.current = now;

    if (!Array.isArray(newTrades) || newTrades.length === 0) return;

    const formattedTrades = newTrades.map(trade => ({
      id: `${trade.time}-${trade.px}-${trade.sz}-${Math.random()}`,
      price: parseFloat(trade.px),
      size: parseFloat(trade.sz),
      side: trade.side,
      time: new Date(trade.time),
      timestamp: trade.time,
      ago: formatTimeAgo(trade.time),
      symbol: symbol
    }));

    // Get existing trades for this symbol
    const existingTrades = tradeHistoryRef.current.get(symbol) || [];
    
    const updatedTrades = [
      ...formattedTrades,
      ...existingTrades
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxTradesCount);

    // Store trades by symbol
    tradeHistoryRef.current.set(symbol, updatedTrades);

    // Only update UI if this is the currently selected symbol
    if (symbol === selectedSymbol) {
      setTradesData([...updatedTrades]);
    }
  }, [formatTimeAgo, updateThrottleMs, selectedSymbol]);

  // Throttled orderbook update
  const updateOrderBook = useCallback((bookData) => {
    const now = Date.now();
    if (now - lastOrderBookUpdate.current < updateThrottleMs) {
      return;
    }
    lastOrderBookUpdate.current = now;

    // Only update if this is for the currently selected symbol
    if (bookData.coin !== selectedSymbol) {
      return;
    }

    if (bookData && bookData.levels && bookData.levels.length >= 2) {
      const bids = bookData.levels[0]
        .map(level => ({
          price: parseFloat(level.px),
          amount: parseFloat(level.sz),
          total: 0
        }))
        .sort((a, b) => b.price - a.price);

      const asks = bookData.levels[1]
        .map(level => ({
          price: parseFloat(level.px),
          amount: parseFloat(level.sz),
          total: 0
        }))
        .sort((a, b) => a.price - b.price);

      // Calculate cumulative totals
      let askTotal = 0;
      asks.forEach(ask => {
        askTotal += ask.amount;
        ask.total = askTotal;
      });

      let bidTotal = 0;
      bids.forEach(bid => {
        bidTotal += bid.amount;
        bid.total = bidTotal;
      });

      setOrderBookData({ asks, bids });

      // Update market data with mid price
      if (bids.length > 0 && asks.length > 0) {
        const midPrice = (bids[0].price + asks[0].price) / 2;
        
        setMarketData(prev => {
          if (prev && prev.symbol === bookData.coin) {
            const prevPrice = prev.prevDayPx || prev.price;
            const change24h = prevPrice > 0 ? ((midPrice - prevPrice) / prevPrice) * 100 : 0;
            
            return {
              ...prev,
              price: midPrice,
              change24h: change24h
            };
          }
          return prev;
        });

        // Update allMarketData cache
        setAllMarketData(prev => prev.map(token => {
          if (token.symbol === bookData.coin) {
            const prevPrice = token.prevDayPx || token.price;
            const change24h = prevPrice > 0 ? ((midPrice - prevPrice) / prevPrice) * 100 : 0;
            
            return {
              ...token,
              price: midPrice,
              change24h: change24h
            };
          }
          return token;
        }));
      }
    }
  }, [updateThrottleMs, selectedSymbol]);

  // WebSocket event handlers - memoized
  const handleConnection = useCallback((data) => {
    setWsConnected(data.connected);
  }, []);

  const handleOrderBookUpdate = useCallback((data) => {
    if (data.data && data.data.coin) {
      updateOrderBook(data.data);
    }
  }, [updateOrderBook]);

  const handleTradesUpdate = useCallback((data) => {
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const coin = data.data[0].coin;
      addTradesToHistory(data.data, coin);
    }
  }, [addTradesToHistory]);

  // Initial market data fetch - memoized
  const fetchInitialMarketData = useCallback(async () => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' })
      });

      if (!response.ok) throw new Error('Failed to fetch market data');

      const data = await response.json();
      
      if (Array.isArray(data) && data.length >= 2) {
        const universe = data[0].universe;
        const assetCtxs = data[1];
        
        const processedTokens = universe.map((token, index) => {
          const assetCtx = assetCtxs[index];
          if (!assetCtx) return null;
          
          const prevPrice = parseFloat(assetCtx.prevDayPx);
          const currentPrice = parseFloat(assetCtx.markPx);
          const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
          
          return {
            symbol: token.name,
            maxLeverage: token.maxLeverage,
            szDecimals: token.szDecimals,
            onlyIsolated: token.onlyIsolated || false,
            price: parseFloat(assetCtx.markPx),
            oraclePrice: parseFloat(assetCtx.oraclePx),
            change24h: change24h,
            volume24h: parseFloat(assetCtx.dayNtlVlm),
            openInterest: parseFloat(assetCtx.openInterest),
            funding: parseFloat(assetCtx.funding),
            prevDayPx: parseFloat(assetCtx.prevDayPx),
            premium: parseFloat(assetCtx.premium),
            midPx: parseFloat(assetCtx.midPx),
            fullAssetCtx: assetCtx
          };
        }).filter(Boolean);
        
        const sortedTokens = processedTokens.sort((a, b) => b.volume24h - a.volume24h);
        setAvailableTokens(sortedTokens);
        setAllMarketData(sortedTokens);

        const selectedTokenData = sortedTokens.find(token => token.symbol === selectedSymbol);
        if (selectedTokenData) {
          setMarketData({
            symbol: selectedTokenData.symbol,
            name: getTokenName(selectedTokenData.symbol),
            price: selectedTokenData.price,
            oraclePrice: selectedTokenData.oraclePrice,
            change24h: selectedTokenData.change24h,
            volume24h: selectedTokenData.volume24h,
            openInterest: selectedTokenData.openInterest,
            funding: selectedTokenData.funding,
            prevDayPx: selectedTokenData.prevDayPx,
            dayNtlVlm: selectedTokenData.volume24h,
            premium: selectedTokenData.premium,
            midPx: selectedTokenData.midPx,
            maxLeverage: selectedTokenData.maxLeverage,
            szDecimals: selectedTokenData.szDecimals,
            onlyIsolated: selectedTokenData.onlyIsolated
          });
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching initial market data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [selectedSymbol, getTokenName]);

  // Handle symbol changes
  const handleSymbolChange = useCallback((newSymbol) => {
    const previousSymbol = selectedSymbol;
    setSelectedSymbol(newSymbol);
    
    // Show trades for the selected symbol from cache
    const symbolTrades = tradeHistoryRef.current.get(newSymbol) || [];
    setTradesData([...symbolTrades]);
    
    // Update market data from cache
    const tokenData = allMarketData.find(token => token.symbol === newSymbol);
    if (tokenData) {
      setMarketData({
        symbol: tokenData.symbol,
        name: getTokenName(tokenData.symbol),
        price: tokenData.price,
        oraclePrice: tokenData.oraclePrice,
        change24h: tokenData.change24h,
        volume24h: tokenData.volume24h,
        openInterest: tokenData.openInterest,
        funding: tokenData.funding,
        prevDayPx: tokenData.prevDayPx,
        dayNtlVlm: tokenData.volume24h,
        premium: tokenData.premium,
        midPx: tokenData.midPx,
        maxLeverage: tokenData.maxLeverage,
        szDecimals: tokenData.szDecimals,
        onlyIsolated: tokenData.onlyIsolated
      });
    }

    // Update WebSocket subscriptions
    if (wsService.current.isConnected) {
      if (previousSymbol && previousSymbol !== newSymbol) {
        wsService.current.unsubscribeFromSymbol(previousSymbol);
      }
      wsService.current.subscribeToSymbol(newSymbol);
    }

    // Clear order book for new symbol
    setOrderBookData({ asks: [], bids: [] });
  }, [selectedSymbol, allMarketData, getTokenName]);

  // Initialize WebSocket connection - runs only once
  useEffect(() => {
    const ws = wsService.current;
    
    // Subscribe to WebSocket events with symbol-specific keys
    ws.subscribe('connection', handleConnection);
    
    // Cleanup function
    return () => {
      ws.unsubscribe('connection', handleConnection);
      ws.disconnect();
    };
  }, []); // Empty dependency array - runs only once

  // Subscribe to symbol-specific WebSocket events
  useEffect(() => {
    const ws = wsService.current;
    
    // Subscribe to symbol-specific channels
    const l2BookKey = `l2Book:${selectedSymbol}`;
    const tradesKey = `trades:${selectedSymbol}`;
    
    ws.subscribe(l2BookKey, handleOrderBookUpdate);
    ws.subscribe(tradesKey, handleTradesUpdate);
    
    // Subscribe to the symbol when connected
    if (wsConnected) {
      ws.subscribeToSymbol(selectedSymbol);
    }
    
    return () => {
      ws.unsubscribe(l2BookKey, handleOrderBookUpdate);
      ws.unsubscribe(tradesKey, handleTradesUpdate);
    };
  }, [selectedSymbol, wsConnected, handleOrderBookUpdate, handleTradesUpdate]);

  // Connect WebSocket when it becomes available
  useEffect(() => {
    if (!wsConnected) {
      wsService.current.connect();
    }
  }, [wsConnected]);

  // Fetch initial data - runs only once
  useEffect(() => {
    fetchInitialMarketData();
  }, []); // Empty dependency array

  // Periodic market data refresh - much less frequent
  useEffect(() => {
    const interval = setInterval(fetchInitialMarketData, 300000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [fetchInitialMarketData]);

  // Update trade timestamps periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSymbolTrades = tradeHistoryRef.current.get(selectedSymbol) || [];
      const updatedTrades = currentSymbolTrades.map(trade => ({
        ...trade,
        ago: formatTimeAgo(trade.timestamp)
      }));

      if (updatedTrades.length > 0) {
        tradeHistoryRef.current.set(selectedSymbol, updatedTrades);
        setTradesData([...updatedTrades]);
      }
    }, 5000); // Update every 5 seconds instead of every second

    return () => clearInterval(interval);
  }, [selectedSymbol, formatTimeAgo]);

  // Mobile Tab Component - memoized
  const MobileTabs = useMemo(() => {
    const tabs = [
      { id: 'positions', label: 'Positions' },
      { id: 'orderbook', label: 'Order Book' },
      { id: 'trades', label: 'Trades' }
    ];

    const handleTabClick = (tabId) => {
      setActiveTab(tabId);
    };

    return (
      <div className="lg:hidden">
        <div className='p-4'>
          <div className="flex p-1 border rounded-2xl border-[#FAFAFA33]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex-1 py-3 px-4 text-[12px] font-mono leading-[20px] rounded-[10px] font-[500] transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'text-[#FAFAFA] bg-[#222227]'
                    : 'text-[#B3B9BE] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#0d0c0e]">
          <div style={{ display: activeTab === 'positions' ? 'block' : 'none' }}>
            <div className="p-4">
              <UserPositions />
            </div>
          </div>
          
          <div style={{ display: activeTab === 'orderbook' ? 'block' : 'none' }}>
            <OrderBook 
              selectedSymbol={selectedSymbol}
              orderBookData={orderBookData}
              tradesData={tradesData}
              className="h-full"
            />
          </div>
          
          <div style={{ display: activeTab === 'trades' ? 'block' : 'none' }}>
            <TradingPanel 
              selectedSymbol={selectedSymbol}
              marketData={marketData}
              className="h-full"
            />
          </div>
        </div>
      </div>
    );
  }, [activeTab, selectedSymbol, orderBookData, tradesData, marketData]);

  if (loading) {
    return (
      <div className='min-h-screen flex flex-col bg-[#0d0c0e]'>
        <div className='flex-1 flex items-center justify-center'>
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-gray-400 text-sm">Loading market data...</div>
            {!wsConnected && (
              <div className="text-yellow-400 text-xs">Connecting to real-time data...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex flex-col bg-[#0d0c0e]'>
        <div className='flex-1 flex items-center justify-center'>
          <div className="text-center">
            <div className="text-red-400 text-lg mb-2">Error loading data</div>
            <div className="text-gray-400 text-sm">{error}</div>
            <button 
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchInitialMarketData();
                wsService.current.connect();
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className=' min-h-[94vh] flex flex-col bg-[#0d0c0e]'>
      {/* WebSocket connection status indicatorss */}
      {!wsConnected && (
        <div className="bg-yellow-600 text-black text-center py-1 text-xs">
          Connecting to real-time data...
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className='flex flex-col flex-1 min-w-0'>
          <div className='flex min-h-0 '>
            <div className='flex flex-col flex-1 min-w-0'>
              <FavoritesTicker 
                selectedSymbol={selectedSymbol}
                setSelectedSymbol={handleSymbolChange}
                allMarketData={allMarketData}
              />
              <TokenData 
                marketData={marketData}
                selectedSymbol={selectedSymbol}
                availableTokens={availableTokens}
                onSymbolChange={handleSymbolChange}
                className="shrink-0"
              />
              <div className='flex flex-1 w-full min-h-0'>
                <TradingViewChart 
                  symbol={`${selectedSymbol}USD`}
                  onSymbolChange={handleSymbolChange}
                  className="flex-1 w-full"
                />
              </div>
            </div>
            <div className='w-80  border-l border-r border-[#1F1E23]'>
              <OrderBook 
                selectedSymbol={selectedSymbol}
                orderBookData={orderBookData}
                tradesData={tradesData}
                className="h-full"
              />
            </div>
          </div>
          <div className='border-t border-[#1F1E23] '>
            <UserPositions />
          </div>
        </div>
        <div className='w-[320px] flex-shrink-0 border-l border-[#1F1E23]'>
          <TradingPanel 
            selectedSymbol={selectedSymbol}
            marketData={marketData}
            className="h-full"
          />
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden flex flex-col flex-1">
        <FavoritesTicker 
          selectedSymbol={selectedSymbol}
          setSelectedSymbol={handleSymbolChange}
          allMarketData={allMarketData}
        />
        <TokenData 
          marketData={marketData}
          selectedSymbol={selectedSymbol}
          availableTokens={availableTokens}
          onSymbolChange={handleSymbolChange}
          className="shrink-0"
        />
        <div className='flex-1'>
          <TradingViewChart 
            symbol={`${selectedSymbol}USD`}
            onSymbolChange={handleSymbolChange}
            className="w-full h-full"
          />
        </div>
        {MobileTabs}
      </div>      
    </div>
  );
}

export default TradingPage;