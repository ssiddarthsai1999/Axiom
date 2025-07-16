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
    <div className={`min-h-[200px] max-h-[1000px] font-mono text-white ${className}  border-l border-l-[#1F1E23]`}>
      {/* Header Tabs */}
      <div className="flex border-b border-[#1F1E23]">
        <button 
          className={`px-4 py-3 text-[12px] leading-[18px] border-b-2 border-transparent font-[500] duration-200 ease-in cursor-pointer ${
            activeTab === 'Order Book' 
              ? 'border-b-2 border-white text-[#E5E5E5]' 
              : 'text-[#919093] hover:text-white'
          }`}
          onClick={() => setActiveTab('Order Book')}
        >
          Order Book
        </button>
        <button 
          className={`px-4 py-3 text-[12px] leading-[18px] font-[500] cursor-pointer border-b-2 border-transparent  duration-200 ease-in  ${
            activeTab === 'Trades' 
               ? 'border-b-2 border-white text-[#E5E5E5]' 
              : 'text-[#919093] hover:text-white'
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
          <div className="grid grid-cols-3 gap-4 px-4 py-2 my-2  ">
            <div className="text-left text-[11px] leading-[18px] text-[#919093] font-[400]">Price</div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">Amount (USD)</div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">Total (USD)</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Asks (Sell Orders) */}
            <div className="space-y-0">
              {orderBookData.asks.slice(0, 15).reverse().map((ask, index) => (
                <div 
                  key={`ask-${index}`}
                  className="grid grid-cols-3 gap-4 px-4 py-1 my-1 text-xs hover:bg-gray-900 transition-colors relative"
                >
                  {/* Background bar for visual depth */}
<div 
  className="absolute left-0 top-0 h-full"
  style={{ 
    width: orderBookData.asks.length > 0 
      ? `${Math.min((ask.total / Math.max(...orderBookData.asks.map(a => a.total))) * 100, 100)}%` 
      : '0%',
    backgroundImage: 'linear-gradient(to right, #000000, #170a0d, #251114, #331618, #421a1a)'
  }}
/>






                  
                  <div className="text-[#FF5757] font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    {formatPrice(ask.price)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    {formatAmount(ask.amount)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    {formatTotal(ask.total)}
                  </div>
                </div>
              ))}
            </div>

            {/* Spread */}
            <div className="px-4 py-2  ">
              <div className="flex justify-center gap-1 items-center text-[12px] font-[400] leading-[16px] text-white  ">
                <span className="">Spread:</span>
                <div className="flex space-x-2">
                  <span className=" font-mono ">
                    {formatPrice(spread.absolute)}
                  </span>
                  <span className="text-[#889199]">
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
                  className="grid grid-cols-3 gap-4 px-4 py-1 text-xs my-1 hover:bg-gray-900 transition-colors relative"
                >
                  {/* Background bar for visual depth */}
        <div 
  className="absolute left-0 top-0 h-full opacity-20 bg-opacity-10"
  style={{ 
    width: orderBookData.bids.length > 0 
      ? `${Math.min((bid.total / Math.max(...orderBookData.bids.map(b => b.total))) * 100, 100)}%` 
      : '0%',
    background: 'linear-gradient(90deg, rgba(47, 227, 172, 0) 0%, #65FB9E 100%)'
  }}
/>

                  
                  <div className="text-[#65FB9E] font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    {formatPrice(bid.price)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    {formatAmount(bid.amount)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
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
          <div className="grid grid-cols-3 gap-4 px-4 py-2 my-2 ">
            <div className="text-left text-[11px] leading-[18px] text-[#919093] font-[400]">Price</div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">Size (USD)</div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">Age</div>
          </div>

          {/* Trades List */}
          <div className="flex-1 overflow-y-auto">
            {tradesData.length > 0 ? (
              tradesData.map((trade, index) => (
                <div 
                  key={`trade-${index}`}
                  className="grid grid-cols-3 gap-4 my-1 px-4 py-1 text-xs hover:bg-gray-900 transition-colors"
                >
                  <div className={` font-[400] leading-[18px] text-[12px]  font-mono relative z-10 ${trade.side === 'B' ? 'text-[#65FB9E]' : 'text-[#FF5757]'}`}>
                    {formatPrice(trade.price)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    ${numeral(trade.size * trade.price).format('0,0.00')}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
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