import React from 'react'
import { IoSwapVerticalOutline } from "react-icons/io5";
import { FaAngleDown } from "react-icons/fa6";
import { IoIosWarning } from "react-icons/io";

const LimitOrderTemplate = () => {
  return (
    <div className="flex items-center justify-center w-full h-[calc(100vh-64px)]">
      <div className="h-auto w-[480px] px-2 py-6 bg-[#202022] rounded-lg border border-[#424242]">
        {/* setting section */}
        <div className="flex items-center justify-between w-full text-[#d6d6d6]">
            <div className="flex flex-col items-start justify-center gap-2">
          <p className=" font-mono text-sm flex items-center gap-2 text-gray-100">
           <img src="/eth.svg" className="h-5" /> ETH 
          </p>
            <p className=" font-mono text-lg font-semibold text-gray-100 flex items-center gap-2">2932,51</p>
            </div>

          <div className='flex flex-col gap-1.5 items-end justify-center'>
          <IoSwapVerticalOutline size={20} className="rotate-180" />
          <p className=" font-mono text-sm flex items-center gap-2 text-gray-100">
           <img src="/usdc.svg" className="h-5" /> USDC 
          </p>
          </div>
        </div>

        {/* market  */}
        <div className='flex flex-wrap mt-2 mb-3 gap-1.5 items-center'>
        <button className="bg-[#262626] text-[#a5a5a5] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs font-mono cursor-pointer active:scale-95 transition-all duration-300">
                Market
              </button>
              <button className="bg-[#262626] text-[#a5a5a5] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs font-mono cursor-pointer active:scale-95 transition-all duration-300">
                +1%
              </button>
              <button className="bg-[#262626] text-[#a5a5a5] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs font-mono cursor-pointer active:scale-95 transition-all duration-300">
                +5%
              </button>
              <button className="bg-[#262626] text-[#a5a5a5] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs font-mono cursor-pointer active:scale-95 transition-all duration-300">
                +10%
              </button>
        </div>

        {/* Available trade section */}
        <div className="flex items-center mt-2 justify-between w-full text-[#919093]">
          <p className=" font-mono text-xs flex items-center gap-2">
            Available to trade <span className="text-gray-300">0.00 USDC</span>
          </p>

          <div className="flex font-mono items-center gap-1.5 text-xs">
            <button className="bg-green-400/40 p-1 rounded-sm text-green-300 cursor-pointer active:scale-95 transition-all duration-300">
              Half
            </button>
            <button className="bg-green-400/40 p-1 rounded-sm text-green-300 cursor-pointer active:scale-95 transition-all duration-300">
              Max
            </button>
          </div>
        </div>

        {/* swap section */}
        <div className=" flex flex-col gap-1 mt-2 items-center justify-center w-full relative">
          <button className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#1f1f1f] border-4 border-[#131313] p-2 rounded-2xl cursor-pointer active:scale-95 transition-all duration-300">
            <IoSwapVerticalOutline size={16} />
          </button>
          <div className="h-28 w-full bg-gray-950 rounded-lg p-3">
            <div className="w-full">
              <p className="text-[#919093] font-mono text-xs">Selling</p>
            </div>
            <div className="w-full pb-2 h-full flex items-center justify-between">
              <button className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300">
                <img src="/usdc.svg" className="h-7" />
                USDC
                <FaAngleDown />
              </button>
            </div>
          </div>
          <div className="h-28 w-full bg-gray-950 rounded-lg p-3">
            <div className="w-full">
              <p className="text-[#919093] font-mono text-xs">Buying</p>
            </div>
            <div className="w-full pb-2 h-full flex items-center justify-between">
              <button className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300">
                <img src="/solana.svg" className="h-7" />
                SOL
                <FaAngleDown />
              </button>
            </div>
          </div>
        </div>

        {/* Swap button */}
        <button className="mt-2 w-full flex items-center justify-center-safe py-3 bg-[#2034fe]  rounded-lg font-mono text-sm cursor-pointer active:scale-95 transition-all duration-300">
          Limit
        </button>

        {/* Info */}
        <div className="mt-2 p-2  rounded-lg w-full flex items-center justify-between">
          <div className="flex items-start gap-1.5 text-xs font-mono text-[#d6d6d6]">
          <IoIosWarning size={22}/>

            <p>DCA will only be executed if the price falls within the range of your pricing strategy.</p> 
          </div>

          
        </div>
      </div>
    </div>
  )
}

export default LimitOrderTemplate