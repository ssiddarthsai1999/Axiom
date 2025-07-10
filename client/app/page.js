"use client"
import React, { useState, useEffect, useCallback } from 'react'
import TradingViewChart from '@/components/TradingViewChart'
import OrderBook from '@/components/OrderBook'
import TokenData from '@/components/TokenData'
import TradingPanel from '@/components/TradingPanel'
function TradingPage() {
  // Centralized state
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [marketData, setMarketData] = useState(null);
  const [orderBookData, setOrderBookData] = useState({ asks: [], bids: [] });
  const [tradesData, setTradesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Available tokens list
  const [availableTokens, setAvailableTokens] = useState([]);

  // Centralized API calls
  const fetchMarketData = useCallback(async () => {
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
        
        // Set available tokens
        setAvailableTokens(universe.map(token => ({
          symbol: token.name,
          maxLeverage: token.maxLeverage,
          szDecimals: token.szDecimals
        })));

        // Find selected token data
        const tokenIndex = universe.findIndex(token => token.name === selectedSymbol);
        
        if (tokenIndex !== -1 && assetCtxs[tokenIndex]) {
          const assetCtx = assetCtxs[tokenIndex];
          const tokenMeta = universe[tokenIndex];
          
          // Calculate 24h change
          const prevPrice = parseFloat(assetCtx.prevDayPx);
          const currentPrice = parseFloat(assetCtx.markPx);
          const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

          // Set market data for TokenData component
          setMarketData({
            symbol: tokenMeta.name,
            name: getTokenName(tokenMeta.name),
            price: parseFloat(assetCtx.markPx),
            oraclePrice: parseFloat(assetCtx.oraclePx),
            change24h: change24h,
            volume24h: parseFloat(assetCtx.dayNtlVlm),
            openInterest: parseFloat(assetCtx.openInterest),
            funding: parseFloat(assetCtx.funding),
            prevDayPx: parseFloat(assetCtx.prevDayPx),
            dayNtlVlm: parseFloat(assetCtx.dayNtlVlm),
            premium: parseFloat(assetCtx.premium),
            midPx: parseFloat(assetCtx.midPx),
            maxLeverage: tokenMeta.maxLeverage,
            szDecimals: tokenMeta.szDecimals,
            onlyIsolated: tokenMeta.onlyIsolated || false
          });
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [selectedSymbol]);

  const fetchOrderBook = useCallback(async () => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'l2Book',
          coin: selectedSymbol
        })
      });

      if (!response.ok) throw new Error('Failed to fetch order book');

      const data = await response.json();
      
      if (data && data.levels && data.levels.length >= 2) {
        // levels[0] = bids, levels[1] = asks
        const bids = data.levels[0]
          .map(level => ({
            price: parseFloat(level.px),
            amount: parseFloat(level.sz),
            total: 0
          }))
          .sort((a, b) => b.price - a.price);

        const asks = data.levels[1]
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
      }
    } catch (err) {
      console.error('Error fetching order book:', err);
    }
  }, [selectedSymbol]);

  const fetchTrades = useCallback(async () => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'recentTrades',
          coin: selectedSymbol
        })
      });

      if (!response.ok) throw new Error('Failed to fetch trades');

      const data = await response.json();
      
      if (data && Array.isArray(data)) {
        const formattedTrades = data.map(trade => ({
          price: parseFloat(trade.px),
          size: parseFloat(trade.sz),
          side: trade.side,
          time: new Date(trade.time),
          ago: formatTimeAgo(trade.time)
        }));
        
        setTradesData(formattedTrades);
      }
    } catch (err) {
      console.error('Error fetching trades:', err);
    }
  }, [selectedSymbol]);

  // Helper functions
  const getTokenName = (coin) => {
    const names = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum', 
      'SOL': 'Solana',
      'ADA': 'Cardano',
      'DOT': 'Polkadot',
      'AVAX': 'Avalanche',
      'LINK': 'Chainlink',
      'MATIC': 'Polygon',
      'DOGE': 'Dogecoin'
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

  // Symbol change handler
  const handleSymbolChange = (newSymbol) => {
    setSelectedSymbol(newSymbol);
  };

  // Initial data fetch and polling
  useEffect(() => {
    fetchMarketData();
    fetchOrderBook();
    fetchTrades();
    
    // Poll every 2 seconds for real-time updates
    const interval = setInterval(() => {
      fetchMarketData();
      fetchOrderBook(); 
      fetchTrades();
    }, 200000);
    
    return () => clearInterval(interval);
  }, [fetchMarketData, fetchOrderBook, fetchTrades]);

  if (loading) {
    return (
      <div className='min-h-screen  flex items-center justify-center'>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen  flex items-center justify-center'>
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className='min-h-screen k'>
      {/* Token Data Bar */}
      <TokenData 
        marketData={marketData}
        selectedSymbol={selectedSymbol}
        availableTokens={availableTokens}
        onSymbolChange={handleSymbolChange}
        className="w-full"
      />
      
      {/* Main Trading Interface */}
      <div className="flex">
        {/* Chart Area */}
        <div className="flex-1">
          <TradingViewChart 
            symbol={`${selectedSymbol}USD`}
            onSymbolChange={handleSymbolChange}
          />
        </div>
        
        {/* Order Book & Trades */}
        <OrderBook 
          selectedSymbol={selectedSymbol}
          orderBookData={orderBookData}
          tradesData={tradesData}
          className="w-[400px] h-[600px] border-l border-white/20"
        />

        <TradingPanel 
  selectedSymbol={selectedSymbol}
  marketData={marketData}
  className="w-80 h-full"
/>
      </div>
    </div>
  );
}

export default TradingPage;