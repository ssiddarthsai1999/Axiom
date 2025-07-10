// components/TokenData.js
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react';
import numeral from 'numeral';

const TokenData = ({ 
  marketData, 
  selectedSymbol, 
  availableTokens = [], 
  onSymbolChange, 
  className = '' 
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fundingCountdown, setFundingCountdown] = useState('00:00:00');

  // Calculate funding countdown
  const calculateFundingCountdown = () => {
    const now = new Date();
    const fundingHours = [0, 8, 16];
    const currentTime = now.getTime();
    let nextFundingTime = null;
    
    for (const hour of fundingHours) {
      const fundingTime = new Date(now);
      fundingTime.setUTCHours(hour, 0, 0, 0);
      
      if (fundingTime.getTime() > currentTime) {
        nextFundingTime = fundingTime;
        break;
      }
    }
    
    if (!nextFundingTime) {
      nextFundingTime = new Date(now);
      nextFundingTime.setUTCDate(now.getUTCDate() + 1);
      nextFundingTime.setUTCHours(0, 0, 0, 0);
    }
    
    const timeDiff = nextFundingTime.getTime() - currentTime;
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      setFundingCountdown(calculateFundingCountdown());
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Filter tokens based on search
  const filteredTokens = availableTokens.filter(token => 
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTokenSelect = (symbol) => {
    onSymbolChange(symbol);
    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  // Navigate to previous/next token
  const navigateToken = (direction) => {
    const currentIndex = availableTokens.findIndex(token => token.symbol === selectedSymbol);
    let newIndex;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : availableTokens.length - 1;
    } else {
      newIndex = currentIndex < availableTokens.length - 1 ? currentIndex + 1 : 0;
    }
    
    if (availableTokens[newIndex]) {
      onSymbolChange(availableTokens[newIndex].symbol);
    }
  };

  if (!marketData) {
    return (
      <div className={`bg-gray-900 text-white p-4 ${className}`}>
        <div className="flex items-center space-x-4">
          <div className="w-16 h-6 bg-gray-800 rounded animate-pulse"></div>
          <div className="w-24 h-6 bg-gray-800 rounded animate-pulse"></div>
          <div className="w-20 h-6 bg-gray-800 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 text-white p-4 border-b border-gray-800 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left: Navigation and Token Info */}
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigateToken('prev')}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          {/* Token Selector */}
          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 hover:bg-gray-800 px-3 py-2 rounded transition-colors"
            >
              <span className="text-lg font-bold">{marketData.symbol}</span>
              <span className="text-sm text-gray-400">{marketData.name}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {/* Dropdown */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
                <div className="p-3 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tokens..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-10 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleTokenSelect(token.symbol)}
                      className={`w-full flex items-center justify-between p-3 hover:bg-gray-700 transition-colors ${
                        selectedSymbol === token.symbol ? 'bg-gray-700' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {token.symbol.charAt(0)}
                          </span>
                        </div>
                        <div className="text-left">
                          <div className="text-white font-medium">{token.symbol}</div>
                          <div className="text-gray-400 text-sm">Max: {token.maxLeverage}x</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-2xl font-bold font-mono">
              {numeral(marketData.price).format('0,0.00')}
            </span>
            <span className={`text-sm font-medium ${
              marketData.change24h >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
            </span>
          </div>

          <button 
            onClick={() => navigateToken('next')}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Market Data */}
        <div className="flex items-center space-x-8 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-gray-400">Oracle Price</span>
            <span className="font-mono">{numeral(marketData.oraclePrice).format('0,0.00')}</span>
          </div>
          
          <div className="flex flex-col items-center">
            <span className="text-gray-400">24h Volume</span>
            <span className="font-mono">${numeral(marketData.volume24h / 1000000).format('0.00')}B</span>
          </div>
          
          <div className="flex flex-col items-center">
            <span className="text-gray-400">Open Interest</span>
            <span className="font-mono">${numeral(marketData.openInterest * marketData.price / 1000000000).format('0.00')}B</span>
          </div>
          
          <div className="flex flex-col items-center">
            <span className="text-gray-400">Funding / Countdown</span>
            <div className="flex items-center space-x-2">
              <span className={`font-mono ${
                marketData.funding >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {marketData.funding >= 0 ? '+' : ''}{(marketData.funding * 100).toFixed(5)}%
              </span>
              <span className="text-green-400 font-mono">
                {fundingCountdown}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenData;