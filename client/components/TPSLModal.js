// components/TPSLModal.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWalletClient } from 'wagmi';
import { placeOrderWithTPSL, calculateTPSLPrices, getOrCreateSessionAgentWallet, getAssetId } from '@/utils/hyperLiquidSDK';
import * as hl from '@nktkas/hyperliquid';
import numeral from 'numeral';

const TPSLModal = ({ isOpen, onClose, position, currentPrice }) => {
  const [tpPrice, setTPPrice] = useState('');
  const [slPrice, setSLPrice] = useState('');
  const [gainPercent, setGainPercent] = useState('');
  const [lossPercent, setLossPercent] = useState('');
  const [configureAmount, setConfigureAmount] = useState(false);
  const [configuredAmount, setConfiguredAmount] = useState(0); // Actual amount to close
  const [limitPrice, setLimitPrice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assetInfo, setAssetInfo] = useState(null);
  
  // Track which field was last updated to prevent circular updates
  const lastUpdatedRef = useRef(null);
  
  const { data: walletClient } = useWalletClient();

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

  // Utility function to validate and format decimal places for PRICE (same as TradingPanel)
  const formatPriceToMaxDecimals = (value, szDecimals, isSpot = false) => {
    if (!value || value === '') return value;
    
    let num = parseFloat(value);
    if (isNaN(num)) return value;
    
    const valueStr = value.toString();
    
    // Check significant figures limit (max 5)
    const sigFigs = countSignificantFigures(valueStr);
    if (sigFigs > 5) {
      // Truncate to 5 significant figures - no recursion!
      num = parseFloat(num.toPrecision(5));
    }
    
    // Apply HyperLiquid tick size rounding
    const tickRounded = roundToHyperLiquidTick(num, szDecimals);
    
    // Check if the original value had trailing zeros after decimal point
    // If so, preserve them in the result
    const hasTrailingZeros = valueStr.includes('.') && valueStr.endsWith('0');
    if (hasTrailingZeros) {
      const decimalIndex = valueStr.indexOf('.');
      const originalDecimalPlaces = valueStr.length - decimalIndex - 1;
      const maxPriceDecimals = (isSpot ? 8 : 6) - szDecimals;
      const preservedDecimalPlaces = Math.min(originalDecimalPlaces, maxPriceDecimals);
      
      // Return with preserved decimal places
      return tickRounded.toFixed(preservedDecimalPlaces);
    }
    
    return tickRounded.toString();
  };

  // Utility function to validate and format decimal places for SIZE (same as TradingPanel)
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

  const formatPrice = (num) => {
    const number = Number(num);
    if (isNaN(number)) return '';
    if (Number.isInteger(number)) {
      return numeral(number).format('0,0');
    }

    const parts = num.toString().split('.');
    const decimalPlaces = parts[1]?.length || 0;

    return numeral(number).format(`0,0.${'0'.repeat(decimalPlaces)}`);
  }

  // Handle TP price change with proper decimal formatting
  const handleTPPriceChange = (value) => {
    lastUpdatedRef.current = 'tpPrice';
    
    // Allow empty string or just whitespace
    if (value === '' || value === null || value === undefined) {
      setTPPrice('');
      return;
    }
    
    // Allow user to type "0" without it being formatted immediately
    if (value === '0') {
      setTPPrice('0');
      return;
    }
    
    if (!assetInfo) {
      setTPPrice(value);
      return;
    }
    
    // Only format if the value is not empty and not just "0"
    if (value && value !== '0') {
      const formattedValue = formatPriceToMaxDecimals(value, assetInfo.szDecimals, assetInfo.isSpot);
      setTPPrice(formattedValue);
    } else {
      setTPPrice(value);
    }
  };

  // Handle SL price change with proper decimal formatting
  const handleSLPriceChange = (value) => {
    lastUpdatedRef.current = 'slPrice';
    
    // Allow empty string or just whitespace
    if (value === '' || value === null || value === undefined) {
      setSLPrice('');
      return;
    }
    
    // Allow user to type "0" without it being formatted immediately
    if (value === '0') {
      setSLPrice('0');
      return;
    }
    
    if (!assetInfo) {
      setSLPrice(value);
      return;
    }
    
    // Only format if the value is not empty and not just "0"
    if (value && value !== '0') {
      const formattedValue = formatPriceToMaxDecimals(value, assetInfo.szDecimals, assetInfo.isSpot);
      setSLPrice(formattedValue);
    } else {
      setSLPrice(value);
    }
  };

  // Fetch asset info for decimal validation
  const fetchAssetInfo = useCallback(async () => {
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
  }, [position?.coin]);

  // Reset all states when modal opens and fetch asset info
  useEffect(() => {
    if (isOpen && position) {
      setTPPrice('');
      setSLPrice('');
      setGainPercent('');
      setLossPercent('');
      setConfigureAmount(false);
      setConfiguredAmount(0);
      setError('');
      lastUpdatedRef.current = null;
      
      // Fetch asset info for proper decimal validation
      fetchAssetInfo();
    }
  }, [isOpen, position, fetchAssetInfo]);

  // Calculate prices from percentages
  const updatePricesFromPercent = useCallback(() => {
    if (!position || !currentPrice) return;
    
    const isLong = position.side === 'Long';
    const prices = calculateTPSLPrices(
      currentPrice,
      parseFloat(gainPercent) || 0,
      parseFloat(lossPercent) || 0,
      isLong
    );
    
    if (gainPercent && prices.takeProfitPrice && lastUpdatedRef.current !== 'tpPrice') {
      setTPPrice(prices.takeProfitPrice.toString());
    }
    if (lossPercent && prices.stopLossPrice && lastUpdatedRef.current !== 'slPrice') {
      setSLPrice(prices.stopLossPrice.toString());
    }
  }, [position, currentPrice, gainPercent, lossPercent]);

  // Calculate percentages from prices
  const updatePercentsFromPrice = useCallback(() => {
    if (!position || !currentPrice) return;
    
    const isLong = position.side === 'Long';
    
    if (tpPrice && parseFloat(tpPrice) > 0 && lastUpdatedRef.current !== 'gainPercent') {
      const tpPercent = isLong 
        ? ((parseFloat(tpPrice) - currentPrice) / currentPrice) * 100
        : ((currentPrice - parseFloat(tpPrice)) / currentPrice) * 100;
      setGainPercent(tpPercent.toFixed(2));
    }
    
    if (slPrice && parseFloat(slPrice) > 0 && lastUpdatedRef.current !== 'lossPercent') {
      const slPercent = isLong
        ? ((currentPrice - parseFloat(slPrice)) / currentPrice) * 100
        : ((parseFloat(slPrice) - currentPrice) / currentPrice) * 100;
      setLossPercent(slPercent.toFixed(2));
    }
  }, [position, currentPrice, tpPrice, slPrice]);

  // Update prices when percentages change
  useEffect(() => {
    if (lastUpdatedRef.current === 'gainPercent' || lastUpdatedRef.current === 'lossPercent') {
      updatePricesFromPercent();
      lastUpdatedRef.current = null; // Reset after update
    }
  }, [gainPercent, lossPercent, updatePricesFromPercent]);

  // Update percentages when prices change
  useEffect(() => {
    if (lastUpdatedRef.current === 'tpPrice' || lastUpdatedRef.current === 'slPrice') {
      updatePercentsFromPrice();
      lastUpdatedRef.current = null; // Reset after update
    }
  }, [tpPrice, slPrice, updatePercentsFromPrice]);

  const handleSubmit = async () => {
    if (!position || !walletClient) return;
    
    // Validate configured amount
    if (configureAmount && configuredAmount > Math.abs(position.size)) {
      setError('Configured amount cannot exceed position size');
      return;
    }
    
    if (configureAmount && configuredAmount <= 0) {
      setError('Configured amount must be greater than 0');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // For existing positions, place standalone TP/SL trigger orders
      // These will work as proper TP/SL even if they don't group visually in the UI
      const result = await placeTpSlOrdersOnly(position, {
        takeProfitPrice: parseFloat(tpPrice) || null,
        stopLossPrice: parseFloat(slPrice) || null
      });
      
      console.log('✅ TP/SL orders placed successfully:', result);
      
      // Show success message briefly before closing
      if (result.status === 'ok') {
        console.log('✅ TP/SL trigger orders are now active and will execute when prices are reached');
      }
      
      onClose();
      
    } catch (err) {
      console.error('❌ Error placing TP/SL:', err);
      
      // Provide more specific error messages
      let errorMessage = err.message || 'Failed to place TP/SL orders';
      
      if (errorMessage.includes('invalid price')) {
        errorMessage = `Invalid price format. Please ensure prices have maximum ${assetInfo ? (assetInfo.isSpot ? 8 : 6) - assetInfo.szDecimals : 3} decimal places and 5 significant figures.`;
      } else if (errorMessage.includes('invalid size')) {
        errorMessage = `Invalid size format. Please ensure size has maximum ${assetInfo ? assetInfo.szDecimals : 3} decimal places.`;
      } else if (errorMessage.includes('zero size')) {
        errorMessage = 'HyperLiquid does not allow zero-size orders. TP/SL will be placed as individual trigger orders.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };



  // Function to place only TP/SL orders for existing position
  const placeTpSlOrdersOnly = async (position, tpSlParams) => {
    const agentWallet = getOrCreateSessionAgentWallet();
    const transport = new hl.HttpTransport({ isTestnet: false }); // true for mainnet
    const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
    
    const assetId = position.tokenIndex;
    const isLongPosition = position.side === 'Long';
    const positionSize = Math.abs(position.size);
    
    // Calculate the actual size to close based on configure amount setting
    const sizeToClose = configureAmount 
      ? configuredAmount
      : positionSize;
    
    console.log('📝 TP/SL Order preparation:', {
      coin: position.coin,
      assetId,
      isLongPosition,
      positionSize,
      sizeToClose,
      configuredAmount: configureAmount ? `${configuredAmount} ${position.coin}` : 'full position',
      assetInfo,
      tpSlParams
    });
    
    // Build only TP/SL orders array
    const orders = [];
    
    // Get asset metadata for proper formatting
    const assetInfoForOrder = assetInfo || { szDecimals: 3, isSpot: false };
    
    // Stop Loss order (opposite direction, reduce-only, market order when triggered)
    if (tpSlParams.stopLossPrice && tpSlParams.stopLossPrice > 0) {
      // Format the price and size according to Hyperliquid requirements
      const formattedPrice = formatPriceToMaxDecimals(
        tpSlParams.stopLossPrice.toString(), 
        assetInfoForOrder.szDecimals, 
        assetInfoForOrder.isSpot
      );
      const formattedSize = formatSizeToMaxDecimals(
        sizeToClose.toString(), 
        assetInfoForOrder.szDecimals
      );
      
      const slOrder = {
        a: assetId,
        b: !isLongPosition, // Opposite of current position
        p: formattedPrice,
        r: true, // reduce_only
        s: formattedSize,
        t: {
          trigger: {
            isMarket: true,
            tpsl: 'sl',
            triggerPx: formattedPrice
          }
        }
      };
      
      console.log('🛡️ Stop Loss order formatted:', {
        originalPrice: tpSlParams.stopLossPrice,
        formattedPrice,
        originalSize: sizeToClose,
        formattedSize,
        order: slOrder
      });
      
      orders.push(slOrder);
    }
    
    // Take Profit order (opposite direction, reduce-only, market order when triggered)
    if (tpSlParams.takeProfitPrice && tpSlParams.takeProfitPrice > 0) {
      // Format the price and size according to Hyperliquid requirements
      const formattedPrice = formatPriceToMaxDecimals(
        tpSlParams.takeProfitPrice.toString(), 
        assetInfoForOrder.szDecimals, 
        assetInfoForOrder.isSpot
      );
      const formattedSize = formatSizeToMaxDecimals(
        sizeToClose.toString(), 
        assetInfoForOrder.szDecimals
      );
      
      const tpOrder = {
        a: assetId,
        b: !isLongPosition, // Opposite of current position  
        p: formattedPrice,
        r: true, // reduce_only
        s: formattedSize,
        t: {
          trigger: {
            isMarket: true,
            tpsl: 'tp',
            triggerPx: formattedPrice
          }
        }
      };
      
      console.log('🎯 Take Profit order formatted:', {
        originalPrice: tpSlParams.takeProfitPrice,
        formattedPrice,
        originalSize: sizeToClose,
        formattedSize,
        order: tpOrder
      });
      
      orders.push(tpOrder);
    }
    
    if (orders.length === 0) {
      throw new Error('No TP/SL prices specified');
    }
    
    // Validate that all prices are properly formatted
    for (const order of orders) {
      const price = parseFloat(order.p);
      const size = parseFloat(order.s);
      
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price: ${order.p}. Check decimal formatting.`);
      }
      if (isNaN(size) || size <= 0) {
        throw new Error(`Invalid size: ${order.s}. Check decimal formatting.`);
      }
    }
    
    console.log('📋 TP/SL only orders (validated):', JSON.stringify(orders, null, 2));
    
    // Place standalone TP/SL trigger orders for existing positions
    // These orders will work as proper TP/SL protection even without UI grouping
    const orderRequest = {
      orders: orders,
      grouping: 'na' // Standalone orders for existing positions
    };
    
    console.log('💡 Placing TP/SL as individual trigger orders - they will function correctly even if not grouped in UI');
    
    console.log('📤 Final TP/SL request:', JSON.stringify(orderRequest, null, 2));
    
    const result = await exchClient.order(orderRequest);
    
    console.log('📥 TP/SL order result:', result);
    
    return result;
  };

  if (!isOpen || !position) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-[#0d0c0e] border border-[#1F1E23] rounded-lg p-6 w-96 max-w-[90vw]">
        <style jsx>{`
          .slider::-webkit-slider-thumb {
            appearance: none;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: #1dd1a1;
            cursor: pointer;
            border: 2px solid #0d0c0e;
            box-shadow: 0 0 0 1px #1dd1a1;
          }
          
          .slider::-moz-range-thumb {
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: #1dd1a1;
            cursor: pointer;
            border: 2px solid #0d0c0e;
            box-shadow: 0 0 0 1px #1dd1a1;
          }
        `}</style>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-medium text-lg">TP/SL for Position</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Position Info */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-400">Coin</span>
            <span className="text-white font-medium">{position.coin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Position</span>
            <span className={`font-medium ${position.side === 'Long' ? 'text-green-400' : 'text-red-400'}`}>
              {position.size > 0 ? '' : '-'}{formatPrice(position.size)} {position.coin}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Entry Price</span>
            <span className="text-white font-mono">{formatPrice(position.entryPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mark Price</span>
            <span className="text-white font-mono">{formatPrice(currentPrice)}</span>
          </div>
        </div>

        {/* TP/SL Inputs */}
        <div className="space-y-4 mb-6">
                     {/* Take Profit */}
           <div className="flex space-x-3">
             <div className="flex-1">
               <div className="flex justify-between items-center mb-1">
                 <label className="block text-gray-400 text-sm">TP Price</label>
                 {assetInfo && (
                   <span className="text-xs text-gray-500">
                     Max {(assetInfo.isSpot ? 8 : 6) - assetInfo.szDecimals} decimals
                   </span>
                 )}
               </div>
               <input
                 type="number"
                 value={tpPrice}
                 onChange={(e) => handleTPPriceChange(e.target.value)}
                 placeholder="0.00"
                 className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white font-mono focus:border-gray-500 focus:outline-none"
               />
            </div>
            <div className="w-24">
              <label className="block text-gray-400 text-sm mb-1">Gain</label>
              <div className="flex items-center">
                                 <input
                   type="number"
                   value={gainPercent}
                   onChange={(e) => {
                     lastUpdatedRef.current = 'gainPercent';
                     setGainPercent(e.target.value);
                   }}
                   placeholder="0"
                   className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-2 py-2 text-white font-mono focus:border-gray-500 focus:outline-none text-sm"
                 />
                <span className="ml-1 text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>

                     {/* Stop Loss */}
           <div className="flex space-x-3">
             <div className="flex-1">
               <div className="flex justify-between items-center mb-1">
                 <label className="block text-gray-400 text-sm">SL Price</label>
                 {assetInfo && (
                   <span className="text-xs text-gray-500">
                     Max {(assetInfo.isSpot ? 8 : 6) - assetInfo.szDecimals} decimals, 5 sig figs
                   </span>
                 )}
               </div>
               <input
                 type="number"
                 value={slPrice}
                 onChange={(e) => handleSLPriceChange(e.target.value)}
                 placeholder="0.00"
                 className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-3 py-2 text-white font-mono focus:border-gray-500 focus:outline-none"
               />
            </div>
            <div className="w-24">
              <label className="block text-gray-400 text-sm mb-1">Loss</label>
              <div className="flex items-center">
                                 <input
                   type="number"
                   value={lossPercent}
                   onChange={(e) => {
                     lastUpdatedRef.current = 'lossPercent';
                     setLossPercent(e.target.value);
                   }}
                   placeholder="0"
                   className="w-full bg-[#1a1a1f] border border-[#1F1E23] rounded px-2 py-2 text-white font-mono focus:border-gray-500 focus:outline-none text-sm"
                 />
                <span className="ml-1 text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={configureAmount}
              onChange={(e) => setConfigureAmount(e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 bg-[#1a1a1f] border-[#1F1E23] rounded focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">Configure Amount</span>
          </label>
          
          {/* Configure Amount Slider - Only show when checkbox is checked */}
          {configureAmount && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Position Size</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={configuredAmount}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const maxAmount = Math.abs(position.size);
                      setConfiguredAmount(Math.min(maxAmount, Math.max(0, value)));
                    }}
                    className="w-20 bg-[#1a1a1f] border border-[#1F1E23] rounded px-2 py-1 text-white font-mono text-sm focus:border-gray-500 focus:outline-none"
                    min="0"
                    max={Math.abs(position.size)}
                    // step="0.001"
                  />
                  <span className="text-gray-400 text-sm">{position.coin}</span>
                </div>
              </div>
              
              {/* Slider */}
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max={Math.abs(position.size)}
                  value={configuredAmount}
                  onChange={(e) => setConfiguredAmount(parseFloat(e.target.value))}
                  // step="0.001"
                  className="w-full h-2 bg-[#1F1E23] rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #1dd1a1 0%, #1dd1a1 ${(configuredAmount / Math.abs(position.size)) * 100}%, #1F1E23 ${(configuredAmount / Math.abs(position.size)) * 100}%, #1F1E23 100%)`
                  }}
                />
              </div>
              
              {/* Amount Display */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Amount to close:</span>
                <span className="text-white font-mono">
                  {formatPrice(configuredAmount)} {position.coin}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || (!tpPrice && !slPrice)}
          className="w-full py-3 bg-[#1dd1a1] hover:bg-[#19b591] disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium rounded transition-colors"
        >
          {loading ? 'Placing Orders...' : 'Confirm'}
        </button>

                 {/* Info Text */}
         <div className="mt-4 space-y-2">
           <p className="text-gray-500 text-xs">
             By default take-profit and stop-loss orders apply to the entire position. Take-profit
             and stop-loss are market orders and may be subject to slippage.
           </p>
           <p className="text-gray-500 text-xs">
             If the order size is configured above, the TP/SL order will be for that size no matter
             how the position changes in the future.
           </p>
         </div>
      </div>
    </div>
  );
};

export default TPSLModal; 