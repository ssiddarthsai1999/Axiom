import React from "react";
import { MdOutlineRefresh } from "react-icons/md";
import { IoSwapVerticalOutline } from "react-icons/io5";
import { FaAngleDown } from "react-icons/fa6";
import { IoSwapHorizontal } from "react-icons/io5";

const SwapTemplate = () => {
  return (
    <div className="flex items-center justify-center w-full h-[calc(100vh-64px)]">
      <div className="h-auto w-[480px] p-2 bg-[#202022] rounded-lg border border-[#424242]">
        {/* setting section */}
        <div className="flex items-center justify-between w-full text-[#919093]">
          <p className=" font-mono text-xs flex items-center gap-2">
            Settings <img src="/preference.svg" className="h-4" />
          </p>
          <MdOutlineRefresh size={24} className="rotate-180" />
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
          Swap
        </button>

        {/* Info */}
        <div className="mt-2 p-2 bg-gray-950 border border-[#424242] rounded-lg w-full flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#919093]">
            <p>Rate 1 USDC ≈ 0.0001 SOL</p> <IoSwapHorizontal size={16} />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-[#919093]">
            <p>0.02% FEE</p> <FaAngleDown />
          </div>
        </div>

        {/* Chart */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {/* Grid 1 */}
          <div className="w-full h-32 p-2 flex flex-col gap-1 bg-gray-950 border border-[#424242] rounded-lg">
            <div className="flex items-start justify-between w-full text-[#919093]">
              <div className="flex items-center gap-1">
                <img src="/usdc.svg" className="h-7" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-mono text-gray-200">USDC</p>
                  <div className="flex items-center gap-6">
                    <p className="text-xs font-mono truncate">EPjF…Dt1v</p>
                    <p className="text-xs font-mono text-[#F23674]">0%</p>
                  </div>
                </div>
              </div>
              <p className="text-sm font-mono text-gray-200">$1.00</p>
            </div>
          </div>

          {/* Grid 2 */}
          <div className="w-full h-32 p-2 flex flex-col gap-1 bg-gray-950 border border-[#424242] rounded-lg">
            <div className="flex items-start justify-between w-full text-[#919093]">
              <div className="flex items-center gap-1">
                <img src="/solana.svg" className="h-7" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-mono text-gray-200">SOL</p>
                  <div className="flex items-center gap-6">
                    <p className="text-xs font-mono truncate">So11…1112</p>
                    <p className="text-xs font-mono text-[#F23674]">-3,64%</p>
                  </div>
                </div>
              </div>
              <p className="text-sm font-mono text-gray-200">$159.00</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapTemplate;
