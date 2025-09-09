// components/FavoritesTicker.js
"use client"
import React, { useState, useEffect } from 'react';
import Marquee from 'react-fast-marquee';
import { Star } from 'lucide-react';
import { getTokenLogo } from '@/utils/getTokenLogo';

const FavoritesTicker = ({selectedSymbol, setSelectedSymbol }) => {
  const [favoritesData, setFavoritesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fake favorites array for now - later this will come from user settings/API
  const favorites = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOGE', 'ADA', 'DOT'];

  // Fetch market data from Hyperliquid API
  const fetchFavoritesData = async () => {
    try {
      setLoading(true);
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
        
        // Filter only favorite tokens
        const favoriteTokens = universe
          .map((token, index) => {
            const assetCtx = assetCtxs[index];
            if (!assetCtx || !favorites.includes(token.name)) return null;
            
            // Calculate 24h change
            const prevPrice = parseFloat(assetCtx.prevDayPx);
            const currentPrice = parseFloat(assetCtx.markPx);
            const change24h = currentPrice - prevPrice;
            
            return {
              symbol: token.name,
              price: parseFloat(assetCtx.markPx),
              change24h: change24h,
              volume24h: parseFloat(assetCtx.dayNtlVlm),
              logo: getTokenLogo(token.name),
              name: getTokenName(token.name)
            };
          })
          .filter(Boolean) // Remove null entries
          .sort((a, b) => favorites.indexOf(a.symbol) - favorites.indexOf(b.symbol)); // Sort by favorites order

        setFavoritesData(favoriteTokens);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching favorites data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Helper function to get token names
  const getTokenName = (symbol) => {
    const names = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana',
      'AVAX': 'Avalanche',
      'LINK': 'Chainlink',
      'DOGE': 'Dogecoin',
      'ADA': 'Cardano',
      'DOT': 'Polkadot',
      'MATIC': 'Polygon',
      'UNI': 'Uniswap',
      'ATOM': 'Cosmos',
      'FTM': 'Fantom',
      'NEAR': 'Near Protocol',
      'ALGO': 'Algorand',
      'VET': 'VeChain',
      'ICP': 'Internet Computer',
      'FIL': 'Filecoin',
      'LTC': 'Litecoin',
      'BCH': 'Bitcoin Cash',
      'XRP': 'Ripple'
    };
    return names[symbol] || symbol;
  };

  // Format price with appropriate decimals
  const formatPrice = (price) => {
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else if (price >= 1) {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    } else {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
    }
  };

  // Format percentage change
  const formatPercentage = (change) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  // Fetch data on mount and set up polling
  useEffect(() => {
    fetchFavoritesData();
    
    // Poll every 30 seconds
    // const interval = setInterval(fetchFavoritesData, 300000);
    
    // return () => clearInterval(interval);
  }, []);

  // Individual ticker item component
  const TickerItem = ({ token }) => (
    <div className="flex items-center space-x-2 px-5 py-1 cursor-pointer hover:brightness-125 duration-150 ease-in mx-2 min-w-fit" onClick={()=>setSelectedSymbol(token.symbol)}>
      {/* Star icon */}
      <Star 
        size={14} 
        className="text-yellow-400 fill-yellow-400 cursor-pointer" 
      />
      
      {/* Token logo */}
      <div className="w-5 h-5 flex items-center justify-center">
        <img 
          src={token.logo} 
          alt={`${token.symbol} logo`}
          className="w-full h-full object-contain"
          onError={(e) => {
            // Fallback to first letter if image fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <span 
          className="text-lg font-bold font-mono text-white hidden"
          style={{ display: 'none' }}
        >
          {token.symbol.charAt(0)}
        </span>
      </div>
      
      {/* Symbol */}
      <span className="text-[#919093] font-mono font-[500] leading-[16px] text-[12px]">
        {token.symbol}
      </span>
      
      {/* Price */}
      <span className="text-[#919093] font-mono font-[500] leading-[16px] text-[12px]">
        {formatPrice(token.price)}
      </span>
      
      {/* Change percentage */}
      <span 
        className={`font-mono font-[500] leading-[16px] text-[12px] ${
          token.change24h >= 0 ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {formatPercentage(token.change24h)}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-[#0d0c0e] border-b border-[#1F1E23] py-2 ">
        <div className="flex items-center justify-center h-10">
          <div className="text-gray-400 text-sm">Loading favorites...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0d0c0e] border-b border-[#1F1E23] py-2">
        <div className="flex items-center justify-center h-10">
          <div className="text-red-400 text-sm">Error loading favorites: {error}</div>
        </div>
      </div>
    );
  }

  if (favoritesData.length === 0) {
    return (
      <div className="bg-[#0d0c0e] border-b border-[#1F1E23] py-2">
        <div className="flex items-center justify-center h-10">
          <div className="text-gray-400 text-sm">No favorites found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0c0e] border-b border-[#1F1E23] overflow-hidden py-1">
      <Marquee
        speed={50}
        loop={0}
        gradient={true}
        gradientColor={[13, 12, 14]} // RGB values for #0d0c0e
        gradientWidth={50}
        pauseOnHover={true}
        autoFill
        className=""
      >
        {favoritesData.map((token, index) => (
          <TickerItem key={`${token.symbol}-${index}`} token={token} />
        ))}
      </Marquee>
    </div>
  );
};

export default FavoritesTicker;