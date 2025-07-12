// components/TradingPanel.js - SIMPLIFIED VERSION WITH CONVERTED SIGNING UTILS
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import hyperliquidUtils from '@/utils/hyperLiquidTrading'; // Your updated utils file with converted signing
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { X } from 'lucide-react';
const TradingPanel = ({ 
  selectedSymbol = 'BTC', 
  marketData = null,
  className = '' 
}) => {
  const [side, setSide] = useState('Long');
   const [ethBalance, setEthBalance] = useState(0);
  const [orderType, setOrderType] = useState('Market');
  const [buyAmount, setBuyAmount] = useState('0.0');
  const [limitPrice, setLimitPrice] = useState('');
  const [assetInfo, setAssetInfo] = useState(null);
    const percentageOptions = [0, 25, 50, 75, 100];
  const maxLeverage = 50; // Maximum leverage allowed
  const [percentage, setPercentage] = useState(0);
    const [usdcBalance, setUsdcBalance] = useState(0);
      const [ethPrice, setEthPrice] = useState(0);
        const [usdEquivalent, setUsdEquivalent] = useState('0.00');
  // Trading state
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [wallet, setWallet] = useState(null);
  const { data: walletClient } = useWalletClient();
    const [showLeverageModal, setShowLeverageModal] = useState(false);
      const [tempLeverage, setTempLeverage] = useState(10);
  const { address, isConnected } = useAccount();
   const [leverage, setLeverage] = useState(10);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const { disconnect } = useDisconnect();
  const modal = useAppKit();
  
  const handleLeverageClick = () => {
    setTempLeverage(leverage);
    setShowLeverageModal(true);
  };

    const handleSliderChange = (e) => {
    setTempLeverage(parseInt(e.target.value));
  };

  const handleLeverageSet = () => {
    setLeverage(tempLeverage);
    setShowLeverageModal(false);
  };


  const [accountData, setAccountData] = useState({
    availableMargin: 0.00,
    accountValue: 0.00,
    isConnected: false,
    address: null
  });
  const calculateUSDValue = (tokenAmount) => {
    if (!tokenAmount || !marketData?.price || parseFloat(tokenAmount) <= 0) {
      setUsdEquivalent('0.00');
      return;
    }
    
    const usdValue = parseFloat(tokenAmount) * marketData.price;
    setUsdEquivalent(usdValue.toFixed(2));
  };

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
  // Initialize and fetch asset index for selected symbol
  useEffect(() => {
    const fetchAssetInfo = async () => {
      try {
        console.log('🔍 Fetching asset info for:', selectedSymbol);
        
        const assetData = await hyperliquidUtils.getAssetInfo(selectedSymbol, false);
        setAssetInfo(assetData);
        
        console.log('✅ Asset info set:', assetData);
      } catch (error) {
        console.error('Error fetching asset info:', error);
        // Set fallback values
        setAssetInfo({
          index: 0,
          name: selectedSymbol,
          szDecimals: 3
        });
      }
    };

    fetchAssetInfo();
  }, [selectedSymbol]);


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

          // Get USDC balance from Arbitrum
          const usdcContract = new ethers.Contract(
            '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC on Arbitrum
            ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
            wallet.provider
          );
          
          const usdcBalance = await usdcContract.balanceOf(address);
          const usdcDecimals = await usdcContract.decimals();
          const usdcBal = parseFloat(ethers.formatUnits(usdcBalance, usdcDecimals));
          setUsdcBalance(usdcBal);
          
          console.log('💰 Wallet balances:', {
            eth: ethBal,
            usdc: usdcBal,
            address: address
          });
          
        } catch (error) {
          console.error('Error fetching balances:', error);
        }
      }
    };

    fetchWalletBalances();
  }, [isConnected, address, wallet]);

  const checkOnboardingStatus = async () => {
    if (!address) return false;
    
    setCheckingOnboarding(true);
    try {
      const userState = await hyperliquidUtils.getUserAccountState(address, false);
      console.log('📊 User state response:', userState);
      
      if (userState && (userState.marginSummary || userState.balances)) {
        setIsOnboarded(true);
        
        let accountValue = 0;
        let availableMargin = 0;
        
        if (userState.marginSummary) {
          accountValue = parseFloat(userState.marginSummary.accountValue || 0);
          const marginUsed = parseFloat(userState.marginSummary.marginUsed || 0);
          availableMargin = accountValue - marginUsed;
        }
        
        if (userState.withdrawable) {
          availableMargin = Math.max(availableMargin, parseFloat(userState.withdrawable));
        }
        
        if (userState.balances) {
          userState.balances.forEach(balance => {
            if (balance.coin === 'USDC') {
              const total = parseFloat(balance.total || 0);
              const hold = parseFloat(balance.hold || 0);
              const available = total - hold;
              availableMargin = Math.max(availableMargin, available);
              accountValue = Math.max(accountValue, total);
            }
          });
        }
        
        setAccountData(prev => ({
          ...prev,
          availableMargin: availableMargin,
          accountValue: accountValue
        }));
        
        console.log('✅ User is onboarded with available margin:', availableMargin);
        return true;
      } else {
        setIsOnboarded(false);
        console.log('❌ User not onboarded - no margin summary or balances found');
        return false;
      }
    } catch (error) {
      console.error('❌ Error checking onboarding:', error);
      setIsOnboarded(false);
      return false;
    } finally {
      setCheckingOnboarding(false);
    }
  };

  useEffect(() => {
    if (isConnected && address && walletClient) {
      console.log('🔄 Wallet connection changed:', {
        address,
        chainId: walletClient.chain?.id,
        chainName: walletClient.chain?.name
      });
      
      setAccountData(prev => ({
        ...prev,
        isConnected: true,
        address: address
      }));

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
      setIsOnboarded(false);
    }
  }, [isConnected, address, walletClient]);

  useEffect(() => {
    if (orderType === 'Limit' && marketData && !limitPrice) {
      setLimitPrice(marketData.price.toString());
    }
  }, [orderType, marketData, limitPrice]);


    const handlePercentageClick = (percent) => {
    setPercentage(percent);
    
    // Use either Hyperliquid available margin or wallet USDC balance
    const availableBalance = Math.max(accountData.availableMargin, usdcBalance);
    
    if (availableBalance <= 0) {
      setOrderError('No available margin. Please deposit USDC to Hyperliquid.');
      return;
    }
    
    // Calculate position size based on leverage
    const marginToUse = (availableBalance * percent) / 100;
    const positionValue = marginToUse * leverage;
    
    // Calculate token amount based on current price
    if (marketData && marketData.price > 0) {
      const tokenAmount = positionValue / marketData.price;
      const amountStr = tokenAmount.toFixed(6); // Use more decimals for accuracy
      setBuyAmount(amountStr);
      calculateUSDValue(amountStr);
      
      console.log('📊 Position calculation:', {
        availableBalance,
        marginToUse,
        leverage,
        positionValue,
        tokenAmount,
        price: marketData.price
      });
    }
  };

  const connectWallet = async () => {
    try {
      modal.open();
    } catch (error) {
      console.error('Error opening wallet modal:', error);
      setOrderError('Failed to open wallet connection');
    }
  };

  const createSigner = async () => {
    if (!walletClient || !address) {
      console.error('No wallet client or address available');
      setOrderError('Please connect your wallet');
      return;
    }

    try {
      console.log('🔍 Creating signer for address:', address);
      
      if (walletClient.chain?.id !== 42161) {
        setOrderError('Please switch to Arbitrum network');
        return;
      }
      
      const network = {
        chainId: 42161,
        name: 'arbitrum',
        ensAddress: null
      };
      
      const provider = new ethers.BrowserProvider(walletClient.transport, network);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      
      console.log('🔍 Signer address:', signerAddress);
      console.log('🔍 Expected address:', address);
      
      const normalizedSignerAddress = signerAddress.toLowerCase();
      const normalizedExpectedAddress = address.toLowerCase();
      
      if (normalizedSignerAddress !== normalizedExpectedAddress) {
        console.error('❌ Address mismatch!');
        setOrderError('Wallet address mismatch. Please reconnect your wallet.');
        return;
      }
      
      console.log('✅ Basic wallet verification passed');
      
      setWallet({
        address: normalizedExpectedAddress,
        signer: signer,
        provider: provider,
        walletClient: walletClient
      });
      
      console.log('✅ Signer created successfully with address:', normalizedExpectedAddress);
      
      await checkOnboardingStatus();
      
    } catch (error) {
      console.error('Error creating signer:', error);
      setOrderError('Failed to connect wallet: ' + error.message);
    }
  };

  // UPDATED TRADE HANDLER WITH CONVERTED SIGNING UTILS
  const handleTrade = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (!wallet || !wallet.signer) {
      setOrderError('Wallet not properly connected. Please try reconnecting.');
      return;
    }

    if (!assetInfo) {
      setOrderError('Asset information not loaded. Please wait and try again.');
      return;
    }

    try {
      // Verify wallet is still valid
      const signerAddress = (await wallet.signer.getAddress()).toLowerCase();
      const expectedAddress = address.toLowerCase();
      
      if (signerAddress !== expectedAddress) {
        setOrderError('Wallet address mismatch. Please reconnect.');
        await createSigner();
        return;
      }

      // Check onboarding status
      if (!isOnboarded) {
        const onboarded = await checkOnboardingStatus();
        if (!onboarded) {
          setOrderError(
            'Your wallet is not onboarded to Hyperliquid. ' +
            'Please visit https://app.hyperliquid.xyz to deposit USDC and enable trading.'
          );
          window.open('https://app.hyperliquid.xyz/trade', '_blank');
          return;
        }
      }

      // Validation
      const orderSize = parseFloat(buyAmount);
      if (orderSize <= 0) {
        setOrderError('Please enter a valid order size');
        return;
      }

      const minSize = Math.pow(10, -assetInfo.szDecimals);
      if (orderSize < minSize) {
        setOrderError(`Minimum order size is ${minSize} ${selectedSymbol}`);
        return;
      }

      if (orderType === 'Limit') {
        const limitPriceValue = parseFloat(limitPrice);
        if (!limitPrice || limitPriceValue <= 0) {
          setOrderError('Please enter a valid limit price for limit orders');
          return;
        }
      }

      if (!marketData || !marketData.price) {
        setOrderError('Market data not available. Please try again.');
        return;
      }

      setIsPlacingOrder(true);
      setOrderError(null);
      setOrderSuccess(null);

      try {
        console.log('📤 Starting order placement with converted signing utils...');

        // Use the corrected placeOrder function with converted signing utils
        const result = await hyperliquidUtils.placeOrder({
          assetIndex: assetInfo.index,
          isBuy: side === 'Long',
          size: orderSize,
          price: orderType === 'Limit' ? parseFloat(limitPrice) : null,
          orderType: orderType.toLowerCase(),
          timeInForce: 'Gtc',
          reduceOnly: false,
          takeProfitPrice: null,
          stopLossPrice: null,
          cloid: null
        }, wallet.signer, false);

        console.log('📥 Order result:', result);

        if (result && result.status === 'ok') {
          setOrderSuccess(
            `✅ ${side} order for ${buyAmount} ${selectedSymbol} placed successfully!`
          );
          
          // Reset form
          setBuyAmount('0.0');
          setLimitPrice('');
          
          // Refresh account data after successful order
          setTimeout(() => {
            checkOnboardingStatus();
          }, 2000);
          
        } else {
          const errorMsg = hyperliquidUtils.parseErrorMessage(result);
          console.error('❌ Order failed:', errorMsg);
          setOrderError(errorMsg);
        }
        
      } catch (orderError) {
        console.error('❌ Order placement exception:', orderError);
        
        let errorMessage = orderError.message || 'Failed to place order. Please try again.';
        
        if (errorMessage.includes('Asset information not loaded')) {
          errorMessage = 'Asset information is still loading. Please wait a moment and try again.';
        } else if (errorMessage.includes('Network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (errorMessage.includes('User rejected')) {
          errorMessage = 'Transaction was rejected. Please try again.';
        } else if (errorMessage.includes('Invalid size')) {
          errorMessage = `Invalid order size. Must be at least ${minSize} ${selectedSymbol} with max ${assetInfo.szDecimals} decimal places.`;
        }
        
        setOrderError(errorMessage);
      }
      
    } catch (validationError) {
      console.error('❌ Trade validation error:', validationError);
      setOrderError(validationError.message || 'Failed to validate trade. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <>
      <div className={`bg-[#0d0c0e] text-white  ${className} border-l border-l-[#1F1E23]`}>

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
        <div className='px-4 pt-2'>
        <div className="flex mb-4 border border-[#1F1E23] rounded-xl p-1">
          <button
            onClick={() => setSide('Long')}
            className={`flex-1 py-2 px-4 text-[12px] leading-[16px] font-mono font-[500] rounded-[12px] transition-colors duration-200 ease-in cursor-pointer ${
              side === 'Long'
                ? 'bg-[#65FB9E] text-black '
                : 'bg-transparent text-white hover:bg-[#4848480e] '
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide('Short')}
            className={`flex-1 py-2 px-4 text-[12px]  font-mono leading-[16px] font-[500] rounded-[12px] transition-colors  duration-200 ease-in cursor-pointer ${
              side === 'Short'
                ? 'bg-[#fb65c4] text-black'
                : 'bg-transparent text-white hover:bg-[#4848480e]'
            }`}
          >
            Short
          </button>
        </div></div>

        {/* Market/Limit Toggle */}
        <div className=' px-4 border  border-[#1F1E23]'>
        <div className="flex items-center   space-x-8">
          <button
            onClick={() => setOrderType('Market')}
            className={`text-[12px]  font-mono leading-[16px] font-[500]  border-b-2 border-transparent  py-2 cursor-pointer ${
              orderType === 'Market'
                ? 'text-white border-b-2 border-white'
                : 'text-[#919093] hover:text-white'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('Limit')}
            className={`text-[12px]  font-mono leading-[16px] font-[500] border-b-2 border-transparent py-2 cursor-pointer ${
              orderType === 'Limit'
                ? 'text-white border-b-2 border-white'
                : 'text-[#919093] hover:text-white'
            }`}
          >
            Limit
          </button>
                 <button 
            onClick={handleLeverageClick}
            className="ml-auto  font-mono leading-[16px] font-[500] text-[#65FB9E] bg-[#4FFFAB33] h-[90%] px-2 py-0 rounded-md hover:text-white border-b-2 border-transparent  transition-colors cursor-pointer"
          >
            Leverage: {leverage}x
          </button>
        </div></div>

      {/* Buy Amount */}
        <div className="my-4 px-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-[#919093] text-[11px] font-[500] fomt-mono ">Available to trade    {usdcBalance} USDC</label>
            <span className="text-sm text-gray-400">{selectedSymbol}</span>
          </div>
          
          <div className="relative border border-[#1F1E23] rounded-[12px] px-3 py-2 ">
            <div className='flex flex-col items-start gap-3 '>
            <span className='text-[11px] leading-[16px] font-[500] text-[#919093]'>Buy amount</span>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => {
                setBuyAmount(e.target.value);
                calculateUSDValue(e.target.value); // Calculate USD equivalent
              }}
              placeholder="0.0"
              className="w-full  rounded  text-white text-[14px] leading-[100%] font-[400]  font-mono outline-none "
            /></div>
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                    {/* USD Equivalent Display */}
          {parseFloat(buyAmount) > 0 && (
            <div className="mt-2 text-[11px] leading-[16px] font-[400] text-[#919093] text-right">
              ≈ ${usdEquivalent} USDC
            </div>
          )}
            </div>
          </div>
          

        </div>

        {/* Limit Price (only for limit orders) */}
        {orderType === 'Limit' && (
          <div className="my-4 px-4">
            <div className="relative border border-[#1F1E23] rounded-[12px] px-3 py-2 ">
              <label className="text-[11px] leading-[16px] font-[500] text-[#919093]">Limit Price</label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={marketData ? marketData.price.toString() : "0.0"}
                className="w-full  rounded  text-white text-[14px] leading-[100%] font-[400]  font-mono outline-none "
              />
            </div>
          </div>
        )}

{/* Percentage Slider */}
<div className="mb-4 px-4">
  <input
    type="range"
    min="0"
    max="100"
    step="25"
    value={percentage}
    onChange={(e) => handlePercentageClick(Number(e.target.value))}
    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white "
    style={{
      background: `linear-gradient(to right, white 0%, white ${percentage}%, #1F1E23 ${percentage}%, #1F1E23 100%)`,
    }}
  />
  <div className="flex justify-between text-[11px] leading-[16px] font-[400] text-[#C9C9C9] mt-1">
    {[0, 25, 50, 75, 100].map((val) => (
      <span
        key={val}
        className={val === percentage ? "text-white font-medium" : ""}
      >
        {val}%
      </span>
    ))}
  </div>
</div>


        {/* Account Information */}
        <div className="space-y-6 text-sm my-8 mb-4 px-4">
          <div className="flex justify-between">
            <span className="text-[#919093] text-[13px] leading-[13px] font-[500] font-mono">Account Value</span>
            <span className="text-white text-[13px] leading-[13px] font-[500]  font-mono">
              {accountData.accountValue.toFixed(2)} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-[#919093] text-[13px] leading-[13px] font-[500] font-mono">Available Margin</span>
            <span className="text-white text-[13px] leading-[13px] font-[500]  font-mono">
              {accountData.availableMargin.toFixed(2)} USDC
            </span>
          </div>

          {/* Disconnect Button - Show when connected */}
          {isConnected && (
            <div className="mb-4  p-3 bg-green-900 bg-opacity-30 border border-green-600 rounded">
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
        </div>

        {/* Trade Button */}
        <div className='px-4 mt-4'>
        <button
          onClick={handleTrade}
          disabled={isPlacingOrder}
          className={`w-full py-3 mt-4 px-4 rounded-xl font-mono font-[500] text-[12px] duration-200 ease-in] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            !isConnected
              ? 'bg-[#202022]  hover:bg-[#2b2b2e] border border-[#FAFAFA33] text-white'
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
        </button></div>


         {/* Leverage Modal */}
      {showLeverageModal && (
        <div className="fixed inset-0 backdrop-blur-3xl bg-black/60 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#0d0c0e] border border-white/20 rounded-lg p-6 w-80 mx-4">
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

        {/* Onboard Button for non-onboarded users */}
        {isConnected && !isOnboarded && (
          <div className='px-4 mt-2'>
            <button
              onClick={() => window.open('https://app.hyperliquid.xyz/trade', '_blank')}
              className="w-full py-2 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors cursor-pointer"
            >
              🚀 Onboard to Hyperliquid
            </button>
          </div>
        )}

        {/* Powered by Hyperliquid */}
        <div className="text-center mt-6">
          <span className="text-xs text-gray-500">
            powered by 💎 <span className="text-blue-400">Hyperliquid</span>
          </span>
        </div>
      </div>
    </>
  );
};

export default TradingPanel;