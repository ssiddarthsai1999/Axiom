// components/TokenData.js
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Search, Star } from 'lucide-react';
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
  const [favorites, setFavorites] = useState(new Set());

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

  // Toggle favorite
  const toggleFavorite = (symbol, e) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(symbol)) {
      newFavorites.delete(symbol);
    } else {
      newFavorites.add(symbol);
    }
    setFavorites(newFavorites);
  };

  // Format volume for display
  const formatVolume = (volume) => {
    if (!volume || volume === 0) return '$0.00';
    
    if (volume >= 1e9) {
      return `${numeral(volume / 1e9).format('0.00')}B`;
    } else if (volume >= 1e6) {
      return `${numeral(volume / 1e6).format('0.00')}M`;
    } else if (volume >= 1e3) {
      return `${numeral(volume / 1e3).format('0.00')}K`;
    }
    return `${numeral(volume).format('0.00')}`;
  };

  // Format funding rate (convert hourly to 8-hour rate)
  const formatFunding = (funding) => {
    if (!funding && funding !== 0) return '0.00000%';
    // Hyperliquid API returns hourly funding rate, multiply by 8 for 8-hour display
    const eightHourRate = funding * 8;
    const percentage = eightHourRate * 100;
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(5)}%`;
  };

  // Format price change (amount + percentage)
  const formatPriceChange = (currentPrice, change24h) => {
    if (!currentPrice || (!change24h && change24h !== 0)) return { amount: '0.00', percentage: '0.00%' };
    
    const changeAmount = (currentPrice * change24h) / 100;
    const changePercentage = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
    const changeAmountFormatted = `${change24h >= 0 ? '+' : ''}${changeAmount.toFixed(2)}`;
    
    return { amount: changeAmountFormatted, percentage: changePercentage };
  };

  const getTokenLogo = (symbol) => {
    const tokenMapping = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum', 
      'SOL': 'solana',
      'AVAX': 'avalanche-2',
      'DOGE': 'dogecoin',
      'ADA': 'cardano',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'XRP': 'ripple',
      'TRX': 'tron',
      'BCH': 'bitcoin-cash',
      'ETC': 'ethereum-classic',
      'FIL': 'filecoin',
      'APT': 'aptos',
      'SUI': 'sui',
      'NEAR': 'near',
      'ICP': 'internet-computer',
      'ARB': 'arbitrum',
      'OP': 'optimism',
      'HBAR': 'hedera-hashgraph',
      'VET': 'vechain',
      'STX': 'stacks',
      'IMX': 'immutable-x',
      'INJ': 'injective-protocol',
      'TIA': 'celestia',
      'SEI': 'sei-network',
      'WLD': 'worldcoin-wld',
      'ORDI': 'ordi',
      'BLUR': 'blur',
      'PEPE': 'pepe',
      'BONK': 'bonk',
      'WIF': 'dogwifcoin',
      'MEME': 'memecoin',
      'FLOKI': 'floki',
      'SHIB': 'shiba-inu'
    };
    
    const coinId = tokenMapping[symbol] || symbol.toLowerCase();
    return `https://assets.coingecko.com/coins/images/1/small/${coinId}.png`;
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
    <div className={`bg-[#0d0c0e] text-white p-4 font-mono ${className}`}>
      {/* Mobile Layout */}
      <div className="block md:hidden">
        {/* Top Section: Token Info with Price */}
        <div className="flex items-center justify-between mb-4">
          {/* Token Selector */}
          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 hover:brightness-150 duration-150 ease-in px-3 py-2 rounded cursor-pointer transition-colors"
            >
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                <img 
                  src={getTokenLogo(marketData.symbol)} 
                  alt={marketData.symbol}
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <span className="text-sm font-bold text-white hidden">
                  {marketData.symbol.charAt(0)}
                </span>
              </div>
              <span className="text-[#E5E5E5] font-[500] text-[18px] font-mono leading-[23px] tracking-[-0.36px]">{marketData.symbol}</span>
              <span className="text-[#65FB9E] bg-[#4FFFAB33] px-2 py-1 rounded-md font-[500] text-[14px] leading-[18px] tracking-[-0.36px]">{marketData.maxLeverage}x</span>
              <Star 
                className={`w-4 h-4 cursor-pointer transition-colors ${
                  favorites.has(marketData.symbol) 
                    ? 'text-yellow-400 fill-yellow-400' 
                    : 'text-gray-600 hover:text-yellow-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(marketData.symbol, e);
                }}
              />
              <ChevronDown className="w-4 h-4 text-white" />
            </button>
            
            {/* Dropdown - same as desktop but adjusted for mobile */}
            {isDropdownOpen && (
              <div className="absolute token-dropdown top-full left-0 mt-1 w-[calc(100vw-2rem)] max-w-[600px] bg-[#0d0c0e] border border-[#1F1E23] rounded-xl shadow-lg z-50">
                {/* Search Header */}
                <div className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search name or paste address"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent border font-mono border-[#FAFAFA33] placeholder:text-[#919093] rounded-xl px-10 py-3 text-white text-[14px] font-[500] leading-[100%] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Mobile Token List - Simplified */}
                <div className="max-h-60 overflow-y-auto">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleTokenSelect(token.symbol)}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1b23] cursor-pointer transition-colors text-sm border-b border-[#1F1E23] last:border-b-0 ${
                        selectedSymbol === token.symbol ? 'bg-[#1a1b23]' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Star 
                          className={`w-4 h-4 cursor-pointer transition-colors ${
                            favorites.has(token.symbol) 
                              ? 'text-yellow-400 fill-yellow-400' 
                              : 'text-gray-600 hover:text-yellow-400'
                          }`}
                          onClick={(e) => toggleFavorite(token.symbol, e)}
                        />
                        <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                          <img 
                            src={getTokenLogo(token.symbol)} 
                            alt={token.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <span className="text-xs font-bold text-white hidden">
                            {token.symbol.charAt(0)}
                          </span>
                        </div>
                        <span className="text-white font-medium">{token.symbol}</span>
                        <span className="text-[#65FB9E] bg-[#65FB9E]/20 px-2 py-0.5 rounded text-xs font-medium">
                          {token.maxLeverage}x
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-[#E5E5E5] font-mono text-sm">
                          {token.price ? numeral(token.price).format('0,0.000') : 'N/A'}
                        </div>
                        <div className={`font-mono text-xs ${
                          (token.change24h || 0) >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
                        }`}>
                          {formatPriceChange(token.price, token.change24h).percentage}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price and Change */}
          <div className="text-right">
            <div className="flex items-center space-x-2">
              <span className={`font-mono font-[400] text-[12px] leading-[17px] tracking-[0px] ${
                marketData.change24h >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
              }`}>
                {formatPriceChange(marketData.price, marketData.change24h).percentage}
              </span>
              <span className="text-[#E5E5E5] font-[500] text-[24px] leading-[30px] tracking-[-0.48px]">
                {numeral(marketData.price).format('0,0')}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Section: Market Data Grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">Mark Price</div>
            <div className="font-mono text-[#E5E5E5] font-[400] text-[14px] leading-[20px] tracking-[0px]">
              {numeral(marketData.price).format('0,0')}
            </div>
          </div>
          
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">Oracle Price</div>
            <div className="font-mono text-[#E5E5E5] font-[400] text-[14px] leading-[20px] tracking-[0px]">
              {numeral(marketData.oraclePrice).format('0,0')}
            </div>
          </div>
          
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">24h Volume</div>
            <div className="font-mono text-[#E5E5E5] font-[400] text-[14px] leading-[20px] tracking-[0px]">
              {formatVolume(marketData.volume24h)}
            </div>
          </div>
          
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">Open Interest</div>
            <div className="font-mono text-[#E5E5E5] font-[400] text-[14px] leading-[20px] tracking-[0px]">
              {formatVolume(marketData.openInterest * marketData.price)}
            </div>
          </div>
          
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">Funding</div>
            <div className={`font-mono font-[400] text-[14px] leading-[20px] tracking-[0px] ${
              marketData.funding >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
            }`}>
              {formatFunding(marketData.funding)}
            </div>
          </div>
          
          <div>
            <div className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] mb-1">Countdown</div>
            <div className="font-mono text-[#E5E5E5] font-[400] text-[14px] leading-[20px] tracking-[0px]">
              {fundingCountdown}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Original */}
      <div className="hidden md:flex flex-wrap items-center 2xl:justify-between gap-10">
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
              <span className="text-[#E5E5E5] font-[500] text-[18px] font-mono leading-[23px] tracking-[-0.36px]">{marketData.symbol}</span>
              <span className="text-[#65FB9E] bg-[#4FFFAB33] px-3 py-1 rounded-md font-[500] text-[18px] leading-[23px] tracking-[-0.36px]">{marketData.maxLeverage}x</span>
              <Star 
                className={`w-4 h-4 cursor-pointer transition-colors ${
                  favorites.has(marketData.symbol) 
                    ? 'text-yellow-400 fill-yellow-400' 
                    : 'text-gray-600 hover:text-yellow-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(marketData.symbol, e);
                }}
              />
              <ChevronDown className="w-4 h-4 text-white ml-3" />
            </button>
            
            {/* Enhanced Dropdown */}
            {isDropdownOpen && (
              <div className="absolute token-dropdown top-full left-0 mt-1 w-[900px] bg-[#0d0c0e] border border-[#1F1E23] rounded-xl shadow-lg z-50">
                {/* Search Header */}
                <div className="p-4 ">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search name or paste address"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent border font-mono border-[#FAFAFA33] placeholder:text-[#919093] rounded-xl px-10 py-3 text-white text-[14px] font-[500] leading-[100%] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Table Header - Now aligned with data */}
                <div className="px-4 py-3 border-b border-[#1F1E23]">
                  <div className="flex text-sm text-[#919093] text-[12px] font-[400] leading-[24px]">
                    <div className="w-full  text-left">Symbol</div>
                    <div className="w-full text-center">Last Price</div>
                    <div className="w-full text-center">24hr Change</div>
                    <div className="w-full text-center">8hr Funding</div>
                    <div className="w-full text-center">Volume 
                      <span className="ml-1">↓</span>
                    </div>
                    <div className="w-full text-center">Open Interest</div>
                  </div>
                </div>

                {/* Token List */}
                <div className="max-h-80 overflow-y-auto">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleTokenSelect(token.symbol)}
                      className={`w-full flex items-center px-4 py-3 hover:bg-[#1a1b23] cursor-pointer transition-colors text-sm border-b border-[#1F1E23] last:border-b-0 ${
                        selectedSymbol === token.symbol ? 'bg-[#1a1b23]' : ''
                      }`}
                    >
                      {/* Symbol with Icon, Star and Leverage */}
                      <div className="w-full min-w-[150px] flex items-center  space-x-3">
                        <Star 
                          className={`min-w-4 min-h-4 w-4 h-4 cursor-pointer transition-colors ${
                            favorites.has(token.symbol) 
                              ? 'text-yellow-400 fill-yellow-400' 
                              : 'text-gray-600 hover:text-yellow-400'
                          }`}
                          onClick={(e) => toggleFavorite(token.symbol, e)}
                        />
                        <div className="min-w-6 min-h-6 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                          <img 
                            src={getTokenLogo(token.symbol)} 
                            alt={token.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <span className="text-xs font-bold text-white hidden">
                            {token.symbol.charAt(0)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-medium">{token.symbol}</span>
                          <span className="text-[#65FB9E] bg-[#65FB9E]/20 px-2 py-0.5 rounded text-xs font-medium">
                            {token.maxLeverage}x
                          </span>
                        </div>
                      </div>

                      {/* Last Price */}
                      <div className="w-full text-center text-[#E5E5E5] font-mono text-[12px] font-[400] leading-[24px] ">
                        {token.price ? numeral(token.price).format('0,0.000') : 'N/A'}
                      </div>

                      {/* 24hr Change */}
                      <div className={`w-full text-center  font-mono text-[12px] font-[400] leading-[24px] ${
                        (token.change24h || 0) >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
                      }`}>
                        <div className="text-sm">{formatPriceChange(token.price, token.change24h).amount} / {formatPriceChange(token.price, token.change24h).percentage}</div>
                      </div>

                      {/* 8hr Funding */}
                      <div className={`w-full text-center text-[#E5E5E5] font-mono text-[12px] font-[400] leading-[24px] ${
                        (token.funding || 0) >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
                      }`}>
                        <div className="text-sm">{formatFunding(token.funding)}</div>
                      </div>

                      {/* Volume */}
                      <div className="w-full text-center text-[#E5E5E5] font-mono text-[12px] font-[400] leading-[24px]">
                        <div className="text-sm">{formatVolume(token.volume24h)}</div>
                      </div>

                      {/* Open Interest */}
                      <div className="w-full text-center text-[#E5E5E5] font-mono text-[12px] font-[400] leading-[24px]">
                        <div className="text-sm">{formatVolume((token.openInterest || 0) * (token.price || 0))}</div>
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
          <span className={`font-mono font-[400] text-[12px] leading-[17px] tracking-[0px] ${
            marketData.change24h >= 0 ? 'text-[#65FB9E]' : 'text-red-400'
          }`}>
            <div>{formatPriceChange(marketData.price, marketData.change24h).amount} / {formatPriceChange(marketData.price, marketData.change24h).percentage}</div>
          </span>
        </div>

        <div className="flex flex-col items-start gap-2">
          <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px]">Oracle Price</span>
          <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">
            {numeral(marketData.oraclePrice).format('0,0.00')}
          </span>
        </div>
        
        <div className="flex flex-col items-start gap-2">
          <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px] font-mono">24h Volume</span>
          <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">
            {formatVolume(marketData.volume24h)}
          </span>
        </div>
        
        <div className="flex flex-col items-start gap-2">
          <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px]">Open Interest</span>
          <span className="font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px]">
            {formatVolume(marketData.openInterest * marketData.price)}
          </span>
        </div>
        
        <div className="flex flex-col items-start gap-2">
          <span className="text-[#919093] font-[400] text-[11px] leading-[16px] tracking-[-0.12px]">Funding / Countdown</span>
          <div className="flex items-start space-x-2">
            <span className={`font-mono text-[#E5E5E5] font-[400] text-[12px] leading-[17px] tracking-[0px] ${
              marketData.funding >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatFunding(marketData.funding)}
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