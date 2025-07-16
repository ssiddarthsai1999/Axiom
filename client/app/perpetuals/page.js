"use client"
import React, { useState, useEffect, useCallback, useRef } from 'react'
import TradingViewChart from '@/components/TradingViewChart'
import OrderBook from '@/components/OrderBook'
import TokenData from '@/components/TokenData'
import TradingPanel from '@/components/TradingPanel'
import UserPositions from '@/components/UserPositions'
import SimpleAtomTrader from '@/components/SimpleAtomTrader'
import Navbar from '@/components/Navbar'
import FavoritesTicker from '@/components/FavoritesTicker'

function TradingPage() {
  // Centralized state
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [marketData, setMarketData] = useState(null);
  const [orderBookData, setOrderBookData] = useState({ asks: [], bids: [] });
  const [tradesData, setTradesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('positions');

  // Available tokens list
  const [availableTokens, setAvailableTokens] = useState([]);
  const [allMarketData, setAllMarketData] = useState([]);

  // WebSocket connection state
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef(null);

  // Helper functions
  const getTokenName = (coin) => {
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
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  // Initial market data fetch (REST - only once on load)
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
  }, [selectedSymbol]);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    console.log('Connecting to WebSocket...');
    const websocket = new WebSocket('wss://api.hyperliquid.xyz/ws');

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWs(websocket);
      setWsConnected(true);
      reconnectAttempts.current = 0;

      // Subscribe to order book and trades for initial symbol
      if (selectedSymbol) {
        websocket.send(JSON.stringify({
          method: 'subscribe',
          subscription: {
            type: 'l2Book',
            coin: selectedSymbol
          }
        }));

        websocket.send(JSON.stringify({
          method: 'subscribe',
          subscription: {
            type: 'trades',
            coin: selectedSymbol
          }
        }));
      }
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle subscription confirmations
        if (data.channel === 'subscriptionResponse') {
          console.log('Subscription confirmed:', data.data);
          return;
        }

        // Handle order book updates
        if (data.channel === 'l2Book') {
          const bookData = data.data;
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

            // Update current market data price with real-time mid price
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

              // Also update the allMarketData cache for consistency
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
        }

        // Handle trades updates
        if (data.channel === 'trades') {
          const trades = data.data;
          if (trades && Array.isArray(trades)) {
            const formattedTrades = trades.map(trade => ({
              price: parseFloat(trade.px),
              size: parseFloat(trade.sz),
              side: trade.side,
              time: new Date(trade.time),
              ago: formatTimeAgo(trade.time)
            }));
            
            setTradesData(formattedTrades);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setWs(null);
      setWsConnected(false);
      
      // Attempt to reconnect unless it was a clean close
      if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current++;
          connectWebSocket();
        }, delay);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    };

    return websocket;
  }, [selectedSymbol, ws]);

  // Handle symbol changes with WebSocket subscriptions
  const handleSymbolChange = useCallback((newSymbol) => {
    const previousSymbol = selectedSymbol;
    setSelectedSymbol(newSymbol);
    
    // Update market data immediately from cached data
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Unsubscribe from previous symbol
      if (previousSymbol) {
        ws.send(JSON.stringify({
          method: 'unsubscribe',
          subscription: {
            type: 'l2Book',
            coin: previousSymbol
          }
        }));

        ws.send(JSON.stringify({
          method: 'unsubscribe',
          subscription: {
            type: 'trades',
            coin: previousSymbol
          }
        }));
      }

      // Subscribe to new symbol
      ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: {
          type: 'l2Book',
          coin: newSymbol
        }
      }));

      ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: {
          type: 'trades',
          coin: newSymbol
        }
      }));
    }

    // Clear existing data while waiting for new data
    setOrderBookData({ asks: [], bids: [] });
    setTradesData([]);
  }, [selectedSymbol, allMarketData, ws]);

  // Handle WebSocket subscription updates when selectedSymbol changes
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN && selectedSymbol) {
      // This effect handles the initial subscription when WebSocket connects
      // The handleSymbolChange function handles subsequent changes
    }
  }, [ws, selectedSymbol, wsConnected]);

  // Initialize WebSocket connection and fetch initial data
  useEffect(() => {
    fetchInitialMarketData();
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws) {
        ws.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // Periodic market data refresh (much less frequent than before)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchInitialMarketData();
    }, 60000); // Only every 60 seconds for market data

    return () => clearInterval(interval);
  }, [fetchInitialMarketData]);

  // Mobile Tab Component
  const MobileTabs = () => {
    const tabs = [
      { id: 'positions', label: 'Positions' },
      { id: 'orderbook', label: 'Order Book' },
      { id: 'trades', label: 'Trading' }
    ];

    return (
      <div className="lg:hidden">
        <div className='p-4'>
          <div className="flex p-1 border rounded-2xl border-[#FAFAFA33]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

        <div className="bg-[#0d0c0e] min-h-[50vh]">
          {activeTab === 'positions' && (
            <div className="p-4">
              <UserPositions />
            </div>
          )}
          {activeTab === 'orderbook' && (
            <div className="h-[50vh]">
              <OrderBook 
                selectedSymbol={selectedSymbol}
                orderBookData={orderBookData}
                tradesData={tradesData}
                className="h-full"
              />
            </div>
          )}
          {activeTab === 'trades' && (
            <div className="h-[50vh]">
              <TradingPanel 
                selectedSymbol={selectedSymbol}
                marketData={marketData}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

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
                connectWebSocket();
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
    <div className='min-h-screen flex flex-col bg-[#0d0c0e]'>
      {/* WebSocket connection status indicator */}
      {!wsConnected && (
        <div className="bg-yellow-600 text-black text-center py-1 text-xs">
          Connecting to real-time data...
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className='flex flex-col flex-1 min-w-0'>
          <div className='flex flex-1 min-h-0'>
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
            <div className='w-80 flex-shrink-0 border-l border-r border-[#1F1E23]'>
              <OrderBook 
                selectedSymbol={selectedSymbol}
                orderBookData={orderBookData}
                tradesData={tradesData}
                className="h-full"
              />
            </div>
          </div>
          <div className='border-t border-[#1F1E23] shrink-0'>
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
      <div className="lg:hidden flex flex-col pb-[150px] flex-1">
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
        <div className='flex-1 min-h-[40vh] max-h-[50vh]'>
          <TradingViewChart 
            symbol={`${selectedSymbol}USD`}
            onSymbolChange={handleSymbolChange}
            className="w-full h-full"
          />
        </div>
        <MobileTabs />
      </div>
    </div>
  );
}

export default TradingPage;