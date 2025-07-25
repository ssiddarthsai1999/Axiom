import React, { useState, useEffect } from 'react';
import numeral from 'numeral';

const MarketCloseModal = ({ isOpen, onClose, position, onConfirm }) => {
  const [sizePercentage, setSizePercentage] = useState(100);
  const [customSize, setCustomSize] = useState('');
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [assetInfo, setAssetInfo] = useState(null);

  useEffect(() => {
    if (isOpen && position) {
      setSizePercentage(100);
      setCustomSize(Math.abs(position.size).toString());
      setDontShowAgain(false);
      // Fetch asset info for decimal validation
      fetchAssetInfo();
    }
  }, [isOpen, position]);

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

  const formatNumber = (value, decimals = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return numeral(value).format(`0,0.${'0'.repeat(decimals)}`);
  };

  const handleConfirm = () => {
    // Validate inputs before submitting
    if (!position || !customSize) {
      alert('Please fill in all required fields');
      return;
    }

    const sizeValue = parseFloat(customSize);

    if (isNaN(sizeValue) || sizeValue <= 0) {
      alert('Please enter a valid size');
      return;
    }

    if (sizeValue > Math.abs(position.size)) {
      alert(`Size cannot exceed position size of ${Math.abs(position.size)}`);
      return;
    }

    if (onConfirm) {
      console.log('🔄 Submitting market close order...');
      onConfirm({
        symbol: position.coin,
        side: position.side === 'Long' ? 'Sell' : 'Buy', // Opposite side to close
        size: sizeValue,
        type: 'market',
        reduceOnly: true,
        dontShowAgain: dontShowAgain
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
          <h2 className="text-xl font-medium text-white">Market Close</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-6">
          This will attempt to immediately close the position.
        </p>

        {/* Position Info */}
        <div className="mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Size</span>
            <span className="text-white text-sm">{formatNumber(Math.abs(position.size), 4)} {position.coin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Price</span>
            <span className="text-white text-sm">Market</span>
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

        {/* Don't show again checkbox */}
        <div className="mb-6 flex items-center space-x-2">
          <input
            type="checkbox"
            id="dontShowAgain"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 text-[#00D4AA] bg-[#1a1a1f] border-[#1F1E23] rounded focus:ring-[#00D4AA] focus:ring-2"
          />
          <label htmlFor="dontShowAgain" className="text-gray-400 text-sm cursor-pointer">
            Don&apos;t show this again
          </label>
        </div>

        {/* Market Close Button */}
        <button
          onClick={handleConfirm}
          className={`w-full font-medium py-3 rounded transition-colors ${
            !customSize || parseFloat(customSize) <= 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#00D4AA] hover:bg-[#00B894] text-black cursor-pointer'
          }`}
          disabled={!customSize || parseFloat(customSize) <= 0}
        >
          Market Close
        </button>
      </div>
    </div>
  );
};

export default MarketCloseModal; 