// components/UserPositions.js
import React, { useState, useEffect, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { getOrCreateSessionAgentWallet, getAssetId } from '@/utils/hyperLiquidSDK';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import * as hl from '@nktkas/hyperliquid';
import TPSLModal from './TPSLModal';
import LimitCloseModal from './LimitCloseModal';
import MarketCloseModal from './MarketCloseModal';
import numeral from 'numeral';
import WebSocketService from '@/hooks/WebsocketService';

const UserPositions = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState('Positions');
  const [positions, setPositions] = useState([]);
  const [balances, setBalances] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [wsInitializing, setWsInitializing] = useState(false);
  const [tpslModalOpen, setTpslModalOpen] = useState(false);
  const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
  const [marketCloseModalOpen, setMarketCloseModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [sortField, setSortField] = useState('time');
  const [sortDirection, setSortDirection] = useState('desc');
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const refreshInterval = useRef(null);
  const wsService = useRef(null);

  // Initialize WebSocket service
  useEffect(() => {
    wsService.current = WebSocketService.getInstance();
    
    // Subscribe to webData2 for user data
    if (isConnected && address) {
      // Wait for websocket to be ready before subscribing
      const initializeWebSocket = async () => {
        setWsInitializing(true);
        try {
          if (!wsService.current.isHealthy()) {
            console.log('⏳ Waiting for WebSocket connection...');
            await wsService.current.waitForInitialization(500);
          }
          
          if (wsService.current.isHealthy()) {
            console.log('✅ WebSocket ready, subscribing to user data...');
            wsService.current.subscribeToUserData(address);
            
            // Subscribe to general webData2 updates
            wsService.current.subscribe('webData2', handleWebData2Update);
            
            // Subscribe to market data updates for real-time prices
            wsService.current.subscribe('marketDataUpdate', handleMarketDataUpdate);
          } else {
            console.log('⚠️ WebSocket not ready, will use API fallback');
          }
        } catch (error) {
          console.error('❌ WebSocket initialization failed:', error);
        } finally {
          setWsInitializing(false);
        }
      };
      
      initializeWebSocket();
    }
    
    return () => {
      if (wsService.current && address) {
        wsService.current.unsubscribeFromUserData(address);
        wsService.current.unsubscribeFromUserHistoricalOrders(address);
        wsService.current.unsubscribe('webData2', handleWebData2Update);
        wsService.current.unsubscribe('marketDataUpdate', handleMarketDataUpdate);
        wsService.current.unsubscribe('userHistoricalOrders', handleOrderHistoryUpdate);
      }
    };
  }, [isConnected, address]);

  // Handle webData2 updates from websocket
  const handleWebData2Update = (webData2Data) => {
    if (!webData2Data || !webData2Data.clearinghouseState) return;
    
    console.log('🔍 Received webData2 update:', {
      positions: webData2Data.clearinghouseState.assetPositions?.length || 0,
      orders: webData2Data.openOrders?.length || 0,
      accountValue: webData2Data.clearinghouseState.marginSummary?.accountValue,
      timestamp: new Date(webData2Data.serverTime).toLocaleTimeString(),
      hasAssetCtxs: !!webData2Data.assetCtxs,
      assetCtxsCount: webData2Data.assetCtxs?.length || 0,
      hasMeta: !!webData2Data.meta,
      universeCount: webData2Data.meta?.universe?.length || 0
    });
    
        // Process positions from webData2
    if (webData2Data.clearinghouseState.assetPositions) {
      // Debug: Show universe and assetCtxs mapping
      if (webData2Data.meta && webData2Data.meta.universe && webData2Data.assetCtxs) {
        // console.log('🔍 Universe tokens:', webData2Data.meta.universe.map(t => t.name));
        // console.log('🔍 Asset contexts count:', webData2Data.assetCtxs.length);
        // console.log('🔍 First few asset contexts:', webData2Data.assetCtxs.slice(0, 3).map((ctx, i) => ({
          // index: i,
          // coin: ctx.coin,
          // markPx: ctx.markPx
        // })));
      }
      
      const formattedPositions = webData2Data.clearinghouseState.assetPositions
        .filter(pos => parseFloat(pos.position.szi) !== 0)
        .map(pos => {
            const size = parseFloat(pos.position.szi);
            const entryPrice = parseFloat(pos.position.entryPx || 0);
            // Use mark price from webData2 assetCtxs if available, fallback to current prices
            const markPrice = getMarkPriceFromWebData2(webData2Data, pos.position.coin) || 
                             currentPrices[pos.position.coin] || 
                             parseFloat(pos.position.positionValue || 0) / Math.abs(size);
            const pnl = parseFloat(pos.position.unrealizedPnl || 0);
            const positionValue = Math.abs(size) * markPrice;
          // const pnlPercentage = entryPrice > 0 ? ((markPrice - entryPrice) / entryPrice) * 100 * (size > 0 ? 1 : -1) : 0;
          const leverage = parseFloat(pos.position.leverage?.value || 1);
          const marginUsed = parseFloat(pos.position.marginUsed || 0);
          const tokenIndex = webData2Data.meta.universe.findIndex(token => token.name === pos.position.coin);
          
          return {
            coin: pos.position.coin,
            size: size,
            positionValue: positionValue,
            entryPrice: entryPrice,
            markPrice: markPrice,
            pnl: pnl,
            // pnlPercentage: pnlPercentage,
            leverage: leverage,
            leverageType: pos.position.leverage?.type,
            liquidationPrice: parseFloat(pos.liquidationPx || 0),
            marginUsed: marginUsed,
            side: size > 0 ? 'Long' : 'Short',
            funding: parseFloat(pos.position.cumFunding?.sinceChange || 0),
            returnOnEquity: parseFloat(pos.position.returnOnEquity || 0),
            tokenIndex: tokenIndex
          };
        });
      
      setPositions(formattedPositions);
      console.log('✅ Positions updated from webData2:', formattedPositions);
    }
    
    // Process balances from webData2
    if (webData2Data.clearinghouseState.assetPositions) {
      const formattedBalances = webData2Data.clearinghouseState.assetPositions
        .filter(pos => parseFloat(pos.position.szi) === 0 && parseFloat(pos.position.marginUsed || 0) > 0)
        .map(pos => {
          const markPrice = getMarkPriceFromWebData2(webData2Data, pos.position.coin) || 
                           currentPrices[pos.position.coin] || 1;
          return {
            coin: pos.position.coin,
            balance: parseFloat(pos.position.marginUsed || 0),
            value: parseFloat(pos.position.marginUsed || 0) * markPrice
          };
        });
      
      setBalances(formattedBalances);
      console.log('✅ Balances updated from webData2:', formattedBalances);
    }
    
    // Process open orders from webData2
    if (webData2Data.openOrders) {
      const formattedOrders = webData2Data.openOrders.map(order => {
        const isReduceOnly = order.reduceOnly || false;
        const hasTrigger = !!(order.triggerCondition);
        let direction = 'N/A';
        if (order.side === 'A' && order.reduceOnly) {
          direction = 'Close Long';
        } else if (order.side === 'B' && order.reduceOnly) {
          direction = 'Close Short';
        } else if (order.side === 'A' && !order.reduceOnly) {
          direction = 'Long';
        } else if (order.side === 'B' && !order.reduceOnly) {
          direction = 'Short';
        }
        return {
          symbol: order.coin,
          direction: direction,
          type: order.orderType,
          size: parseFloat(order.sz),
          originalSize: parseFloat(order.origSz),
          price: order.limitPx,
          orderValue: parseFloat(order.limitPx) * parseFloat(order.sz),
          filled: parseFloat(order.sz) - parseFloat(order.sz), // webData2 doesn't provide filled amount
          remaining: parseFloat(order.sz),
          orderId: order.oid,
          timestamp: order.timestamp,
          triggerCondition: order.triggerCondition || 'N/A',
          reduceOnly: isReduceOnly,
          isTrigger: hasTrigger,
          triggerPrice: order.triggerPx ? parseFloat(order.triggerPx) : null,
          tpslType: null, // Will be inferred from order analysis
          isMarket: order.orderType === 'Market',
          rawOrder: order
        };
      });
      
      setOpenOrders(formattedOrders);
      console.log('✅ Orders updated from webData2:', formattedOrders);
    }
    
    // Process spot balances if available
    if (webData2Data.spotState && webData2Data.spotState.balances) {
      const spotBalances = webData2Data.spotState.balances
        .filter(balance => parseFloat(balance.total) > 0)
        .map(balance => ({
          coin: balance.coin,
          balance: parseFloat(balance.total),
          value: parseFloat(balance.total) * (currentPrices[balance.coin] || 1)
        }));
      
      // Merge with existing balances
      setBalances(prev => {
        const nonSpotBalances = prev.filter(b => !spotBalances.find(sb => sb.coin === b.coin));
        return [...nonSpotBalances, ...spotBalances];
      });
    }
    
    // Update positions with real-time mark prices from assetCtxs
    updatePositionsWithRealTimePrices(webData2Data);
  };

  // Handle market data updates for real-time prices
  const handleMarketDataUpdate = (marketData) => {
    if (marketData && marketData.tokens) {
      const priceMap = {};
      marketData.tokens.forEach(token => {
        if (token.price > 0) {
          priceMap[token.symbol] = token.price;
        }
      });
      
      setCurrentPrices(prev => ({ ...prev, ...priceMap }));
      
      // Update positions with new mark prices
      setPositions(prev => prev.map(pos => {
        const newMarkPrice = priceMap[pos.coin];
        if (newMarkPrice && newMarkPrice !== pos.markPrice) {
          const newPositionValue = Math.abs(pos.size) * newMarkPrice;
          // const newPnlPercentage = pos.entryPrice > 0 ? 
          //   ((newMarkPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'Long' ? 1 : -1) : 0;
          
          return {
            ...pos,
            markPrice: newMarkPrice,
            positionValue: newPositionValue,
            // pnlPercentage: newPnlPercentage
          };
        }
        return pos;
      }));
    }
  };

  // Update positions with real-time mark prices from webData2 assetCtxs
  const updatePositionsWithRealTimePrices = (webData2Data) => {
    if (!webData2Data.assetCtxs || !webData2Data.meta || !webData2Data.meta.universe || !positions.length) return;
    
    const updatedPositions = positions.map(pos => {
      // Find the token index in the universe array
      const tokenIndex = webData2Data.meta.universe.findIndex(token => token.name === pos.coin);
      if (tokenIndex !== -1 && webData2Data.assetCtxs[tokenIndex]) {
        const assetCtx = webData2Data.assetCtxs[tokenIndex];
        if (assetCtx.markPx) {
          const newMarkPrice = parseFloat(assetCtx.markPx);
          if (newMarkPrice !== pos.markPrice) {
            const newPositionValue = Math.abs(pos.size) * newMarkPrice;
            // const newPnlPercentage = pos.entryPrice > 0 ? 
            //   ((newMarkPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'Long' ? 1 : -1) : 0;
            
            console.log(`🔄 Updated mark price for ${pos.coin} (index ${tokenIndex}): ${pos.markPrice} → ${newMarkPrice}`);
            
            return {
              ...pos,
              markPrice: newMarkPrice,
              positionValue: newPositionValue,
              // pnlPercentage: newPnlPercentage
            };
          }
        }
      }
      return pos;
    });
    
    setPositions(updatedPositions);
  };

  // Helper function to get mark price from webData2 assetCtxs by token index
  const getMarkPriceFromWebData2 = (webData2Data, coin) => {
    if (webData2Data.assetCtxs && webData2Data.meta && webData2Data.meta.universe) {
      // Find the token index in the universe array
      const tokenIndex = webData2Data.meta.universe.findIndex(token => token.name === coin);
      if (tokenIndex !== -1 && webData2Data.assetCtxs[tokenIndex]) {
        const assetCtx = webData2Data.assetCtxs[tokenIndex];
        if (assetCtx.markPx) {
          // console.log(`🔍 Mark price from webData2 for ${coin} (index ${tokenIndex}):`, assetCtx.markPx);
          return parseFloat(assetCtx.markPx);
        }
      }
    }
    return null;
  };

  // Auto-refresh functionality (now primarily for fallback and initial data)
  useEffect(() => {
    if (autoRefresh && isConnected && address && walletClient && !loading) {
      refreshInterval.current = setInterval(() => {
        // Only fetch current prices as fallback, positions come from websocket
        fetchCurrentPrices();
      }, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh, isConnected, address, walletClient, loading]);

  // Fetch current market prices for all assets (fallback method)
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
        
        setCurrentPrices(prev => ({ ...prev, ...priceMap }));
        // console.log('✅ Current prices updated (fallback):', priceMap);
      }
    } catch (error) {
      console.error('❌ Error fetching current prices:', error);
    }
  };

  // Fetch user data when wallet is connected (now primarily for initial load)
  useEffect(() => {
    if (isConnected && address && walletClient) {
      // Initial data load - positions will come from websocket
      fetchCurrentPrices();
      
      // If websocket is not ready, fetch initial data via API
      if (!wsService.current || !wsService.current.isHealthy()) {
        fetchInitialUserData();
      }
    } else {
      // Clear data when disconnected
      setPositions([]);
      setBalances([]);
      setOpenOrders([]);
      setTrades([]);
      setOrderHistory([]);
      setError(null);
      setCurrentPrices({});
    }
  }, [isConnected, address, walletClient]);

  // Fetch trade history when Trade History tab is selected
  useEffect(() => {
    if (isConnected && address && activeTab === 'Trade History') {
      fetchTradeHistory();
    }
  }, [isConnected, address, activeTab]);

  // Subscribe to order history when Order History tab is selected
  useEffect(() => {
    if (isConnected && address && activeTab === 'Order History') {
      subscribeToOrderHistory();
    }
  }, [isConnected, address, activeTab]);

  // Subscribe to order history via WebSocket
  const subscribeToOrderHistory = () => {
    if (!wsService.current || !address) return;
    
    try {
      console.log('🔍 Subscribing to order history...');
      
      // Subscribe to userHistoricalOrders
      wsService.current.subscribeToUserHistoricalOrders(address);
      
      // Subscribe to order history updates
      wsService.current.subscribe('userHistoricalOrders', handleOrderHistoryUpdate);
      
    } catch (error) {
      console.error('❌ Error subscribing to order history:', error);
    }
  };

  // Handle order history updates from WebSocket
  const handleOrderHistoryUpdate = (historicalOrdersData) => {
    if (!historicalOrdersData || !historicalOrdersData.orderHistory) return;
    
    console.log('🔍 Received order history update:', {
      orderCount: historicalOrdersData.orderHistory.length,
      isSnapshot: historicalOrdersData.isSnapshot,
      user: historicalOrdersData.user
    });
    
    // Format the order history data to match our table structure
    const formattedOrderHistory = historicalOrdersData.orderHistory.map(orderEntry => {
      const order = orderEntry.order;
      const status = orderEntry.status;
      
      // Determine direction based on side
      let direction = 'Unknown';
      if (order.side === 'B') {
        direction = order.reduceOnly ? 'Close Short' : 'Long';
      } else if (order.side === 'A') {
        direction = order.reduceOnly ? 'Close Long' : 'Short';
      }
      
      // Determine order type
      let orderType = order.orderType || 'Market';
      if (order.isTrigger) {
        if (order.orderType === 'Market') {
          orderType = order.triggerCondition && order.triggerCondition.includes('above') ? 'Take Profit Market' : 'Stop Market';
        }
      }
      
      // Format filled size
      const filledSize = order.sz === '0.0' ? '--' : order.sz;
      
      // Determine if there are TP/SL orders (children)
      const hasTPSL = order.children && order.children.length > 0;
      
      return {
        time: order.timestamp,
        type: orderType,
        coin: order.coin,
        direction: direction,
        size: order.origSz || order.sz,
        filledSize: filledSize,
        orderValue: 'Market',
        price: 'Market',
        reduceOnly: order.reduceOnly || false,
        triggerConditions: order.triggerCondition || 'N/A',
        tpsl: hasTPSL ? 'View' : '--',
        status: status,
        orderId: order.oid.toString(),
        rawOrder: order,
        rawStatus: orderEntry
      };
    });
    
    setOrderHistory(formattedOrderHistory);
    console.log('✅ Order history updated from WebSocket:', formattedOrderHistory);
  };

  // Fetch trade history
  const fetchTradeHistory = async () => {
    if (!address) return;
    
    try {
      // console.log('🔍 Fetching trade history...');
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
          const formattedTrades = fillsData.slice(0, 100).map(trade => ({
            coin: trade.coin,
            px: parseFloat(trade.px),
            sz: parseFloat(trade.sz),
            side: trade.side,
            time: trade.time,
            startPosition: parseFloat(trade.startPosition || 0),
            dir: trade.dir || 'Unknown',
            closedPnl: parseFloat(trade.closedPnl || 0),
            hash: trade.hash,
            oid: trade.oid,
            crossed: trade.crossed,
            fee: parseFloat(trade.fee || 0),
            tid: trade.tid,
            feeToken: trade.feeToken || 'USDC',
            twapId: trade.twapId,
            // Additional calculated fields
            tradeValue: parseFloat(trade.sz) * parseFloat(trade.px),
            formattedTime: new Date(trade.time),
            direction: trade.dir || 'Unknown'
          }));
          setTrades(formattedTrades);
          console.log('✅ Trades loaded:', formattedTrades);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching trade history:', error);
    }
  };

  // Fetch initial user data via API (fallback when websocket is not ready)
  const fetchInitialUserData = async () => {
    if (!address || !walletClient) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch initial positions via API if websocket is not ready
      console.log('🔍 Fetching initial positions via API...');
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: address
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.clearinghouseState) {
          // Create a mock webData2 structure for consistency
          const mockWebData2 = {
            clearinghouseState: data.clearinghouseState,
            openOrders: [],
            serverTime: Date.now(),
            user: address
          };
          
          handleWebData2Update(mockWebData2);
        }
      }
      
      // Fetch open orders
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
        if (orders && Array.isArray(orders)) {
          const mockWebData2 = {
            clearinghouseState: { assetPositions: [] },
            openOrders: orders,
            serverTime: Date.now(),
            user: address
          };
          
          handleWebData2Update(mockWebData2);
        }
      }
      
    } catch (error) {
      console.error('❌ Error fetching initial user data:', error);
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

  const formatTradeTime = (timestamp) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const getSortedTrades = () => {
    if (!trades.length) return [];
    
    const sorted = [...trades].sort((a, b) => {
      let aVal, bVal;
      
      if (sortField === 'time') {
        aVal = a.time;
        bVal = b.time;
      } else if (sortField === 'closedPnl') {
        aVal = a.closedPnl;
        bVal = b.closedPnl;
      } else {
        return 0;
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return sorted;
  };

  const cancelOrder = async (orderId, symbol) => {

    try {
      console.log(`🗑️ Canceling order ${orderId} for ${symbol}`);
      
      // Get asset index for the symbol
      const assetIndex = getAssetId(symbol);
      if (assetIndex === undefined) {
        throw new Error(`Unknown symbol: ${symbol}`);
      }
      
      console.log(`📊 Asset index for ${symbol}: ${assetIndex}`);
      
      // Show loading state
      setLoading(true);
      
      // Use agent wallet approach like other functions in this file
      const agentWallet = getOrCreateSessionAgentWallet();
      const transport = new hl.HttpTransport({ isTestnet: false }); // false for mainnet
      const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
      
      // Cancel the order using the exchange client
      const cancelParams = {
        cancels: [{
          a: assetIndex,  // asset index
          o: orderId      // order ID
        }]
      };
      
      console.log('📤 Sending cancel request:', cancelParams);
      const result = await exchClient.cancel(cancelParams);
      
      console.log('✅ Order cancelled successfully:', result);
      
      // Show success message
      
      // Refresh data to reflect the cancellation
      await fetchInitialUserData();
      
    } catch (error) {
      console.error('❌ Error canceling order:', error);
      alert(`Failed to cancel order: ${error.message}`);
    } finally {
      setLoading(false);
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
        onClick={fetchInitialUserData}
        className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
      >
        Retry
      </button>
    </div>
  );

  const tabs = [
    { name: 'Positions', count: positions.length },
    { name: 'Open Orders', count: openOrders.length },
    { name: 'Trade History', count: trades.length },
    { name: 'Order History', count: orderHistory.length }
  ];

  // Get connection status for display
  const getConnectionStatus = () => {
    if (!wsService.current) return { status: 'disconnected', text: 'Disconnected' };
    
    const status = wsService.current.getConnectionStatus();
    if (status.isConnected && status.userSubscriptions.includes(`webData2:${address}`)) {
      return { status: 'connected', text: 'Live Data' };
    } else if (status.isConnected) {
      return { status: 'connecting', text: 'Connecting...' };
    } else {
      return { status: 'disconnected', text: 'API Mode' };
    }
  };

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
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Direction</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trade Value</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Fee</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Closed PNL</th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyStateMessage message="Connect your wallet to view your trades" />
                </tbody>
              </table>
            )}

            {activeTab === 'Order History' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Time</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Type</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Direction</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Filled Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Order Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Reduce Only</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trigger Conditions</th>
                    {/* <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">TP/SL</th> */}
                    <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Status</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyStateMessage message="Connect your wallet to view your order history" />
                </tbody>
              </table>
            )}
          </div>
        ) : wsInitializing ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">Initializing real-time connection...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a few seconds</p>
            </div>
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
                            {position.side === 'Long' ? '' : '-'}{Math.abs(position.size)} {position.coin}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">${formatNumber(position.positionValue)}</td>
                        <td className="p-3 text-right font-mono">{position.entryPrice}</td>
                        <td className="p-3 text-right font-mono">{position.markPrice}</td>
                        <td className="p-3 text-right font-mono">
                          <div className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            <div>{position.pnl >= 0 ? '+' : ''}${formatNumber(position.pnl)} ({position.returnOnEquity*100 >= 0 ? '+' : ''}{formatNumber(position.returnOnEquity*100, 1)}%)</div>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">{position.liquidationPrice > 0 ? formatNumber(position.liquidationPrice) : 'N/A'}</td>
                        <td className="p-3 text-right font-mono">
                          <span className="text-gray-400">${formatNumber(position.marginUsed)} ({position.leverageType})</span>
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
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Time</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Type</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Direction</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Original Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Order Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Reduce Only</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trigger Conditions</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.length === 0 ? (
                    <EmptyStateMessage message="No open orders" />
                  ) : (
                    openOrders.map((order, index) => (
                      <tr key={`${order.orderId}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3 font-medium text-left">{formatTradeTime(order.timestamp)}</td>
                        <td className="p-3 font-medium text-left">{order.type}</td>
                        <td className="p-3 font-medium text-left">{order.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            order.direction === 'Long' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {order.direction}
                          </span>
                        </td>
                        <td className="p-3 text-left text-gray-300">{order.size}</td>
                        <td className="p-3 text-left font-mono">{order.originalSize}</td>
                        <td className="p-3 text-left font-mono">${order.orderValue}</td>
                        <td className="p-3 text-left font-mono">{order.price}</td>
                        <td className="p-3 text-left font-mono">{order.reduceOnly ? 'Yes' : 'No'}</td>
                        <td className="p-3 text-left font-mono">
                          {order.triggerCondition || 'N/A'}
                        </td>
                        <td className="p-3 text-left">
                          <button
                            onClick={() => cancelOrder(order.orderId, order.symbol)}
                            disabled={loading}
                            className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
                              loading 
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            {loading ? 'Canceling...' : 'Cancel'}
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
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px] cursor-pointer hover:text-white" onClick={() => handleSort('time')}>
                      Time {getSortIcon('time')}
                    </th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Direction</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trade Value</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Fee</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px] cursor-pointer hover:text-white" onClick={() => handleSort('closedPnl')}>
                      Closed PNL {getSortIcon('closedPnl')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <EmptyStateMessage message="No trades yet" />
                  ) : (
                    getSortedTrades().map((trade, index) => (
                      <tr key={`${trade.coin}-${trade.time}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3 text-gray-300 font-mono text-sm">
                          {formatTradeTime(trade.time)}
                          <a 
                            href={`https://app.hyperliquid.xyz/explorer/tx/${trade.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-gray-500 hover:text-white transition-colors cursor-pointer"
                            title="View transaction on HyperLiquid Explorer"
                          >
                            ↗
                          </a>
                        </td>
                        <td className="p-3 font-medium text-cyan-400">{trade.coin}</td>
                        <td className="p-3">
                          <span className={`${
                            trade.dir.includes('Close') ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {trade.dir}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">{formatNumber(trade.px, 5)}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(trade.sz, 4)} {trade.coin}</td>
                        <td className="p-3 text-right font-mono">{formatNumber(trade.tradeValue, 2)} USDC</td>
                        <td className="p-3 text-right font-mono text-gray-400">{formatNumber(trade.fee, 2)} USDC</td>
                        <td className={`p-3 text-right font-mono ${
                          trade.closedPnl === 0 ? 'text-gray-300' : 
                          trade.closedPnl > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.closedPnl === 0 ? '-0.00 USDC' : 
                           `${trade.closedPnl > 0 ? '' : ''}${formatNumber(trade.closedPnl, 2)} USDC`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Order History Tab */}
            {activeTab === 'Order History' && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[#1F1E23]">
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px] cursor-pointer hover:text-white" onClick={() => handleSort('time')}>
                      Time {getSortIcon('time')}
                    </th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Type</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Coin</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Direction</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Size</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Filled Size</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Order Value</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Price</th>
                    <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Reduce Only</th>
                    <th className="text-left p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Trigger Conditions</th>
                    {/* <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">TP/SL</th> */}
                    <th className="text-center p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Status</th>
                    <th className="text-right p-3 font-[400] text-[#919093] text-[12px] leading-[16px]">Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orderHistory.length === 0 ? (
                    <EmptyStateMessage message="No order history yet" />
                  ) : (
                    orderHistory.map((order, index) => (
                      <tr key={`${order.orderId}-${index}`} className="border-b border-[#1F1E23] hover:bg-[#1a1a1f] transition-colors">
                        <td className="p-3 text-gray-300 font-mono text-sm">
                          {formatTradeTime(order.time)}
                        </td>
                        <td className="p-3 text-gray-300">{order.type}</td>
                        <td className="p-3 font-medium">
                          <span className={`${
                            order.direction.includes('Close') ?'text-red-400' : 'text-green-400'
                          }`}>
                            {order.coin}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`${
                            order.direction.includes('Close') ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {order.direction}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">{order.size}</td>
                        <td className="p-3 text-right font-mono">{order.filledSize}</td>
                        <td className="p-3 text-gray-300">{order.orderValue}</td>
                        <td className="p-3 text-gray-300">{order.price}</td>
                        <td className="p-3 text-center">
                          {order.reduceOnly ? (
                            <span className="text-green-400">Yes</span>
                          ) : (
                            <span className="text-gray-500">No</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-300 text-sm">
                          {order.triggerConditions === 'N/A' ? (
                            <span className="text-gray-500">N/A</span>
                          ) : (
                            <span className="text-blue-400">{order.triggerConditions}</span>
                          )}
                        </td>
                        {/* <td className="p-3 text-center">
                          {order.tpsl === '--' ? (
                            <span className="text-gray-500">--</span>
                          ) : (
                            <span className="text-cyan-400 cursor-pointer hover:text-white transition-colors">View</span>
                          )}
                        </td> */}
                        <td className="p-3 text-center">
                          <span className={`${
                            order.status === 'Filled' || order.status === 'Triggered' ? 'text-green-400' :
                            order.status === 'Open' || order.status === 'Canceled' ? 'text-cyan-400' :
                            order.status === 'Rejected' ? 'text-red-400' : 'text-gray-300'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-gray-400 text-sm">{order.orderId}</td>
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