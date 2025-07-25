// components/UserPositions.js
import React, { useState, useEffect, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { getUserAccountStateSDK, getOpenOrdersSDK, getOrCreateSessionAgentWallet } from '@/utils/hyperLiquidSDK';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import * as hl from '@nktkas/hyperliquid';
import TPSLModal from './TPSLModal';
import LimitCloseModal from './LimitCloseModal';
import MarketCloseModal from './MarketCloseModal';
import numeral from 'numeral';

const UserPositions = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState('Positions');
  const [positions, setPositions] = useState([]);
  const [balances, setBalances] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [tpslModalOpen, setTpslModalOpen] = useState(false);
  const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
  const [marketCloseModalOpen, setMarketCloseModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const refreshInterval = useRef(null);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && isConnected && address && walletClient && !loading) {
      refreshInterval.current = setInterval(() => {
        fetchUserData(); // This now includes TP/SL data
        fetchCurrentPrices();
      }, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh, isConnected, address, walletClient, loading]);

  // Fetch current market prices for all assets
  const fetchCurrentPrices = async () => {
    try {
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
        
        const priceMap = {};
        universe.forEach((token, index) => {
          const assetCtx = assetCtxs[index];
          if (assetCtx && assetCtx.markPx) {
            priceMap[token.name] = parseFloat(assetCtx.markPx);
          }
        });
        
        setCurrentPrices(priceMap);
        console.log('✅ Current prices updated:', priceMap);
      }
    } catch (error) {
      console.error('❌ Error fetching current prices:', error);
    }
  };

  // Fetch user data when wallet is connected
  useEffect(() => {
    if (isConnected && address && walletClient) {
      fetchUserData();
      fetchCurrentPrices(); // Also fetch current prices
    } else {
      // Clear data when disconnected
      setPositions([]);
      setBalances([]);
      setOpenOrders([]);
      setTrades([]);
      setError(null);
      setCurrentPrices({});
    }
  }, [isConnected, address, activeTab, walletClient]);

  const fetchUserData = async () => {
    if (!address || !walletClient) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Always fetch positions, balances, and orders to keep TP/SL data current
      if (activeTab === 'Positions' || activeTab === 'Balances' || activeTab === 'Open Orders') {
        console.log('🔍 Fetching positions using nktkas SDK...');
        const userState = await getUserAccountStateSDK(walletClient, address, true); // true for mainnet
        
        if (userState && userState.assetPositions) {
          // Filter positions (non-zero size)
          const formattedPositions = userState.assetPositions
            .filter(pos => parseFloat(pos.position.szi) !== 0)
            .map(pos => {
              const size = parseFloat(pos.position.szi);
              const entryPrice = parseFloat(pos.position.entryPx || 0);
              // Use current price from our price map, fallback to pos.markPx if available
              const markPrice = currentPrices[pos.position.coin] || parseFloat(pos.markPx || 0);
              const pnl = parseFloat(pos.position.unrealizedPnl || 0);
              const positionValue = Math.abs(size) * markPrice;
              const pnlPercentage = entryPrice > 0 ? ((markPrice - entryPrice) / entryPrice) * 100 * (size > 0 ? 1 : -1) : 0;
              const leverage = parseFloat(pos.leverage?.value || 1);
              // Calculate margin used for open positions
              const marginUsed = leverage > 0 ? positionValue / leverage : 0;
              
              return {
                coin: pos.position.coin,
                size: size,
                positionValue: positionValue,
                entryPrice: entryPrice,
                markPrice: markPrice,
                pnl: pnl,
                pnlPercentage: pnlPercentage,
                leverage: leverage,
                liquidationPrice: parseFloat(pos.liquidationPx || 0),
                marginUsed: parseFloat(pos.position.marginUsed || 0),
                side: size > 0 ? 'Long' : 'Short',
                funding: 0 // Will be calculated from funding data
              };
            });
          setPositions(formattedPositions);
          
          // Filter balances (available balances)
          const formattedBalances = userState.assetPositions
            .filter(pos => parseFloat(pos.position.szi) === 0 && parseFloat(pos.marginUsed || 0) > 0)
            .map(pos => ({
              coin: pos.position.coin,
              balance: parseFloat(pos.marginUsed || 0),
              value: parseFloat(pos.marginUsed || 0) * (currentPrices[pos.position.coin] || parseFloat(pos.markPx || 1))
            }));
          setBalances(formattedBalances);
          
          console.log('✅ Positions loaded:', formattedPositions);
          console.log('✅ Balances loaded:', formattedBalances);
        }
      }
      
      // Always fetch open orders to extract TP/SL information
      // Use direct API instead of SDK as SDK doesn't return trigger order details properly
      console.log('🔍 Fetching orders using direct HyperLiquid API...');
      const ordersResponse = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'openOrders',
          user: address
        })
      });
      
      if (ordersResponse.ok) {
        const orders = await ordersResponse.json();
        console.log('✅ Orders fetched via direct API:', orders.length, 'orders');
        
        if (orders && Array.isArray(orders)) {
          const formattedOrders = orders.map(order => {
            // Handle different possible structures from HyperLiquid API
            const isReduceOnly = order.reduceOnly || order.r || false;
            const hasTrigger = !!(order.trigger || order.t);
            const triggerData = order.trigger || order.t || {};
            
            return {
              symbol: order.coin,
              side: order.side === 'B' ? 'Buy' : 'Sell',
              type: order.orderType || 'Limit',
              size: parseFloat(order.sz || order.s),
              price: parseFloat(order.limitPx || order.p),
              filled: parseFloat(order.sz || order.s) - parseFloat(order.remainingSize || order.sz || order.s),
              remaining: parseFloat(order.remainingSize || order.sz || order.s),
              orderId: order.oid,
              timestamp: order.timestamp,
              triggerCondition: order.triggerCondition || 'N/A',
              reduceOnly: isReduceOnly,
              // Add TP/SL specific fields - handle multiple possible structures
              isTrigger: hasTrigger,
              triggerPrice: triggerData.triggerPx ? parseFloat(triggerData.triggerPx) : null,
              tpslType: triggerData.tpsl || null,
              isMarket: triggerData.isMarket || false,
              rawOrder: order // Keep for debugging
            };
          });
          setOpenOrders(formattedOrders);
          console.log('✅ Orders processed:', formattedOrders.length, 'formatted orders');
        }
      }
      
      // Fetch recent trades (still using direct API as SDK might not have this endpoint)
      if (activeTab === 'Trade History') {
        console.log('🔍 Fetching trades...');
        const userFills = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'userFills',
            user: address
          })
        });
        
        if (userFills.ok) {
          const fillsData = await userFills.json();
          if (fillsData && Array.isArray(fillsData)) {
            const formattedTrades = fillsData.slice(0, 50).map(trade => ({
              symbol: trade.coin,
              side: trade.side === 'B' ? 'Buy' : 'Sell',
              size: parseFloat(trade.sz),
              price: parseFloat(trade.px),
              time: new Date(trade.time),
              fee: parseFloat(trade.fee || 0),
              closed: trade.closedPnl ? parseFloat(trade.closedPnl) : null,
              direction: trade.dir || 'Unknown'
            }));
            setTrades(formattedTrades);
            console.log('✅ Trades loaded:', formattedTrades);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value, decimals = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return numeral(value).format(`0,0.${'0'.repeat(decimals)}`);
  };

  const formatTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };

  const cancelOrder = async (orderId, symbol) => {
    try {
      console.log(`🗑️ Canceling order ${orderId} for ${symbol}`);
      // Implementation would need proper wallet signing with nktkas SDK
      // This would require adding a cancel order function to the hyperLiquidSDK.js
      // await cancelOrderSDK(walletClient, orderId, symbol, true);
      // For now, just refresh data
      fetchUserData();
    } catch (error) {
      console.error('❌ Error canceling order:', error);
    }
  };

  const closePosition = async (symbol) => {
    try {
      console.log(`🔒 Closing position for ${symbol}`);
      // Implementation would need proper position closing with nktkas SDK
      // This would require implementing position closing in the hyperLiquidSDK.js
      // alert(`Position closing for ${symbol} - Implementation needed`);
    } catch (error) {
      console.error('❌ Error closing position:', error);
    }
  };

  const openTPSLModal = (position) => {
    setSelectedPosition(position);
    setTpslModalOpen(true);
  };

  const closeTPSLModal = () => {
    setTpslModalOpen(false);
    setSelectedPosition(null);
    // Refresh data after modal closes to see any new TP/SL orders
    setTimeout(() => {
      fetchUserData();
      fetchCurrentPrices();
    }, 1000); // Small delay to ensure orders are processed
  };

  const openLimitCloseModal = (position) => {
    setSelectedPosition(position);
    setLimitCloseModalOpen(true);
  };

  const closeLimitCloseModal = () => {
    setLimitCloseModalOpen(false);
    setSelectedPosition(null);
  };

  const openMarketCloseModal = (position) => {
    setSelectedPosition(position);
    setMarketCloseModalOpen(true);
  };

  const closeMarketCloseModal = () => {
    setMarketCloseModalOpen(false);
    setSelectedPosition(null);
  };

  const handleClosePosition = async (orderData) => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      console.log('🔒 Closing position with order:', orderData);
      
      // Get asset information for the symbol
      const assetInfo = await hyperliquidUtils.getAssetInfo(orderData.symbol, true);
      if (!assetInfo) {
        throw new Error(`Could not find asset information for ${orderData.symbol}`);
      }
      
      console.log('📊 Asset info:', assetInfo);
      
      // Show loading state
      const loadingMessage = `Submitting ${orderData.type.toUpperCase()} close order for ${orderData.symbol}...`;
      console.log(loadingMessage);
      
      // Use agent wallet approach like placeOrderWithAgentWallet
      const agentWallet = getOrCreateSessionAgentWallet();
      const transport = new hl.HttpTransport({ isTestnet: false }); // true for mainnet
      const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
      
      // Find the position being closed
      const positionToClose = positions.find(pos => pos.coin === orderData.symbol);
      if (!positionToClose) {
        throw new Error(`Position not found for ${orderData.symbol}`);
      }

      // Get current market price for market orders (like TradingPanel.js does)
      let finalPrice;
      if (orderData.type === 'market') {
        // For market orders, start with current market price
        let basePrice = currentPrices[orderData.symbol] || positionToClose.markPrice;
        
        // Apply price adjustment for market orders (matching TradingPanel.js logic)
        if (orderData.side === 'Buy') {
          // Buying to close short position - increase price by 5% to ensure fill
          finalPrice = basePrice * 1.05;
        } else {
          // Selling to close long position - decrease price by 5% to ensure fill
          finalPrice = basePrice * 0.95;
        }
      } else {
        // For limit orders, use the specified price
        finalPrice = orderData.price;
      }

      // Format price to prevent floating point precision issues
      const formattedPrice = assetInfo 
        ? formatPriceToMaxDecimals(finalPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot)
        : parseFloat(finalPrice.toFixed(6)).toString();

      console.log('💰 Using price for order:', {
        type: orderData.type,
        side: orderData.side,
        specifiedPrice: orderData.price,
        currentPrice: currentPrices[orderData.symbol],
        markPrice: positionToClose.markPrice,
        basePrice: orderData.type === 'market' ? (currentPrices[orderData.symbol] || positionToClose.markPrice) : null,
        adjustment: orderData.type === 'market' ? (orderData.side === 'Buy' ? '+5%' : '-5%') : 'none',
        rawFinalPrice: finalPrice,
        formattedPrice: formattedPrice
      });

      // Prepare order in nktkas SDK format
      const orderRequest = {
        orders: [{
          a: assetInfo.index, // asset index
          b: orderData.side === 'Buy', // isBuy
          p: formattedPrice, // Use properly formatted price to prevent deserialization errors
          s: orderData.size.toString(), // size as string
          r: true, // reduceOnly for closing positions
          t: {
            limit: {
              tif: orderData.type === 'market' ? 'FrontendMarket' : 'Gtc' // Use limit format for both market and limit orders
            }
          }
          // No client order ID needed for close orders
        }],
        grouping: 'na'
      };
      
      console.log('📋 Order request (HyperLiquid format):', JSON.stringify(orderRequest, null, 2));
      
      // Place the order using agent wallet
      const result = await exchClient.order(orderRequest);
      
      console.log('✅ Order placed successfully:', result);
      
      // Check if the order was successful
      if (result?.status === 'ok') {
        const orderResponse = result.response?.data?.statuses?.[0];
        
        if (orderResponse?.resting) {
          // alert(`✅ ${orderData.type.toUpperCase()} close order placed successfully!\n` +
          //       `Order ID: ${orderResponse.resting.oid}\n` +
          //       `Symbol: ${orderData.symbol}\n` +
          //       `Side: ${orderData.side}\n` +
          //       `Size: ${orderData.size}\n` +
          //       (orderData.price ? `Price: ${orderData.price}` : 'Price: Market'));
        } else if (orderResponse?.filled) {
          // alert(`✅ ${orderData.type.toUpperCase()} close order filled immediately!\n` +
          //       `Symbol: ${orderData.symbol}\n` +
          //       `Size: ${orderResponse.filled.totalSz}\n` +
          //       `Average Price: ${orderResponse.filled.avgPx}\n` +
          //       `Order ID: ${orderResponse.filled.oid}`);
        } else if (orderResponse?.error) {
          throw new Error(orderResponse.error);
        } else {
          // Generic success
          // alert(`✅ ${orderData.type.toUpperCase()} close order submitted successfully for ${orderData.symbol}`);
        }
      } else {
        throw new Error(result?.error || 'Unknown error occurred');
      }
      
      // Refresh data to reflect the new order/position change
      setTimeout(() => {
        fetchUserData();
        fetchCurrentPrices();
      }, 2000); // Increased delay to ensure order is processed
      
    } catch (error) {
      console.error('❌ Error closing position:', error);
      
      // Provide more specific error messages
      let errorMessage = error.message;
      if (errorMessage.includes('Insufficient')) {
        errorMessage = 'Insufficient balance to place this order';
      } else if (errorMessage.includes('Invalid size')) {
        errorMessage = 'Invalid position size - check your available position';
      } else if (errorMessage.includes('Agent wallet')) {
        errorMessage = 'Agent wallet not properly configured. Please refresh and try again.';
      }
      
      // alert(`❌ Error closing position: ${errorMessage}\n\nPlease check:\n- Wallet is connected\n- Sufficient balance\n- Valid position size\n- Network connection`);
    }
  };

  // Generate a unique client order ID (cloid)
  const generateCloid = () => {
    // Generate a 128-bit hex string as required by HyperLiquid
    const hex = '0x' + Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return hex;
  };

  // Utility functions for price formatting (from TradingPanel.js)
  const countSignificantFigures = (value) => {
    const cleanValue = parseFloat(value).toString();
    const scientificMatch = cleanValue.match(/^(\d+\.?\d*)e/);
    
    if (scientificMatch) {
      const mantissa = scientificMatch[1].replace('.', '');
      return mantissa.length;
    }
    
    const withoutLeadingZeros = cleanValue.replace(/^0+/, '').replace('.', '');
    return withoutLeadingZeros.length;
  };

  const getHyperLiquidTickSize = (price, szDecimals) => {
    const MAX_DECIMALS = 6; // For perpetuals (spot uses 8)
    const maxPriceDecimals = MAX_DECIMALS - szDecimals;
    const tickSize = Math.pow(10, -maxPriceDecimals);
    return tickSize;
  };

  const roundToHyperLiquidTick = (price, szDecimals) => {
    const tickSize = getHyperLiquidTickSize(price, szDecimals);
    const rounded = Math.round(price / tickSize) * tickSize;
    
    const maxPriceDecimals = 6 - szDecimals;
    return parseFloat(rounded.toFixed(maxPriceDecimals));
  };

  const formatPriceToMaxDecimals = (value, szDecimals, isSpot = false) => {
    if (!value || value === '') return value;
    
    let num = parseFloat(value);
    if (isNaN(num)) return value;
    
    const valueStr = value.toString();
    
    // Check significant figures limit (max 5)
    const sigFigs = countSignificantFigures(valueStr);
    if (sigFigs > 5) {
      num = parseFloat(num.toPrecision(5));
    }
    
    // Apply HyperLiquid tick size rounding
    const tickRounded = roundToHyperLiquidTick(num, szDecimals);
    
    return tickRounded.toString();
  };

  // Function to get TP/SL prices for a position
  const getTPSLForPosition = (positionCoin) => {
    if (!openOrders || openOrders.length === 0) {
      return { takeProfit: null, stopLoss: null };
    }

    // Find the position to get its direction
    const position = positions.find(pos => pos.coin === positionCoin);
    if (!position) {
      return { takeProfit: null, stopLoss: null };
    }

    // Find all reduce-only orders for this coin
    const reduceOnlyOrders = openOrders.filter(order => 
      order.symbol === positionCoin && 
      order.reduceOnly &&
      order.remaining > 0 // Only active orders
    );

    if (reduceOnlyOrders.length === 0) {
      return { takeProfit: null, stopLoss: null };
    }

    const isLongPosition = position.side === 'Long';
    const entryPrice = position.entryPrice;

    let takeProfit = null;
    let stopLoss = null;

    // For each reduce-only order, determine if it's TP or SL based on price relative to entry
    reduceOnlyOrders.forEach(order => {
      const orderPrice = order.price;
      
      if (isLongPosition) {
        // For Long positions:
        // TP should be above entry price (selling higher)
        // SL should be below entry price (selling lower to cut losses)
        if (orderPrice > entryPrice) {
          takeProfit = orderPrice;
        } else if (orderPrice < entryPrice) {
          stopLoss = orderPrice;
        }
      } else {
        // For Short positions:
        // TP should be below entry price (buying back lower)  
        // SL should be above entry price (buying back higher to cut losses)
        if (orderPrice < entryPrice) {
          takeProfit = orderPrice;
        } else if (orderPrice > entryPrice) {
          stopLoss = orderPrice;
        }
      }
    });

    // Debug logging removed - TP/SL inference working correctly

    return { 
      takeProfit: takeProfit, 
      stopLoss: stopLoss 
    };
  };

  // Empty state message component
  const EmptyStateMessage = ({ message }) => (
    <tr>
      <td colSpan="100%" className="p-8 text-center text-gray-400">
        {message}
      </td>
    </tr>
  );

  // Error state message component
  const ErrorMessage = ({ message }) => (
    <div className="p-4 mb-4 bg-red-900/20 border border-red-700 rounded text-red-400">
      <p>⚠️ {message}</p>
      <button 
        onClick={fetchUserData}
        className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
      >
        Retry
      </button>
    </div>
  );

  const tabs = [
    { name: 'Positions', count: positions.length },
    { name: 'Open Orders', count: openOrders.length },
    { name: 'Trade History', count: trades.length }
  ];

  return (
    <div className={`bg-[#0d0c0e] text-white ${className}`}>
      {/* Tab Navigation */}
      <div className="flex justify-between items-center border-b border-[#1F1E23]">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`px-4 py-3 font-[400] text-[14px] leading-[21px] transition-colors ease-in duration-200 cursor-pointer ${
                activeTab === tab.name
                  ? 'text-white border-b-2 border-white'
                  : 'text-[#919093] hover:text-white hover:bg-[#1a1a1f]'
              }`}
            >
              {tab.name} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2 px-4">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
              autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
            } text-white`}
          >
            Auto
          </button>
          <button 
            onClick={() => {
              console.log('🔄 Manual refresh triggered');
              fetchUserData();
              fetchCurrentPrices();
            }}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors cursor-pointer"
            title="Refresh positions and TP/SL data"
          >
            ↻
          </button>
          <button className="px-3 py-1 text-[14px] bg-[#1a1a1f] hover:bg-[#2a2a2f] text-white rounded transition-colors cursor-pointer border border-[#1F1E23]">
            Filter
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && <ErrorMessage message={error} />}

      {/* Content Area */}
      <div className="min-h-[300px]">
        {!isConnected ? (
          <div className="overflow-x-auto">
            {/* Show appropriate table header based on active tab */}
            {activeTab === 'Positions' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Position Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Entry Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Mark Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">PNL (ROE %)</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Liq. Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Margin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Funding</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Close All</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]" title="Take Profit / Stop Loss prices">TP/SL</th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyStateMessage message="Connect your wallet to view your positions" />
                </tbody>
              </table>
            )}

            {activeTab === 'Open Orders' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Symbol</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Side</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Type</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Filled</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Remaining</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Reduce Only</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyStateMessage message="Connect your wallet to view your orders" />
                </tbody>
              </table>
            )}

            {activeTab === 'Trade History' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Time</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Symbol</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Side</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trade Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Fee</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Closed PnL</th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyStateMessage message="Connect your wallet to view your trades" />
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Positions Tab */}
            {activeTab === 'Positions' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Position Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Entry Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Mark Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">PNL (ROE %)</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Liq. Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Margin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Funding</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Close All</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]" title="Take Profit / Stop Loss prices">TP/SL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <EmptyStateMessage message="No open positions" />
                  ) : (
                    positions.map((position, index) => (
                      <tr key={`${position.coin}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-white">{position.coin}</span>
                            <span className={`px-1 py-0.5 text-xs rounded ${
                              position.side === 'Long' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                            }`}>
                              {position.leverage}x
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className={position.side === 'Long' ? 'text-green-400' : 'text-red-400'}>
                            {position.side === 'Long' ? '' : '-'}{formatNumber(Math.abs(position.size), 4)} {position.coin}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">${formatNumber(position.positionValue)}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(position.entryPrice)}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(position.markPrice)}</td>
                        <td className="p-3 text-right font-mono">
                          <div className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            <div>{position.pnl >= 0 ? '+' : ''}${formatNumber(position.pnl)} ({position.pnlPercentage >= 0 ? '+' : ''}{formatNumber(position.pnlPercentage, 2)}%)</div>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">{position.liquidationPrice > 0 ? formatNumber(position.liquidationPrice) : 'N/A'}</td>
                        <td className="p-3 text-right font-mono">
                          <span className="text-gray-400">${formatNumber(position.marginUsed)} ({position.side === 'Long' ? 'Cross' : position.side === 'Short' ? 'Cross' : 'Isolated'})</span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className={position.funding >= 0 ? 'text-green-400' : 'text-red-400'}>
                            ${formatNumber(position.funding, 4)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex space-x-1">
                            <button 
                              onClick={() => openLimitCloseModal(position)}
                              className="px-2 py-1 text-xs bg-[#1a1a1f] hover:bg-[#2a2a2f] text-gray-300 rounded transition-colors border border-[#1F1E23] cursor-pointer"
                            >
                              Limit
                            </button>
                            <button 
                              onClick={() => openMarketCloseModal(position)}
                              className="px-2 py-1 text-xs bg-[#1a1a1f] hover:bg-[#2a2a2f] text-gray-300 rounded transition-colors border border-[#1F1E23] cursor-pointer"
                            >
                              Market
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {(() => {
                            const tpsl = getTPSLForPosition(position.coin);
                            return (
                              <div className="flex space-x-1 items-center">
                                {/* Take Profit */}
                                <button 
                                  className={`px-2 py-1 text-xs rounded transition-colors ${
                                    tpsl.takeProfit 
                                      ? 'bg-green-900 text-green-400 cursor-pointer hover:bg-green-800' 
                                      : 'text-gray-500 cursor-not-allowed'
                                  }`}
                                  title={tpsl.takeProfit ? `Take Profit at ${tpsl.takeProfit}` : 'No Take Profit set'}
                                  onClick={tpsl.takeProfit ? () => openTPSLModal(position) : undefined}
                                >
                                  {tpsl.takeProfit ? formatNumber(tpsl.takeProfit) : '--'}
                                </button>
                                
                                <span className="text-gray-500">/</span>
                                
                                {/* Stop Loss */}
                                <button 
                                  className={`px-2 py-1 text-xs rounded transition-colors ${
                                    tpsl.stopLoss 
                                      ? 'bg-red-900 text-red-400 cursor-pointer hover:bg-red-800' 
                                      : 'text-gray-500 cursor-not-allowed'
                                  }`}
                                  title={tpsl.stopLoss ? `Stop Loss at ${tpsl.stopLoss}` : 'No Stop Loss set'}
                                  onClick={tpsl.stopLoss ? () => openTPSLModal(position) : undefined}
                                >
                                  {tpsl.stopLoss ? formatNumber(tpsl.stopLoss) : '--'}
                                </button>
                                
                                {/* Edit Button */}
                                <button 
                                  onClick={() => openTPSLModal(position)}
                                  className="px-1 py-1 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer ml-1"
                                  title="Set/Edit Take Profit / Stop Loss"
                                >
                                  ✏️
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Open Orders Tab */}
            {activeTab === 'Open Orders' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Symbol</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Side</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Type</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Filled</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Remaining</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Reduce Only</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.length === 0 ? (
                    <EmptyStateMessage message="No open orders" />
                  ) : (
                    openOrders.map((order, index) => (
                      <tr key={`${order.orderId}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3 font-medium">{order.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            order.side === 'Buy' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                          }`}>
                            {order.side}
                          </span>
                        </td>
                        <td className="p-3 text-gray-300">{order.type}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(order.size, 4)}</td>
                        <td className="p-3 text-right font-mono">${formatNumber(order.price)}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(order.filled, 4)}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(order.remaining, 4)}</td>
                        <td className="p-3 text-center">
                          {order.reduceOnly ? (
                            <span className="px-2 py-1 text-xs bg-orange-900 text-orange-400 rounded">RO</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => cancelOrder(order.orderId, order.symbol)}
                            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Trade History Tab */}
            {activeTab === 'Trade History' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Time</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Symbol</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Side</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trade Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Fee</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Closed PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <EmptyStateMessage message="No trades yet" />
                  ) : (
                    trades.map((trade, index) => (
                      <tr key={`${trade.symbol}-${trade.time}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3 text-gray-300 font-mono text-sm">{formatTime(trade.time)}</td>
                        <td className="p-3 font-medium">{trade.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            trade.side === 'Buy' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                          }`}>
                            {trade.side}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">{formatNumber(trade.size, 4)}</td>
                        <td className="p-3 text-right font-mono">${formatNumber(trade.price)}</td>
                        <td className="p-3 text-right font-mono">${formatNumber(trade.size * trade.price)}</td>
                        <td className="p-3 text-right font-mono text-gray-400">${formatNumber(trade.fee, 4)}</td>
                        <td className={`p-3 text-right font-mono ${
                          trade.closed === null ? 'text-gray-400' : 
                          trade.closed >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.closed === null ? '—' : 
                           `${trade.closed >= 0 ? '+' : ''}$${formatNumber(trade.closed)}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* TP/SL Modal */}
      <TPSLModal 
        isOpen={tpslModalOpen}
        onClose={closeTPSLModal}
        position={selectedPosition}
        currentPrice={selectedPosition ? currentPrices[selectedPosition.coin] || selectedPosition.markPrice : 0}
      />

      {/* Limit Close Modal */}
      <LimitCloseModal 
        isOpen={limitCloseModalOpen}
        onClose={closeLimitCloseModal}
        position={selectedPosition}
        currentPrice={selectedPosition ? currentPrices[selectedPosition.coin] || selectedPosition.markPrice : 0}
        onConfirm={handleClosePosition}
      />

      {/* Market Close Modal */}
      <MarketCloseModal 
        isOpen={marketCloseModalOpen}
        onClose={closeMarketCloseModal}
        position={selectedPosition}
        onConfirm={handleClosePosition}
      />
    </div>
  );
};

export default UserPositions;