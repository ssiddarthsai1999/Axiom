import React, { useState, useEffect } from 'react';
import numeral from 'numeral';

const LimitCloseModal = ({ isOpen, onClose, position, currentPrice, onConfirm }) => {
  const [limitPrice, setLimitPrice] = useState('');
  const [sizePercentage, setSizePercentage] = useState(100);
  const [customSize, setCustomSize] = useState('');
  const [estimatedPnl, setEstimatedPnl] = useState(0);
  const [assetInfo, setAssetInfo] = useState(null);

  useEffect(() => {
    if (isOpen && position && currentPrice) {
      // Set default limit price to current market price
      setLimitPrice(currentPrice.toString());
      setSizePercentage(100);
      setCustomSize(Math.abs(position.size).toString());
      // Fetch asset info for decimal validation
      fetchAssetInfo();
    }
  }, [isOpen, position, currentPrice]);

  // Fetch asset info for decimal validation
  const fetchAssetInfo = async () => {
    if (!position?.coin) return;
    
    try {
      // Fetch market metadata to get szDecimals for the asset
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' })
      });

      if (response.ok) {
        const data = await response.json();
        const asset = data.universe.find(token => token.name === position.coin);
        
        if (asset) {
          setAssetInfo({
            szDecimals: asset.szDecimals,
            onlyIsolated: asset.onlyIsolated || false,
            isSpot: false // Perpetuals are not spot
          });
          console.log('✅ Asset info loaded for', position.coin, ':', {
            szDecimals: asset.szDecimals,
            onlyIsolated: asset.onlyIsolated
          });
        }
      }
    } catch (error) {
      console.error('❌ Error fetching asset info:', error);
      // Set fallback values
      setAssetInfo({
        szDecimals: 3,
        onlyIsolated: false,
        isSpot: false
      });
    }
  };

  useEffect(() => {
    // Calculate estimated PNL
    if (position && limitPrice && customSize) {
      const closePrice = parseFloat(limitPrice);
      const closeSize = parseFloat(customSize);
      const entryPrice = position.entryPrice;
      
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
  }, [position, limitPrice, customSize]);

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
      const newSize = (Math.abs(position.size) * percentage / 100);
      const formattedSize = assetInfo 
        ? formatSizeToMaxDecimals(newSize.toString(), assetInfo.szDecimals)
        : newSize.toString();
      setCustomSize(formattedSize);
    }
  };

  const handleSizeChange = (value) => {
    if (!assetInfo) {
      setCustomSize(value);
      if (position) {
        const percentage = (parseFloat(value) / Math.abs(position.size)) * 100;
        setSizePercentage(Math.min(100, Math.max(0, percentage)));
      }
      return;
    }
    
    const formattedValue = formatSizeToMaxDecimals(value, assetInfo.szDecimals);
    setCustomSize(formattedValue);
    
    if (position) {
      const percentage = (parseFloat(formattedValue) / Math.abs(position.size)) * 100;
      setSizePercentage(Math.min(100, Math.max(0, percentage)));
    }
  };

  const handleLimitPriceChange = (value) => {
    if (!assetInfo) {
      setLimitPrice(value);
      return;
    }
    
    const formattedValue = formatPriceToMaxDecimals(value, assetInfo.szDecimals, assetInfo.isSpot);
    setLimitPrice(formattedValue);
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

    const sizeValue = parseFloat(customSize);
    const priceValue = parseFloat(limitPrice);

    if (isNaN(sizeValue) || sizeValue <= 0) {
      alert('Please enter a valid size');
      return;
    }

    if (isNaN(priceValue) || priceValue <= 0) {
      alert('Please enter a valid price');
      return;
    }

    if (sizeValue > Math.abs(position.size)) {
      alert(`Size cannot exceed position size of ${Math.abs(position.size)}`);
      return;
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
            <span className="absolute right-3 top-2 text-[#00D4AA] text-sm">Mid</span>
          </div>
        </div>

        {/* Size Input */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Size</label>
          <div className="relative">
            <input
              type="number"
              value={customSize}
              onChange={(e) => handleSizeChange(e.target.value)}
              className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00D4AA] pr-16"
              placeholder="0.00"
              step="0.0001"
            />
            <span className="absolute right-3 top-2 text-gray-400 text-sm">{position.coin}</span>
          </div>
        </div>

        {/* Percentage Slider */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-sm">Close Amount</span>
            <span className="text-white text-sm">{formatNumber(sizePercentage, 0)}%</span>
          </div>
          
          {/* Custom slider */}
          <div className="relative">
            <div className="flex items-center space-x-2">
              {/* Percentage buttons */}
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  onClick={() => handlePercentageChange(percent)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    Math.abs(sizePercentage - percent) < 1 
                      ? 'bg-[#00D4AA]' 
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}
                />
              ))}
              
              {/* Connecting line */}
              <div className="flex-1 h-0.5 bg-gray-600 relative">
                <div 
                  className="absolute h-0.5 bg-[#00D4AA] left-0 top-0"
                  style={{ width: `${sizePercentage}%` }}
                />
                <div 
                  className="absolute w-4 h-4 bg-[#00D4AA] rounded-full transform -translate-y-1.5 -translate-x-2 cursor-pointer"
                  style={{ left: `${sizePercentage}%` }}
                />
              </div>
            </div>
            
            {/* Hidden range input for better UX */}
            <input
              type="range"
              min="0"
              max="100"
              value={sizePercentage}
              onChange={(e) => handlePercentageChange(parseFloat(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
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