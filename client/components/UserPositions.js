// components/UserPositions.js
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import numeral from 'numeral';

const UserPositions = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState('Positions');
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const { address, isConnected } = useAccount();

  // Fetch user data when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      fetchUserData();
    } else {
      // Clear data when disconnected
      setPositions([]);
      setOpenOrders([]);
      setTrades([]);
    }
  }, [isConnected, address, activeTab]);

  const fetchUserData = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      // Fetch positions
      if (activeTab === 'Positions') {
        const userState = await hyperliquidUtils.getUserAccountState(address, false);
        if (userState && userState.assetPositions) {
          const formattedPositions = userState.assetPositions
            .filter(pos => parseFloat(pos.position.szi) !== 0)
            .map(pos => ({
              symbol: pos.position.coin,
              size: parseFloat(pos.position.szi),
              entryPrice: parseFloat(pos.position.entryPx || 0),
              markPrice: parseFloat(pos.markPx || 0),
              pnl: parseFloat(pos.position.unrealizedPnl || 0),
              leverage: parseFloat(pos.leverage?.value || 1),
              liquidationPrice: parseFloat(pos.liquidationPx || 0),
              marginUsed: parseFloat(pos.marginUsed || 0),
              side: parseFloat(pos.position.szi) > 0 ? 'Long' : 'Short'
            }));
          setPositions(formattedPositions);
        }
      }
      
      // Fetch open orders
      if (activeTab === 'Open Orders') {
        const orders = await hyperliquidUtils.getUserOpenOrders(address, false);
        if (orders && Array.isArray(orders)) {
          const formattedOrders = orders.map(order => ({
            symbol: order.coin,
            side: order.side === 'B' ? 'Buy' : 'Sell',
            type: order.orderType || 'Limit',
            size: parseFloat(order.sz),
            price: parseFloat(order.limitPx),
            filled: parseFloat(order.sz) - parseFloat(order.remainingSize || order.sz),
            remaining: parseFloat(order.remainingSize || order.sz),
            orderId: order.oid,
            timestamp: order.timestamp,
            triggerCondition: order.triggerCondition || 'N/A'
          }));
          setOpenOrders(formattedOrders);
        }
      }
      
      // Fetch recent trades
      if (activeTab === 'Trades') {
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
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
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
      // Implementation would need proper wallet signing
      console.log(`Canceling order ${orderId} for ${symbol}`);
      // await hyperliquidUtils.cancelOrder(assetIndex, orderId, signer, false);
      // Refresh orders after canceling
      fetchUserData();
    } catch (error) {
      console.error('Error canceling order:', error);
    }
  };

  const tabs = ['Positions', 'Open Orders', 'Trades'];

  return (
    <div className={`bg-[#0d0c0e] text-white ${className}`}>
      {/* Tab Navigation */}
      <div className="flex border-b border-[#1F1E23]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 font-[500] text-[14px] leading-[21px]  font-mono transition-colors ease-in duration-200 cursor-pointer ${
              activeTab === tab
                ? 'text-[#C9C9C9]  border-b-2 border-white '
                : 'text-[#919093] hover:text-white hover:bg-[#1a1a1f]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[10px]">
        {!isConnected ? (
          <div className="flex items-center justify-center ">
            <div className="text-center">
              <div className="text-gray-400 text-lg mb-2">Connect your wallet</div>
              <div className="text-gray-500 text-sm">to view your {activeTab.toLowerCase()}</div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center ">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Positions Tab */}
            {activeTab === 'Positions' && (
              <div>
                {positions.length === 0 ? (
                  <div className="flex items-center justify-center ">
                    <div className="text-gray-400">No open positions</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[1F1E23]">
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Symbol</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Size</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Entry Price</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Mark Price</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">PnL</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Liquidation Price</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Margin Used (USDC)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((position, index) => (
                          <tr key={`${position.symbol}-${index}`} className="border-b border-[1F1E23] hover:bg-[#1a1a1f] transition-colors">
                            <td className="p-4">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium">{position.symbol}</span>
                                <span className={`px-2 py-1 text-xs rounded ${
                                  position.side === 'Long' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                                }`}>
                                  {position.side}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-mono">{formatNumber(Math.abs(position.size), 4)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(position.entryPrice)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(position.markPrice)}</td>
                            <td className={`p-4 text-right font-mono ${
                              position.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {position.pnl >= 0 ? '+' : ''}${formatNumber(position.pnl)}
                            </td>
                            <td className="p-4 text-right font-mono">${formatNumber(position.liquidationPrice)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(position.marginUsed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Open Orders Tab */}
            {activeTab === 'Open Orders' && (
              <div>
                {openOrders.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-gray-400">No open orders</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[1F1E23]">
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Symbol</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Side</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Type</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Size</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Price</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Filled</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Trigger Condition</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openOrders.map((order, index) => (
                          <tr key={`${order.orderId}-${index}`} className="border-b border-[1F1E23] hover:bg-[#1a1a1f] transition-colors">
                            <td className="p-4 font-medium">{order.symbol}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 text-xs rounded ${
                                order.side === 'Buy' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                              }`}>
                                {order.side}
                              </span>
                            </td>
                            <td className="p-4 text-gray-300">{order.type}</td>
                            <td className="p-4 text-right font-mono">{formatNumber(order.size, 4)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(order.price)}</td>
                            <td className="p-4 text-right font-mono">{formatNumber(order.filled, 4)}</td>
                            <td className="p-4 text-right text-gray-400">{order.triggerCondition}</td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => cancelOrder(order.orderId, order.symbol)}
                                className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Trades Tab */}
            {activeTab === 'Trades' && (
              <div>
                {trades.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-gray-400">No trades yet</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[1F1E23]">
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Time</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Symbol</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Side</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Size</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Price</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Trade Value</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Fee</th>
                          <th className="text-left p-4 font-[400] text-[#919093] text-[12px] leading-[16px]  font-mono uppercase">Closed PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade, index) => (
                          <tr key={`${trade.symbol}-${trade.time}-${index}`} className="border-b border-[1F1E23] hover:bg-[#1a1a1f] transition-colors">
                            <td className="p-4 text-gray-300 font-mono text-sm">{formatTime(trade.time)}</td>
                            <td className="p-4 font-medium">{trade.symbol}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 text-xs rounded ${
                                trade.side === 'Buy' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                              }`}>
                                {trade.side}
                              </span>
                            </td>
                            <td className="p-4 text-right font-mono">{formatNumber(trade.size, 4)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(trade.price)}</td>
                            <td className="p-4 text-right font-mono">${formatNumber(trade.size * trade.price)}</td>
                            <td className="p-4 text-right font-mono text-gray-400">${formatNumber(trade.fee, 4)}</td>
                            <td className={`p-4 text-right font-mono ${
                              trade.closed === null ? 'text-gray-400' : 
                              trade.closed >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {trade.closed === null ? '—' : 
                               `${trade.closed >= 0 ? '+' : ''}$${formatNumber(trade.closed)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserPositions;