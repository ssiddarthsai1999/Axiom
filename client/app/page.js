"use client"
import React, { useState, useEffect, useCallback } from 'react'
import TradingViewChart from '@/components/TradingViewChart'
import OrderBook from '@/components/OrderBook'
import TokenData from '@/components/TokenData'
import TradingPanel from '@/components/TradingPanel'
import UserPositions from '@/components/UserPositions'
import SimpleAtomTrader from '@/components/SimpleAtomTrader'

function TradingPage() {
  // Centralized state
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [marketData, setMarketData] = useState(null);
  const [orderBookData, setOrderBookData] = useState({ asks: [], bids: [] });
  const [tradesData, setTradesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Available tokens list with enhanced market data
  const [availableTokens, setAvailableTokens] = useState([]);

  // Store all market data for quick access
  const [allMarketData, setAllMarketData] = useState([]);

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
        
        // Process all tokens with enhanced market data
        const processedTokens = universe.map((token, index) => {
          const assetCtx = assetCtxs[index];
          
          if (!assetCtx) return null;
          
          // Calculate 24h change
          const prevPrice = parseFloat(assetCtx.prevDayPx);
          const currentPrice = parseFloat(assetCtx.markPx);
          const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
          
          return {
            symbol: token.name,
            maxLeverage: token.maxLeverage,
            szDecimals: token.szDecimals,
            onlyIsolated: token.onlyIsolated || false,
            
            // Market data for dropdown display
            price: parseFloat(assetCtx.markPx),
            oraclePrice: parseFloat(assetCtx.oraclePx),
            change24h: change24h,
            volume24h: parseFloat(assetCtx.dayNtlVlm),
            openInterest: parseFloat(assetCtx.openInterest),
            funding: parseFloat(assetCtx.funding),
            prevDayPx: parseFloat(assetCtx.prevDayPx),
            premium: parseFloat(assetCtx.premium),
            midPx: parseFloat(assetCtx.midPx),
            
            // Full asset context for reference
            fullAssetCtx: assetCtx
          };
        }).filter(Boolean); // Remove null entries
        
        // Sort by volume (highest first) for better UX
        const sortedTokens = processedTokens.sort((a, b) => b.volume24h - a.volume24h);
        
        // Set available tokens for dropdown
        setAvailableTokens(sortedTokens);
        setAllMarketData(sortedTokens);

        // Find and set current selected token data
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
      'DOGE': 'Dogecoin',
      'XRP': 'Ripple',
      'LTC': 'Litecoin',
      'BCH': 'Bitcoin Cash',
      'UNI': 'Uniswap',
      'ATOM': 'Cosmos',
      'FTM': 'Fantom',
      'NEAR': 'Near Protocol',
      'ALGO': 'Algorand',
      'VET': 'VeChain',
      'ICP': 'Internet Computer',
      'FIL': 'Filecoin'
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

  // Enhanced symbol change handler
  const handleSymbolChange = useCallback((newSymbol) => {
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
  }, [allMarketData]);

  // Separate effect for order book and trades when symbol changes
  useEffect(() => {
    if (selectedSymbol && !loading) {
      fetchOrderBook();
      fetchTrades();
    }
  }, [selectedSymbol, fetchOrderBook, fetchTrades, loading]);

  // Initial data fetch and polling
  useEffect(() => {
    fetchMarketData();
    
    // Poll every 30 seconds for market data updates
    const marketDataInterval = setInterval(() => {
      fetchMarketData();
    }, 30000);
    
    // Poll every 2 seconds for order book and trades (more frequent)
    const realtimeInterval = setInterval(() => {
      if (!loading) {
        fetchOrderBook();
        fetchTrades();
      }
    }, 20000);
    
    return () => {
      clearInterval(marketDataInterval);
      clearInterval(realtimeInterval);
    };
  }, [fetchMarketData, fetchOrderBook, fetchTrades, loading]);

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#0d0c0e]'>
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-400 text-sm">Loading market data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#0d0c0e]'>
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Error loading data</div>
          <div className="text-gray-400 text-sm">{error}</div>
          <button 
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchMarketData();
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

return (
  <div className='min-h-screen bg-[#0d0c0e] flex'>
    {/* Left and Middle Section Container */}
    <div className='flex flex-col flex-1 min-w-0'>
      {/* Top Row: TokenData + Chart + OrderBook */}
      <div className='flex flex-1 min-h-0'>
        {/* Left Section: TokenData + Chart */}
        <div className='flex flex-col flex-1 min-w-0'>
          {/* Token Data Header */}
          <TokenData 
            marketData={marketData}
            selectedSymbol={selectedSymbol}
            availableTokens={availableTokens}
            onSymbolChange={handleSymbolChange}
            className="shrink-0"
          />
          
          {/* Chart Section */}
          <div className='flex flex-1 w-full min-h-0'>
            <TradingViewChart 
              symbol={`${selectedSymbol}USD`}
              onSymbolChange={handleSymbolChange}
              className="flex-1 w-full"
            />
          </div>
        </div>

        {/* Middle Section: Order Book */}
        <div className='w-80 flex-shrink-0 border-l border-r border-[#1F1E23]'>
          <OrderBook 
            selectedSymbol={selectedSymbol}
            orderBookData={orderBookData}
            tradesData={tradesData}
            className="h-full"
          />
        </div>
      </div>

      {/* Bottom Section: User Positions (spans only under chart + orderbook) */}
      <div className='border-t border-[#1F1E23] shrink-0'>
        <UserPositions />
      </div>
    </div>

    {/* Right Section: Trading Panel (full height) */}
    <div className='w-[320px] flex-shrink-0 border-l border-[#1F1E23]'>
      <TradingPanel 
        selectedSymbol={selectedSymbol}
        marketData={marketData}
        className="h-full"
      />
    </div>
  </div>
);
}

export default TradingPage;