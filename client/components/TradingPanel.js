// components/TradingPanel.js
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ethers } from 'ethers';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
const TradingPanel = ({ 
  selectedSymbol = 'BTC', 
  marketData = null,
  className = '' 
}) => {
  const [side, setSide] = useState('Long'); // 'Long' or 'Short'
  const [orderType, setOrderType] = useState('Market'); // 'Market' or 'Limit'
  const [leverage, setLeverage] = useState(10);
  const [buyAmount, setBuyAmount] = useState('0.0');
  const [limitPrice, setLimitPrice] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [tempLeverage, setTempLeverage] = useState(10);
  const [ethBalance, setEthBalance] = useState(0);
const [ethPrice, setEthPrice] = useState(0);
  // TP/SL state
  const [tpPrice, setTpPrice] = useState('');
  const [tpPercentage, setTpPercentage] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');
const [usdcBalance, setUsdcBalance] = useState(0);
  // Trading state
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [assetIndex, setAssetIndex] = useState(0);
const { address, isConnected } = useAccount();
const { disconnect } = useDisconnect();
const modal = useAppKit();
  // Mock account data - replace with real data from wallet/API
  const [accountData, setAccountData] = useState({
    availableMargin: 0.00,
    accountValue: 0.00,
    currentPosition: null,
    isConnected: false,
    address: null
  });

  const getETHPrice = async () => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return 0;
  }
};

useEffect(() => {
  const fetchWalletBalances = async () => {
    if (isConnected && address && wallet?.provider) {
      try {
        // Get ETH balance
        const ethBalance = await wallet.provider.getBalance(address);
        const ethBal = parseFloat(ethers.formatEther(ethBalance));
        setEthBalance(ethBal);
        
        // Get ETH price
        const price = await getETHPrice();
        setEthPrice(price);

        // Get USDC balance from wallet (not Hyperliquid)
        const usdcContract = new ethers.Contract(
          '0xA0b86a33E6410c8f3b3BaDB07a9A6ca54A9f45e3', // USDC on Arbitrum
          ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
          wallet.provider
        );
        
        const usdcBalance = await usdcContract.balanceOf(address);
        const usdcDecimals = await usdcContract.decimals();
        const usdcBal = parseFloat(ethers.formatUnits(usdcBalance, usdcDecimals));
        
        // Update account data with wallet USDC balance
        setAccountData(prev => ({
          ...prev,
          availableMargin: usdcBal,
          accountValue: usdcBal
        }));
        
      } catch (error) {
        console.error('Error fetching wallet balances:', error);
      }
    }
  };

  fetchWalletBalances();
}, [isConnected, address, wallet]);


  const percentageOptions = [0, 25, 50, 75, 100];
  const maxLeverage = 50; // Maximum leverage allowed

  // Initialize and fetch asset index for selected symbol
  useEffect(() => {
    const fetchAssetIndex = async () => {
      try {
        const index = await hyperliquidUtils.getAssetIndex(selectedSymbol, false); // false = mainnet
        setAssetIndex(index);
      } catch (error) {
        console.error('Error fetching asset index:', error);
        setAssetIndex(0); // Default to 0 if fetch fails
      }
    };

    fetchAssetIndex();
  }, [selectedSymbol]);

  useEffect(() => {
  if (isConnected && address) {
    setAccountData(prev => ({
      ...prev,
      isConnected: true,
      address: address,
      availableMargin: 0, // Will be fetched below
      accountValue: 0
    }));

    // Create ethers provider for signing
    const createSigner = async () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        setWallet({
          address: address,
          signer: signer,
          provider: provider
        });
      }
    };

    createSigner();
  } else {
    setAccountData(prev => ({
      ...prev,
      isConnected: false,
      address: null,
      availableMargin: 0,
      accountValue: 0
    }));
    setWallet(null);
  }
}, [isConnected, address]);

  // Fetch user account data when wallet is connected
useEffect(() => {
  const fetchAccountData = async () => {
    if (isConnected && address) {
      try {
        const userState = await hyperliquidUtils.getUserAccountState(address, false);
        if (userState && userState.marginSummary) {
          setAccountData(prev => ({
            ...prev,
            availableMargin: parseFloat(userState.marginSummary.accountValue || 0),
            accountValue: parseFloat(userState.marginSummary.accountValue || 0)
          }));
        }
      } catch (error) {
        console.error('Error fetching account data:', error);
      }
    }
  };

  fetchAccountData();
}, [isConnected, address]);

  // Set limit price to current market price when switching to limit order
  useEffect(() => {
    if (orderType === 'Limit' && marketData && !limitPrice) {
      setLimitPrice(marketData.price.toString());
    }
  }, [orderType, marketData, limitPrice]);

  // Wallet connection function (implement based on your wallet provider)
const connectWallet = async () => {
  try {
    modal.open();
  } catch (error) {
    console.error('Error opening wallet modal:', error);
    setOrderError('Failed to open wallet connection');
  }
};
  // Create order payload for Hyperliquid API
  const createOrderPayload = () => {
    const isBuy = side === 'Long';
    const isMarketOrder = orderType === 'Market';
    const orderPrice = isMarketOrder ? null : parseFloat(limitPrice);
    const orderSize = parseFloat(buyAmount);
    
    // Calculate TP/SL prices if enabled
    let takeProfitPrice = null;
    let stopLossPrice = null;
    
    if (tpSlEnabled) {
      if (tpPrice) {
        takeProfitPrice = parseFloat(tpPrice);
      } else if (tpPercentage && marketData) {
        const tpPercent = parseFloat(tpPercentage) / 100;
        takeProfitPrice = isBuy 
          ? marketData.price * (1 + tpPercent)
          : marketData.price * (1 - tpPercent);
      }
      
      if (slPrice) {
        stopLossPrice = parseFloat(slPrice);
      } else if (slPercentage && marketData) {
        const slPercent = parseFloat(slPercentage) / 100;
        stopLossPrice = isBuy 
          ? marketData.price * (1 - slPercent)
          : marketData.price * (1 + slPercent);
      }
    }

    return {
      assetIndex,
      isBuy,
      size: orderSize,
      price: orderPrice,
      orderType: isMarketOrder ? 'market' : 'limit',
      timeInForce: 'Gtc',
      reduceOnly: false,
      takeProfitPrice,
      stopLossPrice
    };
  };

  // Sign and submit order (simplified - you'll need proper cryptographic signing)
  const signAndSubmitOrder = async (orderPayload) => {
    try {
      // WARNING: This is a simplified example. In production, you need:
      // 1. Proper EIP-712 signing
      // 2. Correct signature format for Hyperliquid
      // 3. Private key management
      // 4. Error handling for different order types
      
      console.log('Order payload to be signed:', orderPayload);
      
      // For now, we'll simulate the API call without actual signing
      // In production, replace this with proper signing and API call
      
      const response = await fetch('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderPayload,
          signature: {
            // This needs to be properly generated
            r: '0x' + '0'.repeat(64),
            s: '0x' + '0'.repeat(64),
            v: 27
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error submitting order:', error);
      throw error;
    }
  };

  const handlePercentageClick = (percent) => {
    setPercentage(percent);
    // Calculate amount based on percentage of available margin
    const amount = (accountData.availableMargin * percent) / 100;
    setBuyAmount(amount.toFixed(2));
  };

  const handleLeverageClick = () => {
    setTempLeverage(leverage);
    setShowLeverageModal(true);
  };

  const handleLeverageSet = () => {
    setLeverage(tempLeverage);
    setShowLeverageModal(false);
  };

  const handleSliderChange = (e) => {
    setTempLeverage(parseInt(e.target.value));
  };

  const handleTrade = async () => {
  if (!isConnected) {
    await connectWallet();
    return;
  }

  if (!wallet || !wallet.signer) {
    setOrderError('Wallet not properly connected');
    return;
  }

  setIsPlacingOrder(true);
  setOrderError(null);
  setOrderSuccess(null);

  try {
    const orderParams = createOrderPayload();
    
    // Validate order parameters
    const validation = hyperliquidUtils.validateOrderParams({
      size: buyAmount,
      price: limitPrice,
      orderType: orderType.toLowerCase(),
      leverage,
      availableMargin: accountData.availableMargin
    });

    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    console.log('Placing order with params:', orderParams);

    // Place order using Hyperliquid API
    const result = await hyperliquidUtils.placeOrder(
      orderParams,
      wallet.signer,
      false // false = mainnet, true = testnet
    );

    console.log('Order result:', result);

    if (result.status === 'ok') {
      setOrderSuccess(`${side} order for ${buyAmount} ${selectedSymbol} placed successfully!`);
      
      // Reset form
      setBuyAmount('0.0');
      setLimitPrice('');
      setPercentage(0);
      setTpPrice('');
      setTpPercentage('');
      setSlPrice('');
      setSlPercentage('');
      
      // Refresh account data
      setTimeout(async () => {
        if (address) {
          const userState = await hyperliquidUtils.getUserAccountState(address, false);
          if (userState && userState.marginSummary) {
            setAccountData(prev => ({
              ...prev,
              availableMargin: parseFloat(userState.marginSummary.accountValue || 0),
              accountValue: parseFloat(userState.marginSummary.accountValue || 0)
            }));
          }
        }
      }, 2000);
    } else {
      throw new Error(hyperliquidUtils.parseErrorMessage(result));
    }
    
  } catch (error) {
    console.error('Order placement error:', error);
    setOrderError(error.message || 'Failed to place order. Please try again.');
  } finally {
    setIsPlacingOrder(false);
  }
};



  return (
    <>
      <div className={`bg-[#101015] text-white p-4 ${className} border-l border-l-white/20`}>
{/* Connection Status */}
{!isConnected && (
  <div className="mb-4 p-3 bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded">
    <p className="text-yellow-400 text-sm">
      🔒 Connect your wallet to start trading
    </p>
  </div>
)}


        {/* Error Display */}
        {orderError && (
          <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-600 rounded">
            <p className="text-red-400 text-sm">{orderError}</p>
          </div>
        )}

        {/* Success Display */}
        {orderSuccess && (
          <div className="mb-4 p-3 bg-green-900 bg-opacity-30 border border-green-600 rounded">
            <p className="text-green-400 text-sm">{orderSuccess}</p>
          </div>
        )}

        {/* Long/Short Toggle */}
        <div className="flex mb-4">
          <button
            onClick={() => setSide('Long')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-l-lg transition-colors border cursor-pointer ${
              side === 'Long'
                ? 'bg-[#2ee2ac] text-black border-white/20'
                : 'bg-transparent text-white hover:bg-gray-600 border-white/20'
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide('Short')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-r-lg transition-colors border cursor-pointer ${
              side === 'Short'
                ? 'bg-[#ed397b] text-white border-white/20'
                : 'bg-transparent text-white hover:bg-gray-600 border-white/20'
            }`}
          >
            Short
          </button>
        </div>

        {/* Market/Limit Toggle */}
        <div className="flex mb-4 space-x-4">
          <button
            onClick={() => setOrderType('Market')}
            className={`text-sm font-medium pb-1 cursor-pointer ${
              orderType === 'Market'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('Limit')}
            className={`text-sm font-medium pb-1 cursor-pointer ${
              orderType === 'Limit'
                ? 'text-white border-b-2 border-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Limit
          </button>
          
          {/* Leverage Display - Clickable */}
          <button 
            onClick={handleLeverageClick}
            className="ml-auto text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            Leverage: {leverage}x
          </button>
        </div>

        {/* Limit Price (only for limit orders) */}
        {orderType === 'Limit' && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-400">Limit Price</label>
              <span className="text-sm text-gray-400">USD</span>
            </div>
            
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={marketData ? marketData.price.toString() : "0.0"}
              className="w-full bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-lg font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Buy Amount */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-gray-400">Size</label>
            <span className="text-sm text-gray-400">{selectedSymbol}</span>
          </div>
          
          <div className="relative">
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-lg font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              <span className="text-blue-400 text-sm">💎</span>
              <span className="text-white font-mono">{assetIndex}</span>
            </div>
          </div>
        </div>

        {/* Percentage Buttons */}
        <div className="flex space-x-1 mb-4">
          {percentageOptions.map((percent) => (
            <button
              key={percent}
              onClick={() => handlePercentageClick(percent)}
              className={`flex-1 py-1 px-2 text-xs rounded transition-colors cursor-pointer ${
                percentage === percent
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {percent}%
            </button>
          ))}
        </div>

        {/* TP/SL Checkbox */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="tpsl"
              checked={tpSlEnabled}
              onChange={(e) => setTpSlEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="tpsl" className="text-sm text-gray-400">
              TP/SL
            </label>
          </div>
          <div className="text-sm text-gray-400">
            Est. Liq. Price: —
          </div>
        </div>

        {/* TP/SL Input Fields - Show when enabled */}
        {tpSlEnabled && (
          <div className="mb-4 space-y-4">
            {/* Take Profit Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">TP Price</label>
                <label className="text-sm text-gray-400">TP %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="Enter TP price"
                  className="flex-1 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={tpPercentage}
                  onChange={(e) => setTpPercentage(e.target.value)}
                  placeholder="0.0"
                  className="w-20 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Stop Loss Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">SL Price</label>
                <label className="text-sm text-gray-400">SL %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="Enter SL price"
                  className="flex-1 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={slPercentage}
                  onChange={(e) => setSlPercentage(e.target.value)}
                  placeholder="0.0"
                  className="w-20 bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Account Information */}
        <div className="space-y-3 text-sm mb-6">
  <div className="flex justify-between">
  <span className="text-gray-400">USDC Balance (Wallet)</span>
  <span className="text-green-400 font-mono">
    {accountData.availableMargin.toFixed(2)} USDC
  </span>
</div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Account Value</span>
            <span className="text-white font-mono">
              {accountData.accountValue.toFixed(2)} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Current Position</span>
            <span className="text-white font-mono">
              {accountData.currentPosition || '—'}
            </span>
          </div>

{/* Disconnect Button - Show when connected */}
{isConnected && (
  <div className="mb-4 p-3 bg-green-900 bg-opacity-30 border border-green-600 rounded">
    <div className="flex justify-between items-center">
      <div>
        <p className="text-green-400 text-sm">
          ✅ Wallet Connected
        </p>
        <p className="text-green-300 text-xs font-mono">
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '—'}
        </p>
      </div>
      <button
        onClick={() => disconnect()}
        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer"
      >
        Disconnect
      </button>
    </div>
  </div>
)}


{/* ETH Balance Display */}
<div className="flex justify-between">
  <span className="text-gray-400">ETH Balance</span>
  <span className="text-yellow-400 font-mono">
    {ethBalance ? `${ethBalance.toFixed(4)} ETH` : '0.00 ETH'}
  </span>
</div>

{/* Conversion Rate */}
<div className="flex justify-between">
  <span className="text-gray-400">≈ USDC Value</span>
  <span className="text-gray-300 font-mono text-xs">
    ≈ ${ethBalance ? (ethBalance * ethPrice).toFixed(2) : '0.00'} USDC
  </span>
</div>
        </div>

        {/* Trade Button */}
<button
  onClick={handleTrade}
  disabled={isPlacingOrder}
  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
    !isConnected
      ? 'bg-blue-500 hover:bg-blue-600 text-white'
      : side === 'Long'
      ? 'bg-[#2ee2ac] hover:bg-[#2ee2acc8] text-black'
      : 'bg-[#ed397b] hover:bg-[#ed397bc8] text-white'
  }`}
>
  {isPlacingOrder 
    ? 'Placing Order...' 
    : !isConnected 
    ? 'Connect Wallet'
    : `${side} ${selectedSymbol}`
  }
</button>

        {/* Powered by Hyperliquid */}
        <div className="text-center mt-6">
          <span className="text-xs text-gray-500">
            powered by 💎 <span className="text-blue-400">Hyperliquid</span>
          </span>
        </div>
      </div>

      {/* Leverage Modal */}
      {showLeverageModal && (
        <div className="fixed inset-0 backdrop-blur-3xl bg-black/60 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#101015] border border-white/20 rounded-lg p-6 w-80 mx-4">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Set Leverage</h3>
              <button 
                onClick={() => setShowLeverageModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5 cursor-pointer" />
              </button>
            </div>

            {/* Current Leverage Display */}
            <div className="text-center mb-6">
              <div className="text-3xl font-bold text-white mb-2">
                {tempLeverage}x
              </div>
              <div className="text-sm text-gray-400">
                Current leverage for {selectedSymbol}
              </div>
            </div>

            {/* Leverage Slider */}
            <div className="mb-6">
              <input
                type="range"
                min="1"
                max={maxLeverage}
                value={tempLeverage}
                onChange={handleSliderChange}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((tempLeverage - 1) / (maxLeverage - 1)) * 100}%, #374151 ${((tempLeverage - 1) / (maxLeverage - 1)) * 100}%, #374151 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>1x</span>
                <span>{maxLeverage}x</span>
              </div>
            </div>

            {/* Quick Select Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[1, 5, 10, 20, 30, 50].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setTempLeverage(lev)}
                  className={`py-2 px-3 text-sm rounded transition-colors cursor-pointer ${
                    tempLeverage === lev
                      ? 'bg-blue-500 text-white'
                      : 'bg-[#181a20] text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>

            {/* Warning Message */}
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3 mb-6">
              <p className="text-yellow-400 text-xs">
                ⚠️ Higher leverage increases both potential profits and losses. 
                Trade responsibly and never risk more than you can afford to lose.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowLeverageModal(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLeverageSet}
                className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Set Leverage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Slider Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #1f2937;
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #1f2937;
        }
      `}</style>
    </>
  );
};

export default TradingPanel;