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
import WebSocketService from '@/hooks/WebsocketService'
import { useWebSocketWallet } from '@/hooks/useWebSocketWallet'
import { useAccount } from 'wagmi'

function TradingPage() {
  // Centralized state
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  
  // Debug: Log selectedSymbol changes
  useEffect(() => {
    console.log(`🔍 selectedSymbol changed to: "${selectedSymbol}"`);
  }, [selectedSymbol]);
  const [marketData, setMarketData] = useState(null);
  const [orderBookData, setOrderBookData] = useState({ asks: [], bids: [] });
  const [tradesData, setTradesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('positions');
  const [wsConnected, setWsConnected] = useState(false);
  
  // Get wallet address for webData2 subscription
  const { address } = useAccount();
  
  // Use the WebSocket wallet hook to manage subscriptions automatically
  useWebSocketWallet();
  
  // Track current tick size parameters to avoid duplicate subscriptions
  const [currentTickSizeParams, setCurrentTickSizeParams] = useState(null);

  // Available tokens list
  const [availableTokens, setAvailableTokens] = useState([]);
  const [allMarketData, setAllMarketData] = useState([]);

  // Refs for optimization
  const wsService = useRef(WebSocketService.getInstance());
  const tradeHistoryRef = useRef(new Map()); // Change to Map for better symbol-based storage
  const previousSymbolRef = useRef(null); // Track previous symbol for cleanup
  const maxTradesCount = 40;
  const lastOrderBookUpdate = useRef(0);
  const lastTradesUpdate = useRef(0);
  const updateThrottleMs = 50; // Throttle updates to 20fps max for better responsiveness

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
            const change24h = midPrice - prevPrice;
            
            return {
              ...prev,
              // price: midPrice,
              change24h: change24h
            };
          }
          return prev;
        });

        // Update allMarketData cache
        setAllMarketData(prev => prev.map(token => {
          if (token.symbol === bookData.coin) {
            const prevPrice = token.prevDayPx || token.price;
            const change24h = midPrice - prevPrice;
            
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

  const handleAllMidsUpdate = useCallback((data) => {
    // TODO Check if this is needed
    if (data.data && data.data.mids) {
      // Update all market data with new prices
      setAllMarketData(prev => prev.map(token => {
        const newPrice = data.data.mids[token.symbol];
        if (newPrice) {
          const price = parseFloat(newPrice);
          const prevPrice = token.prevDayPx || token.price;
          const change24h = price - prevPrice;
          
          return {
            ...token,
            price: price,
            change24h: change24h
          };
        }
        return token;
      }));

      // Update current market data if it matches selected symbol
      setMarketData(prev => {
        if (prev && prev.symbol) {
          const selectedTokenPrice = data.data.mids[prev.symbol];
          if (selectedTokenPrice) {
            const price = parseFloat(selectedTokenPrice);
            const prevPrice = prev.prevDayPx || prev.price;
            const change24h = price - prevPrice;

            return {
              ...prev,
              price: price,
              change24h: change24h
            };
          }
        }
        return prev;
      });
    }
  }, []);



  const handleAssetCtxUpdate = useCallback((data) => {
    if (data.data && data.data.ctx) {
      const ctx = data.data.ctx;
      setMarketData(prev => {
        // Only update if this is for the currently selected symbol
        if (prev && prev.symbol === data.data.coin) {
          return {
            ...prev,
            price: parseFloat(ctx.markPx),
            oraclePrice: parseFloat(ctx.oraclePx),
            funding: parseFloat(ctx.funding),
            premium: parseFloat(ctx.premium),
            openInterest: parseFloat(ctx.openInterest),
            volume24h: parseFloat(ctx.dayNtlVlm),
            prevDayPx: parseFloat(ctx.prevDayPx),
            midPx: parseFloat(ctx.midPx)
          };
        }
        return prev;
      });
    }
  }, []);

  // Handle market data updates from webData2
  const handleMarketDataUpdate = useCallback((data) => {
    if (data.tokens && Array.isArray(data.tokens)) {
      const sortedTokens = data.tokens.sort((a, b) => b.volume24h - a.volume24h);
      setAvailableTokens(sortedTokens);
      setAllMarketData(sortedTokens);

      // Update current market data if it matches selected symbol
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
      
      setLoading(false);
    }
  }, [selectedSymbol, getTokenName]);

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
      const newMarketData = {
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
      };
      setMarketData(newMarketData);
    } else {
      console.log(`🔧 handleSymbolChange: No tokenData found for ${newSymbol}`);
    }

    // Update WebSocket subscriptions
    if (wsService.current.isConnected) {
      if (previousSymbol && previousSymbol !== newSymbol) {
        wsService.current.unsubscribeFromSymbol(previousSymbol, currentTickSizeParams);
      }
      // Reset tick size parameters for new symbol
      setCurrentTickSizeParams(null);
      wsService.current.subscribeToSymbol(newSymbol);
    }

    // Clear order book for new symbol
    setOrderBookData({ asks: [], bids: [] });
  }, [selectedSymbol, allMarketData, getTokenName, currentTickSizeParams]);

  // Handle tick size changes
  const handleTickSizeChange = useCallback((tickSizeOption) => {
    if (!wsService.current.isConnected || !selectedSymbol) return;
    
    const tickSizeParams = {
      nSigFigs: tickSizeOption.nSigFigs,
      mantissa: tickSizeOption.mantissa
    };
    
    // Only update if parameters actually changed
    if (JSON.stringify(currentTickSizeParams) !== JSON.stringify(tickSizeParams)) {
      // Unsubscribe from current l2Book subscription
      wsService.current.unsubscribeFromSymbol(selectedSymbol, currentTickSizeParams);
      
      // Subscribe with new tick size parameters
      wsService.current.subscribeToSymbol(selectedSymbol, tickSizeParams);
      
      // Update current parameters
      setCurrentTickSizeParams(tickSizeParams);
      
    }
  }, [selectedSymbol, currentTickSizeParams]);

  // Initialize WebSocket connection and global subscriptions - runs only once
  useEffect(() => {
    const ws = wsService.current;
    
    // Subscribe to WebSocket events
    ws.subscribe('connection', handleConnection);
    ws.subscribe('allMids', handleAllMidsUpdate);
    ws.subscribe('marketDataUpdate', handleMarketDataUpdate);
    
    // Connect to WebSocket with current wallet address
    ws.connect(address);
    
    // Cleanup function
    return () => {
      ws.unsubscribe('connection', handleConnection);
      ws.unsubscribe('allMids', handleAllMidsUpdate);
      ws.unsubscribe('marketDataUpdate', handleMarketDataUpdate);
      ws.disconnect();
    };
  }, [handleConnection, handleAllMidsUpdate, handleMarketDataUpdate]); // Include all dependencies

  // Subscribe to symbol-specific WebSocket events
  useEffect(() => {
    const ws = wsService.current;
    
    // Unsubscribe from previous symbol's asset context if it exists
    if (previousSymbolRef.current && previousSymbolRef.current !== selectedSymbol) {
      ws.unsubscribeFromAssetCtx(previousSymbolRef.current);
    }
    
    // Subscribe to symbol-specific channels
    const l2BookKey = `l2Book:${selectedSymbol}`;
    const tradesKey = `trades:${selectedSymbol}`;
    const assetCtxKey = `assetCtx:${selectedSymbol}`;
    
    ws.subscribe(l2BookKey, handleOrderBookUpdate);
    ws.subscribe(tradesKey, handleTradesUpdate);
    ws.subscribe(assetCtxKey, handleAssetCtxUpdate);
    
    // Subscribe to the symbol when connected
    if (wsConnected) {
      // Only subscribe if we don't have tick size parameters yet (initial subscription)
      if (!currentTickSizeParams) {
        ws.subscribeToSymbol(selectedSymbol);
      }
      // Subscribe to asset context for the selected symbol only
      ws.subscribeToAssetCtx(selectedSymbol);
    } else {
      console.log(`WebSocket not connected, cannot subscribe to symbol: ${selectedSymbol}`);
    }
    
    // Update the previous symbol reference
    previousSymbolRef.current = selectedSymbol;
    
    return () => {
      ws.unsubscribe(l2BookKey, handleOrderBookUpdate);
      ws.unsubscribe(tradesKey, handleTradesUpdate);
      ws.unsubscribe(assetCtxKey, handleAssetCtxUpdate);
      // Note: Asset context unsubscription is handled at the beginning of the next effect run
    };
  }, [selectedSymbol, wsConnected, currentTickSizeParams, handleOrderBookUpdate, handleTradesUpdate, handleAssetCtxUpdate]);

  // WebSocket wallet management is now handled automatically by useWebSocketWallet hook
  // No need for manual webData2 subscription - it's managed automatically


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

  // WebSocket health check
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      if (wsService.current) {
        const isHealthy = wsService.current.isHealthy();
        const isConnected = wsService.current.isConnected;
        
        // Only reconnect if we think we should be connected but the connection is unhealthys
        if (wsConnected && !isHealthy) {
          wsService.current.connect(address);
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(healthCheckInterval);
  }, [wsConnected]);

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
              szDecimals={(() => {
                return marketData?.szDecimals ?? 3;
              })()}
              onTickSizeChange={handleTickSizeChange}
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
  }, [activeTab, selectedSymbol, orderBookData, tradesData, marketData, handleTickSizeChange]);

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
                wsService.current.connect(address);
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
      <div className="flex flex-col">
      <FavoritesTicker 
                selectedSymbol={selectedSymbol}
                setSelectedSymbol={handleSymbolChange}
                allMarketData={allMarketData}
              />
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className='flex flex-col flex-1 min-w-0'>
        
          <div className='flex min-h-0 '>
            <div className='flex flex-col flex-1 min-w-0'>
             
              <TokenData 
                marketData={marketData}
                selectedSymbol={selectedSymbol}
                availableTokens={availableTokens}
                onSymbolChange={handleSymbolChange}
                className="shrink-0"
              />
              <div className='flex flex-1 w-full '>
                <TradingViewChart 
                  symbol={`${selectedSymbol}USD`}
                  onSymbolChange={handleSymbolChange}
                  className="flex-1 w-full"
                />
              </div>
            </div>
            <div className=' w-72  border-l border-r border-[#1F1E23]'>
              <OrderBook 
                selectedSymbol={selectedSymbol}
                orderBookData={orderBookData}
                tradesData={tradesData}
                szDecimals={(() => {
                  return marketData?.szDecimals ?? 3;
                })()}
                onTickSizeChange={handleTickSizeChange}
                className="h-full"
              />
            </div>
          </div>
          <div className='border-t border-[#1F1E23] '>
            <UserPositions />
          </div>
        </div>
        <div className='w-[340px] flex-shrink-0 border-l border-[#1F1E23]'>
          <TradingPanel 
            selectedSymbol={selectedSymbol}
            marketData={marketData}
            className="h-full"
          />
        </div>
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