import React from "react";
import { IoSwapVerticalOutline } from "react-icons/io5";
import { FaAngleDown } from "react-icons/fa6";
import { IoIosWarning } from "react-icons/io";
import { IoIosInformationCircle } from "react-icons/io";
import { MdOutlineRefresh } from "react-icons/md";

const DCATemplate = () => {
  return (
    <div className="flex flex-col items-center py-10 justify-center w-full min-h-[calc(100vh-64px)]">
      <div className="h-auto w-[480px] p-2 bg-[#202022] rounded-lg border border-[#424242]">
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

        <div className="h-auto mt-2 w-full bg-gray-950 rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <label
              htmlFor="time"
              className="text-[#919093] flex flex-col gap-1 font-mono text-xs w-1/2"
            >
              Every
              <input
                type="number"
                id="time"
                className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300"
              />
            </label>

            <div className="w-1/2 bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300 flex items-center justify-between">
              Minute
              <FaAngleDown />
            </div>
          </div>
          <label className="text-[#919093] flex flex-col gap-1 font-mono text-xs">
            Over
            <input
              type="number"
              className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300"
            />
          </label>
          <div className="w-full my-1 flex items-center justify-between">
            <p className="text-[#919093] font-mono text-xs flex items-center gap-1.5">
              Enable Pricing Stragegy <IoIosInformationCircle size={14} />
            </p>

            <button className="bg-[#1f1f1f] border border-[#424242] w-8 h-4 rounded-lg flex items-center justify-start gap-1.5 cursor-pointer active:scale-95 transition-all duration-300">
              <span className="bg-[#2034fe] w-5 h-3 rounded-lg cursor-pointer active:scale-95 transition-all duration-300"></span>
            </button>
          </div>
          <div className="flex items-center gap-2 justify-between">
            <input
              type="number"
              id="time"
              placeholder="Min Price"
              className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300 w-1/2"
            />
            <input
              type="number"
              id="time"
              placeholder="Max Price"
              className="bg-[#1f1f1f] border border-[#424242] px-2 py-1 rounded-lg flex items-center gap-1.5 text-sm font-mono cursor-pointer active:scale-95 transition-all duration-300 w-1/2"
            />
          </div>
        </div>

        {/* Swap button */}
        <button className="mt-2 w-full flex items-center justify-center-safe py-3 bg-[#2034fe]  rounded-lg font-mono text-sm cursor-pointer active:scale-95 transition-all duration-300">
          DCA
        </button>

        {/* Info */}
        <div className="mt-2 p-2  rounded-lg w-full flex items-center justify-between">
          <div className="flex items-start gap-1.5 text-xs font-mono text-[#d6d6d6]">
            <IoIosWarning size={22} />

            <p>
            Limits may not be executed exactly when tokens reach the specified price. <span className=" border-dashed border-b cursor-pointer">Learn more.</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2  min-h-32 w-[480px] bg-[#202022] rounded-lg border border-[#424242] p-3 flex flex-col items-center gap-3">
        <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex items-center justify-between w-60 border border-[#424242] p-1 rounded-lg font-mono text-sm">
          <button className="active:scale-95 transition-all duration-300 bg-[#2034fe] px-2 py-1 rounded-md  ">
            Active DCAs
          </button>
          <button className="active:scale-95 transition-all duration-300 bg-[#1f1f1f] px-2 py-1 rounded-md text-[#919093] ">
            Past DCAs
          </button>
        </div>

        <button className="active:scale-95 transition-all duration-300 bg-[#1f1f1f] px-2 py-1 rounded-md text-[#919093] flex items-center gap-1 border border-[#424242]">
            Refresh Data <MdOutlineRefresh size={18} />
          </button>
        </div>

        <p className="text-gray-100 font-mono text-xs">You have no active orders</p>
      </div>
    </div>
  );
};

export default DCATemplate;
