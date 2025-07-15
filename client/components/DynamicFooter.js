'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ArrowLeftRight, BarChart3 } from 'lucide-react';

const DynamicFooter = ({ onModeChange }) => {
  const pathname = usePathname();
  const [activeMode, setActiveMode] = useState('trade'); // 'trade' or 'perps'
  const [activeTradeButton, setActiveTradeButton] = useState('swap'); // 'swap', 'limit', 'dca'
  const [activePerpsButton, setActivePerpsButton] = useState('chart'); // 'chart', 'trade'

  // Check if current page should make trade or perps active
  const isTradeActive = pathname === '/swap' || pathname === '/limit-orders' || pathname === '/dca';
  const isPerpsActive = pathname === '/perpetuals';

  // Handle footer mode change and notify parent
  const handleFooterModeChange = (mode) => {
    if (onModeChange) {
      onModeChange(mode);
    }
  };

  const TradeFooter = () => {
    return (
      <div className="sticky bottom-0 left-0 right-0 bg-[#0d0c0e] border-t border-[#1F1E23] z-50 lg:hidden">
        {/* Top Layer - Action Buttons */}
        <div className="flex px-2 py-2 space-x-3 bg-[#0D0D0F] border border-[#FAFAFA33] rounded-2xl mx-4 mt-3">
          <button 
            onClick={() => {
              setActiveTradeButton('swap');
              handleFooterModeChange('trade');
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-center text-[12px] font-mono font-[500] leading-[20px] cursor-pointer transition-colors duration-200 ease-in ${
              activeTradeButton === 'swap'
                ? 'bg-[#2133FF] text-[#FAFAFA]'
                : 'bg-transparent text-[#919093] hover:text-white hover:bg-[#2b2b2e]'
            }`}
          >
            Swap
          </button>
          <button 
            onClick={() => {
              setActiveTradeButton('limit');
              handleFooterModeChange('trade');
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-center text-[12px] font-[500] font-mono leading-[20px] cursor-pointer transition-colors duration-200 ease-in ${
              activeTradeButton === 'limit'
                ? 'bg-[#2133FF] text-[#FAFAFA]'
                : 'bg-transparent text-[#919093] hover:text-white hover:bg-[#2b2b2e]'
            }`}
          >
            Limit
          </button>
          <button 
            onClick={() => {
              setActiveTradeButton('dca');
              handleFooterModeChange('trade');
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-center text-[12px] font-[500] font-mono leading-[20px] cursor-pointer transition-colors duration-200 ease-in ${
              activeTradeButton === 'dca'
                ? 'bg-[#2133FF] text-[#FAFAFA]'
                : 'bg-transparent text-[#919093] hover:text-white hover:bg-[#2b2b2e]'
            }`}
          >
            DCA
          </button>
        </div>

        {/* Bottom Layer - Navigation Icons */}
        <div className="flex items-center justify-around py-4 bg-[#0D0D0F]">
          <button className="flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] text-[#919093] hover:text-white transition-colors">
            <Search className="w-5 h-5" />
            <span className="">Search</span>
          </button>
          <button 
            onClick={() => setActiveMode('trade')}
            className={`flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] transition-colors ${
              isTradeActive ? 'text-white' : 'text-[#919093] hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span className="">Trade</span>
          </button>
          <button 
            onClick={() => setActiveMode('perps')}
            className={`flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] transition-colors ${
              isPerpsActive ? 'text-white' : 'text-[#919093] hover:text-white'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="">Perpetuals</span>
          </button>
        </div>
      </div>
    );
  };

  const PerpetualsFooter = () => {
    return (
      <div className="sticky bottom-0 left-0 right-0 bg-[#0d0c0e] border-t border-[#1F1E23] z-50 lg:hidden">
        {/* Top Layer - Action Buttons */}
        <div className="flex px-2 py-2 space-x-3 bg-[#0D0D0F] border border-[#FAFAFA33] rounded-2xl mx-4 mt-3">
          <button 
            onClick={() => {
              setActivePerpsButton('chart');
              handleFooterModeChange('chart');
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-center text-[12px] font-[500] leading-[20px] cursor-pointer transition-colors font-mono duration-200 ease-in ${
              activePerpsButton === 'chart'
                ? 'bg-[#2133FF] text-[#FAFAFA]'
                : 'bg-transparent text-[#919093] hover:text-white hover:bg-[#2b2b2e]'
            }`}
          >
            Chart
          </button>
          <button 
            onClick={() => {
              setActivePerpsButton('trade');
              handleFooterModeChange('trade');
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-center text-[12px] font-[500] leading-[20px] cursor-pointer transition-colors font-mono duration-200 ease-in ${
              activePerpsButton === 'trade'
                ? 'bg-[#2133FF] text-[#FAFAFA]'
                : 'bg-transparent text-[#919093] hover:text-white hover:bg-[#2b2b2e]'
            }`}
          >
            Trade
          </button>
        </div>

        {/* Bottom Layer - Navigation Icons */}
        <div className="flex items-center justify-around py-4 bg-[#0D0D0F]">
          <button className="flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] text-[#919093] hover:text-white transition-colors">
            <Search className="w-5 h-5" />
            <span className="">Search</span>
          </button>
          <button 
            onClick={() => setActiveMode('trade')}
            className={`flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] transition-colors ${
              isTradeActive ? 'text-white' : 'text-[#919093] hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span className="">Trade</span>
          </button>
          <button 
            onClick={() => setActiveMode('perps')}
            className={`flex flex-col cursor-pointer items-center space-y-1 font-mono text-[12px] font-[500] leading-[16px] transition-colors ${
              isPerpsActive ? 'text-white' : 'text-[#919093] hover:text-white'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="">Perpetuals</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {activeMode === 'trade' && <TradeFooter />}
      {activeMode === 'perps' && <PerpetualsFooter />}
    </>
  );
};

export default DynamicFooter;