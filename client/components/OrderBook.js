// components/OrderBook.js
import React, { useState, useMemo, useEffect, useRef } from "react";
import numeral from "numeral";

const OrderBook = ({
  selectedSymbol,
  orderBookData,
  tradesData,
  szDecimals,
  className = "",
  onTickSizeChange = null, // Callback for tick size changes
}) => {
  const [activeTab, setActiveTab] = useState("Order Book");
  const [selectedTickSize, setSelectedTickSize] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Standard multipliers for tick size options
  const standardMultipliers = useMemo(() => {
    if (selectedSymbol === "BTC") {
      return [1, 10, 20, 50, 100, 1000, 10000];
    }
    return [1, 2, 5, 10, 100, 1000];
  }, [selectedSymbol]);

  // Calculate available tick size options based on szDecimals
  const tickSizeOptions = useMemo(() => {
    
    // Don't calculate if szDecimals is the fallback value (3) and we're not on BTC
    // This prevents incorrect calculations while marketData is being updated
    if (szDecimals === 3 && selectedSymbol !== 'BTC') {
      // console.log(`🔧 OrderBook: Waiting for correct szDecimals for ${selectedSymbol}`);
      return [];
    }
    
    const MAX_DECIMALS = 6; // For perpetuals (spot uses 8)
    const maxPriceDecimals = MAX_DECIMALS - szDecimals - 1;
    const baseTickSize = Math.pow(10, -maxPriceDecimals);
    
    return standardMultipliers.map(multiplier => {
      const tickSize = baseTickSize * multiplier;
      const tickSizeStr = tickSize.toFixed(maxPriceDecimals);
      // console.log(tickSize, tickSizeStr, baseTickSize, multiplier, selectedTickSize, selectedSymbol)
      // Calculate nSigFigs and mantissa based on the multiplier (not the tick size value)
      let nSigFigs, mantissa;

      if (selectedSymbol === "BTC") {
        if (multiplier === 10000) {
          nSigFigs = 2;
          mantissa = undefined;
        } else if (multiplier === 1000) {
          nSigFigs = 3;
          mantissa = undefined;
        } else if (multiplier === 100) {
          nSigFigs = 4;
          mantissa = undefined;
        } else if (multiplier === 50) {
          nSigFigs = 5;
          mantissa = 5;
        } else if (multiplier === 20) {
          nSigFigs = 5;
          mantissa = 2;
        } else if (multiplier === 10) {
          nSigFigs = 5;
          mantissa = undefined;
        } else {
          // Fallback
          nSigFigs = undefined;
          mantissa = undefined;
        }
      } else {
        if (multiplier === 1000) {
          nSigFigs = 2;
          mantissa = undefined;
        } else if (multiplier === 100) {
          nSigFigs = 3;
          mantissa = undefined;
        } else if (multiplier === 10) {
          nSigFigs = 4;
          mantissa = undefined;
        } else if (multiplier === 5) {
          nSigFigs = 5;
          mantissa = 5;
        } else if (multiplier === 2) {
          nSigFigs = 5;
          mantissa = 2;
        } else if (multiplier === 1) {
          nSigFigs = 5;
          mantissa = undefined;
        } else {
          // Fallback
          nSigFigs = 5;
          mantissa = undefined;
        }
      }

      return {
        value: tickSize,
        label: tickSizeStr,
        nSigFigs,
        mantissa
      };
    });
  }, [szDecimals, standardMultipliers, selectedSymbol]);

  // Set default tick size when component mounts or szDecimals changes
  useEffect(() => {
    if (tickSizeOptions.length > 0 && !selectedTickSize) {
      const defaultOption = tickSizeOptions[2]; // Default to 5x multiplier
      setSelectedTickSize(defaultOption);
      // Notify parent of initial tick size
      if (onTickSizeChange) {
        onTickSizeChange(defaultOption);
      }
    }
  }, [tickSizeOptions, selectedTickSize, onTickSizeChange]);

  // Reset selectedTickSize when symbol changes and szDecimals is updated
  useEffect(() => {
    if (szDecimals !== 3 || selectedSymbol === 'BTC') {
      setSelectedTickSize(null);
    }
  }, [selectedSymbol, szDecimals]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  // Use orderBookData directly since aggregation is now handled by Hyperliquid
  const displayOrderBook = orderBookData;

  const trimZeros = (v) =>
    `${+v}`.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");

  // Calculate spread from order book data
  const spread = useMemo(() => {
    if (displayOrderBook.asks.length > 0 && displayOrderBook.bids.length > 0) {
      const bestAsk = displayOrderBook.asks[0].price;
      const bestBid = displayOrderBook.bids[0].price;
      const spreadAbs = trimZeros((bestAsk - bestBid).toFixed(6));
      const spreadPerc = (spreadAbs / bestBid) * 100;

      return {
        absolute: spreadAbs,
        percentage: spreadPerc,
      };
    }
    return { absolute: 0, percentage: 0 };
  }, [displayOrderBook]);

  const formatPrice = (num) => {
    // Convert to number if passed as string
    const number = Number(num);

    // Handle invalid numbers
    if (isNaN(number)) return "";

    // Integer: format with commas
    if (Number.isInteger(number)) {
      return numeral(number).format("0,0");
    }

    // Decimal: keep full precision as string
    const parts = num.toString().split(".");
    const decimalPlaces = parts[1]?.length || 0;

    return numeral(number).format(`0,0.${"0".repeat(decimalPlaces)}`);
  };

  const formatAmount = (amount) => {
    // return numeral(amount).format('0,0');
    // Convert to number if passed as string
    const number = Number(amount);

    // Handle invalid numbers
    if (isNaN(number)) return "";

    // Integer: format with commas
    if (Number.isInteger(number)) {
      return numeral(number).format("0,0");
    }

    // Decimal: keep full precision as string
    const parts = amount.toString().split(".");
    const decimalPlaces = parts[1]?.length || 0;

    return numeral(number).format(`0,0.${"0".repeat(decimalPlaces)}`);
  };

  const formatTotal = (total) => {
    return numeral(total).format("0,0.000a").toUpperCase();
  };

  return (
    <div
      className={`min-h-[200px] overflow-hidden max-h-[562px] font-mono text-white ${className}   border-l border-l-[#1F1E23]`}
    >
      {/* Header Tabs */}
      <div className="flex items-center gap-5 border-b border-[#1F1E23] px-2">
        <button
          className={` py-3 text-[12px] leading-[18px] border-b-2 border-transparent text-start font-[500] duration-200 ease-in cursor-pointer ${
            activeTab === "Order Book"
              ? "border-b-2 border-white text-[#E5E5E5]"
              : "text-[#919093] hover:text-white"
          }`}
          onClick={() => setActiveTab("Order Book")}
        >
          Order Book
        </button>
        <button
          className={`px-4 py-3 text-[12px] leading-[18px] font-[500] cursor-pointer border-b-2 border-transparent  duration-200 ease-in  ${
            activeTab === "Trades"
              ? "border-b-2 border-white text-[#E5E5E5]"
              : "text-[#919093] hover:text-white"
          }`}
          onClick={() => setActiveTab("Trades")}
        >
          Trades
        </button>
      </div>

      {/* Order Book Content */}
      {activeTab === "Order Book" && (
        <div className="flex flex-col h-full">
          {/* Tick Size Dropdown */}
          <div className="px-4 py-2 border-b border-[#1F1E23]">
            <div className="flex items-center justify-between">
              {/* <span className="text-[12px] text-[#919093] font-[400]">Tick Size:</span> */}
              <div className="relative z-50" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen((open) => !open)}
                  className="relative z-50 flex items-center gap-2 px-3 py-1 bg-[#1F1E23] border border-[#2A2A2A] rounded text-white text-[12px] hover:bg-[#2A2A2A] transition-colors"
                >
                  <span>{selectedTickSize ? selectedTickSize.label : '0.00005'}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isDropdownOpen && (
                  <div className="absolute top-full mt-1 bg-[#1F1E23] border border-[#2A2A2A] rounded shadow-lg z-50">
                    {tickSizeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedTickSize(option);
                          setIsDropdownOpen(false);
                          // Notify parent of tick size change
                          if (onTickSizeChange) {
                            onTickSizeChange(option);
                          }
                        }}
                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-[#2A2A2A] transition-colors ${
                          selectedTickSize.value === option.value 
                            ? 'text-white bg-[#2A2A2A]' 
                            : 'text-[#919093]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-3  px-4 py-2 my-2  ">
            <div className="text-left text-[11px] leading-[18px] text-[#919093] font-[400]">
              Price
            </div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">
              Amount ({selectedSymbol})
            </div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">
              Total ({selectedSymbol})
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Asks (Sell Orders) */}
            <div className="space-y-0">
              {displayOrderBook.asks
                .slice(0, 11)
                .reverse()
                .map((ask, index) => (
                  <div
                    key={`ask-${index}`}
                    className="grid grid-cols-3 gap-4 px-4 py-1 my-1 text-xs hover:bg-gray-900 transition-colors relative"
                  >
                    {/* Background bar for visual depth */}
                    <div
                      className="absolute left-0 top-0 h-full"
                      style={{
                        width:
                          displayOrderBook.asks.length > 0
                            ? `${Math.min(
                                (ask.total /
                                  Math.max(
                                    ...displayOrderBook.asks.map((a) => a.total)
                                  )) *
                                  100,
                                100
                              )}%`
                            : "0%",
                        backgroundImage:
                          "linear-gradient(to right, #000000, #170a0d, #251114, #331618, #421a1a)",
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
                  <span className=" font-mono ">{spread.absolute}</span>
                  <span className="text-[#889199]">
                    {spread.percentage.toFixed(3)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Bids (Buy Orders) */}
            <div className="space-y-0">
              {displayOrderBook.bids.slice(0, 11).map((bid, index) => (
                <div
                  key={`bid-${index}`}
                  className="grid grid-cols-3 gap-4 px-4 py-1 text-xs my-1 hover:bg-gray-900 transition-colors relative"
                >
                  {/* Background bar for visual depth */}
                  <div
                    className="absolute left-0 top-0 h-full opacity-20 bg-opacity-10"
                    style={{
                      width:
                        displayOrderBook.bids.length > 0
                          ? `${Math.min(
                              (bid.total /
                                Math.max(
                                  ...displayOrderBook.bids.map((b) => b.total)
                                )) *
                                100,
                              100
                            )}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg, rgba(47, 227, 172, 0) 0%, #65FB9E 100%)",
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
      {activeTab === "Trades" && (
        <div className="flex flex-col h-full">
          {/* Column Headers for Trades */}
          <div className="grid grid-cols-3 gap-4 px-4 py-2 my-2 ">
            <div className="text-left text-[11px] leading-[18px] text-[#919093] font-[400]">
              Price
            </div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">
              Size (USD)
            </div>
            <div className="text-right text-[11px] leading-[18px] text-[#919093] font-[400]">
              Age
            </div>
          </div>

          {/* Trades List */}
          <div className="flex-1 overflow-y-auto">
            {tradesData.length > 0 ? (
              tradesData.map((trade, index) => (
                <div
                  key={`trade-${index}`}
                  className="grid grid-cols-3 gap-4 my-1 px-4 py-1 text-xs hover:bg-gray-900 transition-colors"
                >
                  <div
                    className={` font-[400] leading-[18px] text-[12px]  font-mono relative z-10 ${
                      trade.side === "B" ? "text-[#65FB9E]" : "text-[#FF5757]"
                    }`}
                  >
                    {formatPrice(trade.price)}
                  </div>
                  <div className="text-right text-white font-[400] leading-[18px] text-[12px]  font-mono relative z-10">
                    ${numeral(trade.size * trade.price).format("0,0.00")}
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
