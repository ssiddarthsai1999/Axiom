// components/TPSLModal.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWalletClient } from 'wagmi';
import { placeOrderWithTPSL, calculateTPSLPrices, getOrCreateSessionAgentWallet, getAssetId } from '@/utils/hyperLiquidSDK';
import * as hl from '@nktkas/hyperliquid';

const TPSLModal = ({ isOpen, onClose, position, currentPrice }) => {
  const [tpPrice, setTPPrice] = useState('');
  const [slPrice, setSLPrice] = useState('');
  const [gainPercent, setGainPercent] = useState('');
  const [lossPercent, setLossPercent] = useState('');
  const [configureAmount, setConfigureAmount] = useState(false);
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

  // Utility function to validate and format decimal places for PRICE (same as TradingPanel)
  const formatPriceToMaxDecimals = (value, szDecimals, isSpot = false) => {
    if (!value || value === '') return value;
    
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    const valueStr = value.toString();
    
    // Check significant figures limit (max 5)
    const sigFigs = countSignificantFigures(valueStr);
    if (sigFigs > 5) {
      // Truncate to 5 significant figures
      const truncated = parseFloat(num.toPrecision(5));
      return truncated.toString();
    }
    
    // Check decimal places limit: MAX_DECIMALS - szDecimals
    const MAX_DECIMALS = isSpot ? 8 : 6;
    const maxDecimalPlaces = MAX_DECIMALS - szDecimals;
    
    const decimalIndex = valueStr.indexOf('.');
    if (decimalIndex === -1) {
      // No decimal point, return as is (integers are always allowed)
      return valueStr;
    }
    
    const decimalPlaces = valueStr.length - decimalIndex - 1;
    if (decimalPlaces <= maxDecimalPlaces) {
      // Already within limits
      return valueStr;
    }
    
    // Truncate to max decimal places
    return num.toFixed(maxDecimalPlaces);
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

  // Reset all states when modal opens and fetch asset info
  useEffect(() => {
    if (isOpen && position) {
      setTPPrice('');
      setSLPrice('');
      setGainPercent('');
      setLossPercent('');
      setError('');
      lastUpdatedRef.current = null;
      
      // Fetch asset info for proper decimal validation
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
    
    const assetId = getAssetId(position.coin);
    const isLongPosition = position.side === 'Long';
    const positionSize = Math.abs(position.size);
    
    console.log('📝 TP/SL Order preparation:', {
      coin: position.coin,
      assetId,
      isLongPosition,
      positionSize,
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
        positionSize.toString(), 
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
        originalSize: positionSize,
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
        positionSize.toString(), 
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
        originalSize: positionSize,
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
              {position.size > 0 ? '' : '-'}{Math.abs(position.size).toFixed(4)} {position.coin}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Entry Price</span>
            <span className="text-white font-mono">{position.entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mark Price</span>
            <span className="text-white font-mono">{currentPrice.toFixed(2)}</span>
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
                     Max {(assetInfo.isSpot ? 8 : 6) - assetInfo.szDecimals} decimals, 5 sig figs
                   </span>
                 )}
               </div>
               <input
                 type="number"
                 value={tpPrice}
                 onChange={(e) => {
                   lastUpdatedRef.current = 'tpPrice';
                   const formattedValue = assetInfo ? 
                     formatPriceToMaxDecimals(e.target.value, assetInfo.szDecimals, assetInfo.isSpot) : 
                     e.target.value;
                   setTPPrice(formattedValue);
                 }}
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
                 onChange={(e) => {
                   lastUpdatedRef.current = 'slPrice';
                   const formattedValue = assetInfo ? 
                     formatPriceToMaxDecimals(e.target.value, assetInfo.szDecimals, assetInfo.isSpot) : 
                     e.target.value;
                   setSLPrice(formattedValue);
                 }}
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
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={limitPrice}
              onChange={(e) => setLimitPrice(e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 bg-[#1a1a1f] border-[#1F1E23] rounded focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">Limit Price</span>
          </label>
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
           <p className="text-gray-500 text-xs bg-blue-900/20 border border-blue-700 rounded p-2 mt-2">
             <strong>Note:</strong> TP/SL orders for existing positions are placed as individual trigger orders. 
             They will function properly but may not group visually in the HyperLiquid UI like orders placed during initial position creation.
           </p>
         </div>
      </div>
    </div>
  );
};

export default TPSLModal; 