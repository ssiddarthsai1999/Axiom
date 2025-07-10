// components/OrderBook.js
import React, { useState, useMemo } from 'react';
import numeral from 'numeral';

const OrderBook = ({ 
  selectedSymbol, 
  orderBookData, 
  tradesData, 
  className = '' 
}) => {
  const [activeTab, setActiveTab] = useState('Order Book');

  // Calculate spread from order book data
  const spread = useMemo(() => {
    if (orderBookData.asks.length > 0 && orderBookData.bids.length > 0) {
      const bestAsk = orderBookData.asks[0].price;
      const bestBid = orderBookData.bids[0].price;
      const spreadAbs = bestAsk - bestBid;
      const spreadPerc = (spreadAbs / bestBid) * 100;
      
      return {
        absolute: spreadAbs,
        percentage: spreadPerc
      };
    }
    return { absolute: 0, percentage: 0 };
  }, [orderBookData]);

  const formatPrice = (price) => {
    return numeral(price).format('0,0.0');
  };

  const formatAmount = (amount) => {
    return numeral(amount).format('0,0');
  };

  const formatTotal = (total) => {
    return numeral(total).format('0,0.000a').toUpperCase();
  };

  return (
    <div className={`bg-black h-full text-white ${className}`}>
      {/* Header Tabs */}
      <div className="flex border-b border-gray-800">
        <button 
          className={`px-4 py-3 text-sm font-medium ${
            activeTab === 'Order Book' 
              ? 'border-b-2 border-white text-white' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('Order Book')}
        >
          Order Book
        </button>
        <button 
          className={`px-4 py-3 text-sm font-medium ${
            activeTab === 'Trades' 
              ? 'border-b-2 border-white text-white' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('Trades')}
        >
          Trades
        </button>
      </div>

      {/* Order Book Content */}
      {activeTab === 'Order Book' && (
        <div className="flex flex-col h-full">
          {/* Column Headers */}
          <div className="grid grid-cols-3 gap-4 px-4 py-2 text-xs text-gray-400 border-b border-gray-800">
            <div className="text-left">Price</div>
            <div className="text-right">Amount (USD)</div>
            <div className="text-right">Total (USD)</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Asks (Sell Orders) */}
            <div className="space-y-0">
              {orderBookData.asks.slice(0, 15).reverse().map((ask, index) => (
                <div 
                  key={`ask-${index}`}
                  className="grid grid-cols-3 gap-4 px-4 py-1 text-xs hover:bg-gray-900 transition-colors relative"
                >
                  {/* Background bar for visual depth */}
                  <div 
                    className="absolute right-0 top-0 h-full bg-red-900 opacity-20 bg-opacity-100"
                    style={{ 
                      width: orderBookData.asks.length > 0 
                        ? `${Math.min((ask.total / Math.max(...orderBookData.asks.map(a => a.total))) * 100, 100)}%` 
                        : '0%'
                    }}
                  />
                  
                  <div className="text-red-400 font-mono relative z-10">
                    {formatPrice(ask.price)}
                  </div>
                  <div className="text-right text-white font-mono relative z-10">
                    {formatAmount(ask.amount)}
                  </div>
                  <div className="text-right text-gray-300 font-mono relative z-10">
                    {formatTotal(ask.total)}
                  </div>
                </div>
              ))}
            </div>

            {/* Spread */}
            <div className="px-4 py-2 border-y border-gray-800 bg-gray-900">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Spread:</span>
                <div className="flex space-x-2">
                  <span className="text-white font-mono">
                    {formatPrice(spread.absolute)}
                  </span>
                  <span className="text-gray-400">
                    {spread.percentage.toFixed(3)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Bids (Buy Orders) */}
            <div className="space-y-0">
              {orderBookData.bids.slice(0, 15).map((bid, index) => (
                <div 
                  key={`bid-${index}`}
                  className="grid grid-cols-3 gap-4 px-4 py-1 text-xs hover:bg-gray-900 transition-colors relative"
                >
                  {/* Background bar for visual depth */}
                  <div 
                    className="absolute right-0 top-0 h-full bg-green-900 opacity-20 bg-opacity-10"
                    style={{ 
                      width: orderBookData.bids.length > 0 
                        ? `${Math.min((bid.total / Math.max(...orderBookData.bids.map(b => b.total))) * 100, 100)}%` 
                        : '0%'
                    }}
                  />
                  
                  <div className="text-green-400 font-mono relative z-10">
                    {formatPrice(bid.price)}
                  </div>
                  <div className="text-right text-white font-mono relative z-10">
                    {formatAmount(bid.amount)}
                  </div>
                  <div className="text-right text-gray-300 font-mono relative z-10">
                    {formatTotal(bid.total)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Trades Content */}
      {activeTab === 'Trades' && (
        <div className="flex flex-col h-full">
          {/* Column Headers for Trades */}
          <div className="grid grid-cols-3 gap-4 px-4 py-2 text-xs text-gray-400 border-b border-gray-800">
            <div className="text-left">Price</div>
            <div className="text-right">Size (USD)</div>
            <div className="text-right">Age</div>
          </div>

          {/* Trades List */}
          <div className="flex-1 overflow-y-auto">
            {tradesData.length > 0 ? (
              tradesData.map((trade, index) => (
                <div 
                  key={`trade-${index}`}
                  className="grid grid-cols-3 gap-4 px-4 py-1 text-xs hover:bg-gray-900 transition-colors"
                >
                  <div className={`font-mono ${trade.side === 'B' ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPrice(trade.price)}
                  </div>
                  <div className="text-right text-white font-mono">
                    ${numeral(trade.size * trade.price).format('0,0.00')}
                  </div>
                  <div className="text-right text-gray-400">
                    {trade.ago}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-400">
                No recent trades
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBook;