import React, { useState, useEffect, useCallback } from 'react';
import numeral from 'numeral';

const LimitCloseModal = ({ isOpen, onClose, position, currentPrice, webData2Data, getMidPriceFromWebData2, onConfirm }) => {
  const [limitPrice, setLimitPrice] = useState('');
  const [sizePercentage, setSizePercentage] = useState(100);
  const [customSize, setCustomSize] = useState('');
  const [estimatedPnl, setEstimatedPnl] = useState(0);
  const [assetInfo, setAssetInfo] = useState(null);
  const [sizeUnit, setSizeUnit] = useState('usd'); // 'coin' or 'usd'
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Convert between coin size and USD value
  const convertSizeToCoin = useCallback((usdValue) => {
    if (!currentPrice || !usdValue) return 0;
    return usdValue / currentPrice;
  }, [currentPrice]);

  const convertSizeToUSD = useCallback((coinValue) => {
    if (!currentPrice || !coinValue) return 0;
    return coinValue * currentPrice;
  }, [currentPrice]);

  // Initialize modal state when it opens
  useEffect(() => {
    if (isOpen && position) {
      // Start with empty limit price - user can click "Mid" to set it
      setLimitPrice('');
      setSizePercentage(100);
      setDontShowAgain(false);
      
      // Set USD value by default
      if (currentPrice) {
        const usdValue = convertSizeToUSD(Math.abs(position.size));
        setCustomSize(usdValue.toFixed(2));
      } else {
        // Fallback to coin size if no current price
        setCustomSize(Math.abs(position.size).toString());
      }
    }
  }, [isOpen, position, currentPrice, convertSizeToUSD]);

  // Get asset info from WebSocket data (only when position changes, not on every WS update)
  useEffect(() => {
    if (position?.coin && webData2Data?.meta?.universe) {
      const asset = webData2Data.meta.universe.find(token => token.name === position.coin);
      if (asset) {
        setAssetInfo({
          szDecimals: asset.szDecimals,
          onlyIsolated: asset.onlyIsolated || false,
          isSpot: false // Perpetuals are not spot
        });
        // console.log('✅ Asset info loaded from WebSocket for', position.coin, ':', {
        //   szDecimals: asset.szDecimals,
        //   onlyIsolated: asset.onlyIsolated
        // });
      } else {
        // Fallback if asset not found in WebSocket data
        setAssetInfo({
          szDecimals: 3,
          onlyIsolated: false,
          isSpot: false
        });
      }
    } else if (position?.coin) {
      // Fallback if WebSocket data not available
      setAssetInfo({
        szDecimals: 3,
        onlyIsolated: false,
        isSpot: false
      });
    }
  }, [position?.coin, webData2Data?.meta?.universe]);

  useEffect(() => {
    // Calculate estimated PNL
    if (position && limitPrice && customSize) {
      const closePrice = parseFloat(limitPrice);
      let closeSize = parseFloat(customSize);
      const entryPrice = position.entryPrice;
      
      // Convert USD to coin size if needed for PNL calculation
      if (sizeUnit === 'usd') {
        closeSize = convertSizeToCoin(closeSize);
      }
      
      if (closePrice && closeSize && entryPrice) {
        let pnl;
        if (position.side === 'Long') {
          pnl = (closePrice - entryPrice) * closeSize;
        } else {
          pnl = (entryPrice - closePrice) * closeSize;
        }
        setEstimatedPnl(pnl);
      }
    }
  }, [position, limitPrice, customSize, sizeUnit, currentPrice, convertSizeToCoin]);

  // Utility function to validate and format decimal places for SIZE
  const formatSizeToMaxDecimals = (value, szDecimals) => {
    if (!value || value === '') return value;
    
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    // Convert to string and check decimal places
    const valueStr = value.toString();
    const decimalIndex = valueStr.indexOf('.');
    
    if (decimalIndex === -1) {
      // No decimal point, return as is
      return valueStr;
    }
    
    const decimalPlaces = valueStr.length - decimalIndex - 1;
    if (decimalPlaces <= szDecimals) {
      // Already within limits
      return valueStr;
    }
    
    // Truncate to max decimal places
    return num.toFixed(szDecimals);
  };

  // Utility function to count significant figures
  const countSignificantFigures = (value) => {
    const cleanValue = parseFloat(value).toString();
    const scientificMatch = cleanValue.match(/^(\d+\.?\d*)e/);
    
    if (scientificMatch) {
      // Handle scientific notation
      const mantissa = scientificMatch[1].replace('.', '');
      return mantissa.length;
    }
    
    // Remove leading zeros and decimal point
    const withoutLeadingZeros = cleanValue.replace(/^0+/, '').replace('.', '');
    return withoutLeadingZeros.length;
  };

  // Calculate HyperLiquid-compatible tick size based on szDecimals
  const getHyperLiquidTickSize = (price, szDecimals) => {
    // HyperLiquid tick size is 1 unit at the allowed decimal precision
    const MAX_DECIMALS = 6; // For perpetuals (spot uses 8)
    const maxPriceDecimals = MAX_DECIMALS - szDecimals;
    const tickSize = Math.pow(10, -maxPriceDecimals);
    return tickSize;
  };

  // Round price to HyperLiquid tick size
  const roundToHyperLiquidTick = (price, szDecimals) => {
    const tickSize = getHyperLiquidTickSize(price, szDecimals);
    const rounded = Math.round(price / tickSize) * tickSize;
    
    // Ensure we don't have floating point precision issues
    const maxPriceDecimals = 6 - szDecimals;
    return parseFloat(rounded.toFixed(maxPriceDecimals));
  };

  // Utility function to validate and format decimal places for PRICE
  const formatPriceToMaxDecimals = (value, szDecimals, isSpot = false) => {
    if (!value || value === '') return value;
    
    let num = parseFloat(value);
    if (isNaN(num)) return value;
    
    const valueStr = value.toString();
    
    // Check significant figures limit (max 5)
    const sigFigs = countSignificantFigures(valueStr);
    if (sigFigs > 5) {
      // Truncate to 5 significant figures
      num = parseFloat(num.toPrecision(5));
    }
    
    // Apply HyperLiquid tick size rounding
    const tickRounded = roundToHyperLiquidTick(num, szDecimals);
    
    return tickRounded.toString();
  };

  const handlePercentageChange = (percentage) => {
    setSizePercentage(percentage);
    if (position) {
      const newCoinSize = (Math.abs(position.size) * percentage / 100);
      
      if (sizeUnit === 'usd') {
        // Calculate USD value based on percentage of position
        const usdValue = convertSizeToUSD(newCoinSize);
        setCustomSize(usdValue.toFixed(2)); // USD typically uses 2 decimal places
      } else {
        // Calculate coin size based on percentage
        const formattedSize = assetInfo 
          ? formatSizeToMaxDecimals(newCoinSize.toString(), assetInfo.szDecimals)
          : newCoinSize.toString();
        setCustomSize(formattedSize);
      }
    }
  };

  const handleSizeChange = (value) => {
    // Allow free typing - don't format immediately
    setCustomSize(value);
    
    if (position) {
      let coinSize = parseFloat(value);
      if (sizeUnit === 'usd') {
        coinSize = convertSizeToCoin(parseFloat(value));
      }
      const percentage = (coinSize / Math.abs(position.size)) * 100;
      setSizePercentage(Math.min(100, Math.max(0, percentage)));
    }
  };

  const handleSizeBlur = () => {
    // Format the value when user finishes typing (on blur)
    if (!customSize || customSize === '') return;
    
    let formattedValue = customSize;
    if (sizeUnit === 'usd') {
      // For USD, format to 2 decimal places
      const num = parseFloat(customSize);
      if (!isNaN(num)) {
        formattedValue = num.toFixed(2);
      }
    } else if (assetInfo) {
      // For coin, use asset-specific decimal formatting if available
      formattedValue = formatSizeToMaxDecimals(customSize, assetInfo.szDecimals);
    }
    
    setCustomSize(formattedValue);
  };

  const handleLimitPriceChange = (value) => {
    if (!assetInfo) {
      setLimitPrice(value);
      return;
    }
    
    const formattedValue = formatPriceToMaxDecimals(value, assetInfo.szDecimals, assetInfo.isSpot);
    setLimitPrice(formattedValue);
  };

  const handleMidPriceClick = () => {
    if (position && webData2Data && getMidPriceFromWebData2) {
      const midPrice = getMidPriceFromWebData2(webData2Data, position.coin);
      if (midPrice) {
        const formattedPrice = assetInfo 
          ? formatPriceToMaxDecimals(midPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot)
          : midPrice.toString();
        setLimitPrice(formattedPrice);
      }
    }
  };

  const handleSizeUnitChange = (unit) => {
    if (!customSize || !position) {
      setSizeUnit(unit);
      return;
    }

    let newValue;
    const currentValue = parseFloat(customSize);
    
    if (unit === 'usd') {
      // Converting from coin to USD
      if (sizeUnit === 'coin') {
        const usdValue = convertSizeToUSD(currentValue);
        newValue = usdValue.toFixed(2);
      } else {
        // Already USD, keep as is
        newValue = customSize;
      }
    } else {
      // Converting from USD to coin
      if (sizeUnit === 'usd') {
        const coinSize = convertSizeToCoin(currentValue);
        // Format with proper decimal places for the coin
        newValue = assetInfo 
          ? formatSizeToMaxDecimals(coinSize.toString(), assetInfo.szDecimals)
          : coinSize.toString();
      } else {
        // Already coin, keep as is
        newValue = customSize;
      }
    }
    
    setSizeUnit(unit);
    setCustomSize(newValue);
  };

  const formatNumber = (value, decimals = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return numeral(value).format(`0,0.${'0'.repeat(decimals)}`);
  };

  const handleConfirm = () => {
    // Validate inputs before submitting
    if (!position || !limitPrice || !customSize) {
      alert('Please fill in all required fields');
      return;
    }

    let sizeValue = parseFloat(customSize);
    const priceValue = parseFloat(limitPrice);

    // Convert USD to coin size if needed
    if (sizeUnit === 'usd') {
      sizeValue = convertSizeToCoin(sizeValue);
    }

    if (isNaN(sizeValue) || sizeValue <= 0) {
      alert('Please enter a valid size');
      return;
    }

    if (isNaN(priceValue) || priceValue <= 0) {
      alert('Please enter a valid price');
      return;
    }

    // Cap the size to the exact position size if it exceeds due to floating-point precision
    const positionSize = Math.abs(position.size);
    if (sizeValue > positionSize) {
      console.log('⚠️ Size exceeds position size, capping to exact position size');
      sizeValue = positionSize;
    }

    if (onConfirm) {
      console.log('🔄 Submitting limit close order...');
      onConfirm({
        symbol: position.coin,
        side: position.side === 'Long' ? 'Sell' : 'Buy', // Opposite side to close
        size: sizeValue,
        price: priceValue,
        type: 'limit',
        reduceOnly: true
      });
    }
    onClose();
  };

  if (!isOpen || !position) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#0d0c0e] border border-[#1F1E23] rounded-lg p-6 w-96 max-w-[90vw]">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-medium text-white">Limit Close</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-6">
          This will send an order to close your position at the limit price.
        </p>

        {/* Price Input */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Price (USD)</label>
          <div className="relative">
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => handleLimitPriceChange(e.target.value)}
              className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00D4AA]"
              placeholder="0.00"
              step="0.0001"
            />
            <button
              type="button"
              onClick={handleMidPriceClick}
              className="absolute right-3 top-2 text-[#00D4AA] text-sm hover:text-[#00B894] cursor-pointer transition-colors"
            >
              Mid
            </button>
          </div>
        </div>

        {/* Size Input */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Size</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                value={customSize}
                onChange={(e) => handleSizeChange(e.target.value)}
                onBlur={handleSizeBlur}
                className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00D4AA] pr-16"
                placeholder="0.00"
                step="0.0001"
              />
              <span className="absolute right-3 top-2 text-gray-400 text-sm">
                {sizeUnit === 'coin' ? position.coin : 'USD'}
              </span>
            </div>
            <select
              value={sizeUnit}
              onChange={(e) => handleSizeUnitChange(e.target.value)}
              className="bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00D4AA] text-sm"
            >
              <option value="coin">{position.coin}</option>
              <option value="usd">USD</option>
            </select>
          </div>
        </div>

        {/* Percentage Slider */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-sm">Close Amount</span>
            <span className="text-white text-sm">{formatNumber(sizePercentage, 0)}%</span>
          </div>
          {/* Improved Custom slider */}
          <div className="relative flex flex-col items-center">
            <div className="flex w-full justify-between mb-2">
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => handlePercentageChange(percent)}
                  className={`w-10 h-8 rounded-lg border transition-colors text-sm font-medium
                    ${Math.abs(sizePercentage - percent) < 1
                      ? 'bg-[#00D4AA] text-black border-[#00D4AA]'
                      : 'bg-[#18181b] text-gray-300 border-[#23232a] hover:bg-[#23232a]'}
                  `}
                  style={{ outline: 'none' }}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <div className="relative w-full flex items-center" style={{ height: '32px' }}>
              {/* Track */}
              <div className="absolute left-0 right-0 top-1/2 transform -translate-y-1/2 h-2 rounded-full bg-gray-700" />
              {/* Filled Track */}
              <div
                className="absolute left-0 top-1/2 transform -translate-y-1/2 h-2 rounded-full bg-[#00D4AA] transition-all"
                style={{ width: `${sizePercentage}%`, zIndex: 1 }}
              />
              {/* Slider Handle */}
              <div
                className="absolute top-1/2 transform -translate-y-1/2"
                style={{ left: `calc(${sizePercentage}% - 16px)` }}
              >
                <div
                  className="w-8 h-8 bg-[#00D4AA] border-4 border-[#0d0c0e] rounded-full shadow-lg cursor-pointer transition-transform hover:scale-110 focus:scale-110"
                  tabIndex={0}
                  role="slider"
                  aria-valuenow={sizePercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Close Amount Percentage"
                  onKeyDown={e => {
                    if (e.key === 'ArrowLeft') handlePercentageChange(Math.max(0, sizePercentage - 1));
                    if (e.key === 'ArrowRight') handlePercentageChange(Math.min(100, sizePercentage + 1));
                  }}
                  style={{ outline: 'none' }}
                />
              </div>
              {/* Range input for drag */}
              <input
                type="range"
                min="0"
                max="100"
                value={sizePercentage}
                onChange={e => handlePercentageChange(parseFloat(e.target.value))}
                className="absolute left-0 right-0 w-full h-8 opacity-0 cursor-pointer z-10"
                aria-label="Close Amount Slider"
              />
            </div>
          </div>
        </div>

        {/* Estimated PNL */}
        <div className="mb-6 text-center">
          <span className="text-gray-400 text-sm">Estimated closed PNL (without fees): </span>
          <span className={`font-medium ${estimatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {estimatedPnl >= 0 ? '+' : ''}${formatNumber(estimatedPnl)}
          </span>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleConfirm}
          className={`w-full font-medium py-3 rounded transition-colors ${
            !limitPrice || !customSize || parseFloat(customSize) <= 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#00D4AA] hover:bg-[#00B894] text-black cursor-pointer'
          }`}
          disabled={!limitPrice || !customSize || parseFloat(customSize) <= 0}
        >
          Submit
        </button>
      </div>
    </div>
  );
};

export default LimitCloseModal; 