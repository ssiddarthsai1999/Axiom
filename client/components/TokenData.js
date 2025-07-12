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

// Close dropdown when clicking outside
useEffect(() => {
  const handleClickOutside = (event) => {
    if (isDropdownOpen && !event.target.closest('.token-dropdown')) {
      setIsDropdownOpen(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [isDropdownOpen]);

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
      <div className={`bg-[#0d0c0e] text-white p-4 ${className}`}>
        <div className="flex items-center space-x-4">
          <div className="w-16 h-6 bg-gray-800 rounded animate-pulse"></div>
          <div className="w-24 h-6 bg-gray-800 rounded animate-pulse"></div>
          <div className="w-20 h-6 bg-gray-800 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#0d0c0e] text-white p-4  font-mono ${className}`}>
      <div className="flex items-center justify-between gap-10">
        {/* Left: Navigation and Token Info */}
        <div className="flex items-center space-x-4">

          
          {/* Token Selector */}
          <div className="relative">
<button 
 onClick={() => setIsDropdownOpen(!isDropdownOpen)}
 className="flex items-center space-x-2 hover:brightness-150 duration-150 ease-in px-3 py-2 rounded cursor-pointer transition-colors"
>
 <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
   <span className="text-xs font-bold text-white">
     {marketData.symbol.charAt(0)}
   </span>
 </div>
 <span className="text-[#E5E5E5] font-[500] text-[18px] leading-[23px] tracking-[-0.36px]">{marketData.symbol}</span>
  <span className="text-[#65FB9E] bg-[#4FFFAB33] px-3 py-1 rounded-md font-[500] text-[18px] leading-[23px] tracking-[-0.36px]">{marketData.maxLeverage}x</span>
 <ChevronDown className="w-4 h-4 text-white ml-3" />
</button>
            
            {/* Dropdown */}
            {isDropdownOpen && (
              <div className="absolute  token-dropdown top-full left-0 mt-1 w-80 bg-[#0d0c0e] border border-gray-700 rounded-lg shadow-lg z-50">
                <div className="p-3 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tokens..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-[#181a20] border border-gray-600 rounded px-10 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleTokenSelect(token.symbol)}
                      className={`w-full flex items-center justify-between p-3 hover:bg-[#2c303b] cursor-pointer transition-colors ${
                        selectedSymbol === token.symbol ? 'bg-[#181a20]' : ''
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




        </div>

        {/* Right: Market Data */}
                  <div className="flex flex-col items-start space-x-1 gap-0">
            <span className="text-[#E5E5E5] font-[500] text-[18px] leading-[23px] tracking-[-0.36px]">
              {numeral(marketData.price).format('0,0.00')}
            </span>
            <span className={`font-mono  font-[400] text-[12px] leading-[17px] tracking-[0px] ${
              marketData.change24h >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
            }`}>
              {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-col items-start gap-2">
            <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] ">Oracle Price</span>
            <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">{numeral(marketData.oraclePrice).format('0,0.00')}</span>
          </div>
          
          <div className="flex flex-col items-start gap-2">
            <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] font-mono">24h Volume</span>
            <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">${numeral(marketData.volume24h / 1000000).format('0.00')}B</span>
          </div>
          
          <div className="flex flex-col items-start gap-2">
            <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] ">Open Interest</span>
            <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">${numeral(marketData.openInterest * marketData.price / 1000000000).format('0.00')}B</span>
          </div>
          
          <div className="flex flex-col items-start gap-2">
            <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] ">Funding / Countdown</span>
            <div className="flex items-start space-x-2">
              <span className={`font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px] ${
                marketData.funding >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {marketData.funding >= 0 ? '+' : ''}{(marketData.funding * 100).toFixed(5)}%
              </span>
              <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">
                {fundingCountdown}
              </span>
            </div>
          </div>
   
      </div>
    </div>
  );
};

export default TokenData;