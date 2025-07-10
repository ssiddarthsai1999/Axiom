// components/TradingPanel.js
import React, { useState } from 'react';
import { X } from 'lucide-react';

const TradingPanel = ({ 
  selectedSymbol = 'BTC', 
  marketData = null,
  className = '' 
}) => {
  const [side, setSide] = useState('Long'); // 'Long' or 'Short'
  const [orderType, setOrderType] = useState('Market'); // 'Market' or 'Limit'
  const [leverage, setLeverage] = useState(10);
  const [buyAmount, setBuyAmount] = useState('0.0');
  const [percentage, setPercentage] = useState(0);
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [tempLeverage, setTempLeverage] = useState(10);
  
  // TP/SL state
  const [tpPrice, setTpPrice] = useState('');
  const [tpPercentage, setTpPercentage] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');

  // Mock account data - replace with real data
  const accountData = {
    availableMargin: 0.00,
    accountValue: 0.00,
    currentPosition: null
  };

  const percentageOptions = [0, 25, 50, 75, 100];
  const maxLeverage = 50; // Maximum leverage allowed

  const handlePercentageClick = (percent) => {
    setPercentage(percent);
    // Calculate amount based on percentage of available margin
    const amount = (accountData.availableMargin * percent) / 100;
    setBuyAmount(amount.toFixed(2));
  };

  const handleLeverageClick = () => {
    setTempLeverage(leverage);
    setShowLeverageModal(true);
  };

  const handleLeverageSet = () => {
    setLeverage(tempLeverage);
    setShowLeverageModal(false);
  };

  const handleSliderChange = (e) => {
    setTempLeverage(parseInt(e.target.value));
  };

  const handleTrade = () => {
    // Handle trade execution
    console.log('Trade:', {
      side,
      orderType,
      symbol: selectedSymbol,
      amount: buyAmount,
      leverage,
      tpSlEnabled
    });
    // Add your trade execution logic here
  };

  return (
    <>
      <div className={`bg-[#101015] text-white p-4 ${className} border-l border-l-white/20`}>
        {/* Long/Short Toggle */}
        <div className="flex mb-4">
          <button
            onClick={() => setSide('Long')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-l-lg transition-colors border  cursor-pointer ${
              side === 'Long'
                ? 'bg-[#2ee2ac] text-black border-white/20'
                : 'bg-transparent text-white hover:bg-gray-600 border-white/20'
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide('Short')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-r-lg transition-colors border cursor-pointer ${
              side === 'Short'
                ? 'bg-[#ed397b] text-white border-white/20'
                : 'bg-transparent text-white hover:bg-gray-600 border-white/20'
            }`}
          >
            Short
          </button>
        </div>

        {/* Market/Limit Toggle */}
        <div className="flex mb-4 space-x-4">
          <button
            onClick={() => setOrderType('Market')}
            className={`text-sm font-medium pb-1 cursor-pointer ${
              orderType === 'Market'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('Limit')}
            className={`text-sm font-medium pb-1 cursor-pointer ${
              orderType === 'Limit'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Limit
          </button>
          
          {/* Leverage Display - Clickable */}
          <button 
            onClick={handleLeverageClick}
            className="ml-auto text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            Leverage: {leverage}x
          </button>
        </div>

        {/* Buy Amount */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-gray-400">Buy Amount</label>
            <span className="text-sm text-gray-400">{selectedSymbol}</span>
          </div>
          
          <div className="relative">
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-lg font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              <span className="text-blue-400 text-sm">💎</span>
              <span className="text-white font-mono">0</span>
            </div>
          </div>
        </div>

        {/* Percentage Buttons */}
        <div className="flex space-x-1 mb-4">
          {percentageOptions.map((percent) => (
            <button
              key={percent}
              onClick={() => handlePercentageClick(percent)}
              className={`flex-1 py-1 px-2 text-xs rounded transition-colors cursor-pointer ${
                percentage === percent
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {percent}%
            </button>
          ))}
        </div>

        {/* TP/SL Checkbox */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="tpsl"
              checked={tpSlEnabled}
              onChange={(e) => setTpSlEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="tpsl" className="text-sm text-gray-400">
              TP/SL
            </label>
          </div>
          <div className="text-sm text-gray-400">
            Est. Liq. Price: —
          </div>
        </div>

        {/* TP/SL Input Fields - Show when enabled */}
        {tpSlEnabled && (
          <div className="mb-4 space-y-4">
            {/* Take Profit Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">TP Price</label>
                <label className="text-sm text-gray-400">TP %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="Enter TP price"
                  className="flex-1 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={tpPercentage}
                  onChange={(e) => setTpPercentage(e.target.value)}
                  placeholder="0.0"
                  className="w-20 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Stop Loss Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">SL Price</label>
                <label className="text-sm text-gray-400">SL %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="Enter SL price"
                  className="flex-1 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={slPercentage}
                  onChange={(e) => setSlPercentage(e.target.value)}
                  placeholder="0.0"
                  className="w-20 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Add More Funds Button */}
         <button
          onClick={handleTrade}
          className={`w-full py-3 px-4 rounded-lg font-medium mt-3 mb-4 transition-colors cursor-pointer  ${
            side === 'Long'
              ? 'bg-[#2ee2ac] hover:bg-[#2ee2acc8] text-black'
              : 'bg-[#ed397b] hover:bg-[#ed397bc8] text-white'
          }`}
        >
        Add more funds
        </button>

        {/* Account Information */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Available Margin</span>
            <span className="text-blue-400 font-mono">
              {accountData.availableMargin.toFixed(2)} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Perps Account Value</span>
            <span className="text-white font-mono">
              {accountData.accountValue.toFixed(2)} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Current Position</span>
            <span className="text-white font-mono">
              {accountData.currentPosition || '—'}
            </span>
          </div>
        </div>

        {/* Trade Button */}
        <button
          onClick={handleTrade}
          className={`w-full py-3 px-4 rounded-lg font-medium mt-6 transition-colors cursor-pointer ${
            side === 'Long'
              ? 'bg-[#2ee2ac] hover:bg-[#2ee2acc8] text-black'
              : 'bg-[#ed397b] hover:bg-[#ed397bc8] text-white'
          }`}
        >
          {side} {selectedSymbol}
        </button>

        {/* Powered by Hyperliquid */}
        <div className="text-center mt-6">
          <span className="text-xs text-gray-500">
            powered by 💎 <span className="text-blue-400">Hyperliquid</span>
          </span>
        </div>
      </div>

      {/* Leverage Modal */}
      {showLeverageModal && (
        <div className="fixed inset-0 backdrop-blur-3xl bg-black/60 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[101015] border rounded-lg p-6 w-80 mx-4">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Set Leverage</h3>
              <button 
                onClick={() => setShowLeverageModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5 cursor-pointer" />
              </button>
            </div>

            {/* Current Leverage Display */}
            <div className="text-center mb-6">
              <div className="text-3xl font-bold text-white mb-2">
                {tempLeverage}x
              </div>
              <div className="text-sm text-gray-400">
                Current leverage for {selectedSymbol}
              </div>
            </div>

            {/* Leverage Slider */}
            <div className="mb-6">
              <input
                type="range"
                min="1"
                max={maxLeverage}
                value={tempLeverage}
                onChange={handleSliderChange}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((tempLeverage - 1) / (maxLeverage - 1)) * 100}%, #374151 ${((tempLeverage - 1) / (maxLeverage - 1)) * 100}%, #374151 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>1x</span>
                <span>{maxLeverage}x</span>
              </div>
            </div>

            {/* Quick Select Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[1, 5, 10, 20, 30, 50].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setTempLeverage(lev)}
                  className={`py-2 px-3 text-sm rounded transition-colors cursor-pointer ${
                    tempLeverage === lev
                      ? 'bg-blue-500 text-white'
                      : 'bg-[#181a20] text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>

            {/* Warning Message */}
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3 mb-6">
              <p className="text-yellow-400 text-xs">
                ⚠️ Higher leverage increases both potential profits and losses. 
                Trade responsibly and never risk more than you can afford to lose.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowLeverageModal(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLeverageSet}
                className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Set Leverage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Slider Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #1f2937;
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #1f2937;
        }
      `}</style>
    </>
  );
};

export default TradingPanel;