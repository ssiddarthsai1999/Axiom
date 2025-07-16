// components/TradingPanel.js - SIMPLIFIED VERSION WITH CONVERTED SIGNING UTILS
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import hyperliquidUtils from '@/utils/hyperLiquidTrading'; // Your updated utils file with converted signing
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { placeOrderWithAgentWallet, getUserAccountStateSDK, getMarketDataSDK, enableMetaMaskDeveloperMode, generateAgentWallet, approveAgentWallet, getOrCreateSessionAgentWallet, ensureAgentWalletApproved } from '@/utils/hyperLiquidSDK'
import { useAppKit } from '@reown/appkit/react';
import preference from "../public/preference.svg"
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
    const [tpPercentage, setTpPercentage] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');
  const [marginMode, setMarginMode] = useState('isolated'); // 'isolated' or 'cross'
const [applyToAll, setApplyToAll] = useState(false);

  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
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
    const [tpSlEnabled, setTpSlEnabled] = useState(false);
   const [leverage, setLeverage] = useState(10);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const { disconnect } = useDisconnect();
  const modal = useAppKit();
  // Replace agentWallet state logic with sessionStorage-based agent wallet
  // Instead of useState for agentWallet, just call getOrCreateSessionAgentWallet() when needed
  // In handleTrade, before placing an order:
  //   const agentWallet = getOrCreateSessionAgentWallet();
  //   await ensureAgentWalletApproved(wallet.signer, agentWallet, true, 'SessionAgent');
  //   await placeOrderWithAgentWallet(agentWallet, orderParams, true);
  // Remove any legacy agent wallet state, approval, or creation logic

  // Generate agent wallet on mount (or first connect)
  useEffect(() => {
    if (!wallet || !wallet.signer) {
      const wallet = getOrCreateSessionAgentWallet();
      setWallet({
        address: wallet.address,
        signer: wallet.signer,
        provider: wallet.provider,
        walletClient: wallet.walletClient
      });
    }
  }, [wallet]);

  // Update ensureAgentWalletApproved to always check the current agent wallet in sessionStorage
  // const ensureAgentWalletApproved = async () => {
  //   if (!wallet || !wallet.signer) return false;
  //   try {
  //     // Always get the current agent wallet from sessionStorage
  //     const agentKey = sessionStorage.getItem('hl_agent_wallet');
  //     if (!agentKey) throw new Error('No agent wallet found in sessionStorage');
  //     const agentWallet = new ethers.Wallet(agentKey);
  //     await ensureAgentWalletApproved(wallet.signer, agentWallet, true, 'SessionAgent');
  //     return true;
  //   } catch (e) {
  //     setOrderError('Failed to approve agent wallet: ' + (e.message || e));
  //     return false;
  //   }
  // };

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
        
     const assetData = await hyperliquidUtils.getAssetInfo(selectedSymbol, true);
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
 const userState = await hyperliquidUtils.getUserAccountState(address, true);
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

  // UPDATED TRADE HANDLER WITH AGENT WALLET
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
      setOrderError(null);
      setOrderSuccess(null);

      // Get agent wallet from sessionStorage and ensure it's approved
      // const agentWallet = getOrCreateSessionAgentWallet();
      // await ensureAgentWalletApproved(wallet.signer, agentWallet, true, 'SessionAgent');

      // CRITICAL: Validate all order parameters
      const orderSize = parseFloat(buyAmount);
      if (!buyAmount || orderSize <= 0) {
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
      const orderParams = {
        symbol: selectedSymbol,
        isBuy: side === 'Long',
        size: orderSize,
        price: orderType === 'Limit' ? parseFloat(limitPrice) : marketData.price,
        orderType: orderType.toLowerCase(),
        timeInForce: 'GTC',
        reduceOnly: false,
        cloid: null
      };
      // Place order with agent wallet
      const result = await placeOrderWithAgentWallet(
        orderParams,
        true // isMainnet
      );
      // ... handle result as before ...
      if (result && result.status === 'ok') {
        const orderData = result.response?.data;
        if (orderData?.statuses && orderData.statuses.length > 0) {
          const status = orderData.statuses[0];
          if (status.filled) {
            setOrderSuccess(
              `✅ ${side} order for ${buyAmount} ${selectedSymbol} filled at ${status.filled.avgPx}!`
            );
          } else if (status.resting) {
            setOrderSuccess(
              `✅ ${side} order for ${buyAmount} ${selectedSymbol} placed successfully! Order ID: ${status.resting.oid}`
            );
          } else {
            setOrderSuccess(
              `✅ ${side} order for ${buyAmount} ${selectedSymbol} placed successfully!`
            );
          }
        } else {
          setOrderSuccess(
            `✅ ${side} order for ${buyAmount} ${selectedSymbol} placed successfully!`
          );
        }
        setBuyAmount('0.0');
        setLimitPrice('');
        setPercentage(0);
        setTimeout(() => {
          checkOnboardingStatus();
        }, 2000);
      } else {
        let errorMessage = 'Failed to place order. Please try again.';
        if (result.status === 'err') {
          errorMessage = result.response || errorMessage;
        } else if (result.response?.type === 'error') {
          errorMessage = result.response.data || errorMessage;
        }
        setOrderError(errorMessage);
      }
    } catch (orderError) {
      let errorMessage = orderError.message || 'Failed to place order. Please try again.';
      setOrderError(errorMessage);
    } finally {
      setIsPlacingOrder(false);
    }
  };
  return (
    <>
      <div className={`bg-[#0d0c0e] text-white  ${className} border-l border-l-[#1F1E23] relative`}>
         {/* Powered by Hyperliquid */}
 <div className="text-center mt-6 absolute bottom-0 right-5 hidden lg:block">
  <span className="text-xs text-[#919093] flex items-center justify-center gap-2" style={{ fontWeight: 400, fontSize: '11px', lineHeight: '16.5px', letterSpacing: '0%' }}>
    powered by 
    <img 
      src="/hyperlogo.svg" 
      alt="Hyperliquid" 
      className="inline-block w-20 h-20"
      style={{ fontWeight: 400, fontSize: '11px', lineHeight: '16.5px', letterSpacing: '0%' }}
    />

  </span>
</div>
        {/* Error Display */}
        {orderError && (
          <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-600 rounded">
          <p className="text-red-400 text-sm whitespace-pre-line">{orderError}</p>
          </div>
        )}

        {/* Success Display */}
        {orderSuccess && (
          <div className="mb-4 p-3 bg-green-900 bg-opacity-30 border border-green-600 rounded">
            <p className="text-green-400 text-sm">{orderSuccess}</p>
          </div>
        )}

        {/* Long/Short Toggle */}
        <div className='px-4 pt-2 ' >
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
        <div className="flex items-center   space-x-4">
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
               
<button onClick={handleLeverageClick} className="ml-auto text-[10px] font-mono leading-[16px] font-[500] flex items-center  text-[#65FB9E] bg-[#4FFFAB33]  px-2 py-0 rounded-md hover:text-white border-b-2 border-transparent transition-colors cursor-pointer">
  <span>Leverage: {leverage}x ({marginMode})</span>
  <img src="/preference.svg" alt="preferences" className="ml-1 w-4 h-4" />
</button>
        </div></div>

      {/* Buy Amount */}
<div className="my-4 px-4">
  <div className="flex justify-between items-center mb-2">
    <label className="text-[#919093] text-[11px] font-[500] fomt-mono ">
      Available to trade {usdcBalance} USDC
    </label>
    
    {/* Half/Max Buttons */}
    <div className="flex items-center space-x-2">
      <button
        onClick={() => {
          const halfAmount = (parseFloat(usdcBalance) / 2 / marketData?.price).toFixed(4);
          setBuyAmount(halfAmount);
          calculateUSDValue(halfAmount);
        }}
        className="px-2 py-1 text-[10px] font-[400] text-[#65FB9E] bg-[#4FFFAB33] cursor-pointer rounded hover:bg-[#4FFFAB55] transition-colors"
      >
        Half
      </button>
      <button
        onClick={() => {
          const maxAmount = (parseFloat(usdcBalance) * 0.95 / marketData?.price).toFixed(4); // 95% to leave room for fees
          setBuyAmount(maxAmount);
          calculateUSDValue(maxAmount);
        }}
        className="px-2 py-1 text-[10px] font-[400] text-[#65FB9E] bg-[#4FFFAB33]  cursor-pointer rounded hover:bg-[#4FFFAB55] transition-colors"
      >
        Max
      </button>
    </div>
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
      />
    </div>
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


        {/* TP/SL Checkbox */}
        <div className="flex items-center justify-between mb-4 px-4">
<div className="flex items-center space-x-2">
  <div className="relative">
    <input
      type="checkbox"
      id="tpsl"
      checked={tpSlEnabled}
      onChange={(e) => setTpSlEnabled(e.target.checked)}
      className="sr-only"
    />
    <label 
      htmlFor="tpsl" 
      className="flex items-center cursor-pointer"
    >
      <div className={`w-4 h-4 rounded-sm border-2 border-[#C9C9C9]  flex items-center justify-center transition-colors ${
        tpSlEnabled 
          ? ' border-white bg-[#C9C9C9] ' 
          : 'bg-transparent border-[#C9C9C9] '
      }`}>
        {tpSlEnabled && (
          <svg 
            className="w-2.5 h-2.5 text-white" 
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path 
              fillRule="evenodd" 
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
              clipRule="evenodd" 
            />
          </svg>
        )}
      </div>
      <span className="ml-2 text-white text-[12px] leading-[18px] font-[500] font-mono">
        TP/SL
      </span>
    </label>
  </div>
</div>
          <div className="text-[#919093] text-[11px] leading-[16px] font-[500]  font-mono">
            Est. Liq. Price: —
          </div>
        </div>

                {/* TP/SL Input Fields - Show when enabled */}
                {tpSlEnabled && (
          <div className="mb-4 space-y-4 px-4">
            {/* Take Profit Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[#919093] text-[11px] leading-[16px] font-[500]  font-mono">TP Price</label>
                <label className="text-[#919093] text-[11px] leading-[16px] font-[500]  font-mono">TP %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="Enter TP price"
                  className="flex-1 placeholder:text-white  border border-[#1F1E23] font-mono rounded-[10px] px-3 py-3 text-white text-[14px] leading-[100%] font-[400] focus:outline-none 0"
                />
                <input
                  type="number"
                  value={tpPercentage}
                  onChange={(e) => setTpPercentage(e.target.value)}
                  placeholder="0.0"
                   className="w-20 placeholder:text-white  border border-[#1F1E23] font-mono rounded-[10px] px-3 py-3 text-white text-[14px] leading-[100%] font-[400] focus:outline-none 0"
                />
              </div>
            </div>

            {/* Stop Loss Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[#919093] text-[11px] leading-[16px] font-[500]  font-mono">SL Price</label>
                <label className="text-[#919093] text-[11px] leading-[16px] font-[500]  font-mono">SL %</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="Enter SL price"
  className="flex-1 placeholder:text-white  border border-[#1F1E23] font-mono rounded-[10px] px-3 py-3 text-white text-[14px] leading-[100%] font-[400] focus:outline-none 0"
                />
                <input
                  type="number"
                  value={slPercentage}
                  onChange={(e) => setSlPercentage(e.target.value)}
                  placeholder="0.0"
                  className="w-20 placeholder:text-white  border border-[#1F1E23] font-mono rounded-[10px] px-3 py-3 text-white text-[14px] leading-[100%] font-[400] focus:outline-none 0"
                />
              </div>
            </div>
          </div>
        )}


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
  <div className="fixed inset-0 backdrop-blur-sm bg-black/60 flex items-center justify-center z-50">
    <div className="bg-[#0D0D0F] border border-[#FAFAFA33] rounded-2xl p-8 w-full lg:w-[440px]  max-w-[440px] mx-4 relative">
      {/* Modal Header */}
      <div className="flex justify-between items-center mb-8">
        <div className='w-full flex flex-col gap-2'>
          <h3 className="text-[16px] leading-[24px] font-[400] font-mono text-[#E5E5E5] text-center">Leverage & Margin</h3>
          <p className="text-[11px] leading-[12px] font-[500] font-mono text-[#919093] text-center mt-1">
            Adjust the leverage and margin mode for your position.<br />
            The max leverage is {maxLeverage}x.
          </p>
        </div>
        <button 
          onClick={() => setShowLeverageModal(false)}
          className="text-gray-400 hover:text-white absolute right-4 top-4 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Current Leverage Display */}
      <div className="text-center flex items-center justify-between mb-8 ">
                  <button 
            onClick={() => setTempLeverage(Math.max(1, tempLeverage - 1))}
            className="w-12 h-12 cursor-pointer  rounded-full flex items-center justify-center text-white hover:brightness-125 transition-colors"
          >
            <span className="text-2xl">−</span>
          </button>
        <div className="text-[40px] leading-[24px] font-[400] font-mono text-[#FFFFFF] text-center ">
          {tempLeverage}x
        </div>
                  <button 
            onClick={() => setTempLeverage(Math.min(maxLeverage, tempLeverage + 1))}
                className="w-12 h-12 cursor-pointer  rounded-full flex items-center justify-center text-white hover:brightness-125 transition-colors"
          >
            <span className="text-2xl">+</span>
          </button>
      </div>

      {/* Leverage Slider */}
      <div className="mb-8">
        <div className="flex items-center justify-center mb-4">

          
          <div className="flex-1 mx-8">
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
          </div>
          

        </div>
        
        <div className="flex justify-between px-6">
          <span className='text-[11px] font-[400] leading-[16px] text-white  '>1x</span>
          <span className='text-[11px] font-[400] leading-[16px] text-white '>{maxLeverage}x</span>
        </div>
      </div>

      {/* Margin Mode Selection */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div 
          onClick={() => setMarginMode('isolated')}
          className={`p-2 rounded-lg  cursor-pointer border  flex flex-col items-start justify-start   transition-all ${
            marginMode === 'isolated' 
              ? 'border-[#2133FF] bg-[#0f1127] ' 
              : ' bg-[#1F1F1F] border-transparent '
          }`}
        >
          <h4 className="text-[16px] leading-[24px] font-[400] font-mono text-[#E6E6E6] mb-2">Isolated</h4>
          <p className="text-[9px] leading-[12px] font-[500] font-mono text-left text-[#919093]">
            In isolated margin mode, a margin is added to the position. 
            If it falls below maintenance, liquidation occurs. You can add 
            or reduce the margin.
          </p>
        </div>
        
        <div 
          onClick={() => setMarginMode('cross')}
          className={`p-2 rounded-lg  flex flex-col items-start justify-start cursor-pointer border   transition-all ${
            marginMode === 'cross' 
             ? 'border-[#2133FF] bg-[#0f1127] ' 
              : ' bg-[#1F1F1F] border-transparent '
          }`}
        >
          <h4 className="text-[16px] leading-[24px] font-[400] font-mono text-[#E6E6E6] mb-2">Cross</h4>
          <p className="text-[9px] leading-[12px] font-[500] font-mono text-left text-[#919093]">
            In cross margin mode, margin is shared across positions. If 
            liquidation occurs, traders may lose all margin and positions.
          </p>
        </div>
      </div>

      {/* Checkbox */}
      <div className="flex items-center mb-8 text-center flex justify-center mx-auto">
        <input
          type="checkbox"
          id="applyToAll"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-[#333333] border-[#444444] rounded focus:ring-blue-500 focus:ring-2"
        />
        <label htmlFor="applyToAll" className="ml-3 text-[12px] font-[400] font-mono  text-[#E5E5E5] ">
          Apply margin mode adjustment to all
        </label>
        <button className="ml-2 text-gray-400 hover:text-white">
          <span className="w-4 h-4 rounded-full bg-gray-600 text-white text-xs flex items-center justify-center">i</span>
        </button>
      </div>

      {/* Confirm Button */}
      <button
        onClick={handleLeverageSet}
        className="w-full py-4 text-[14px] font-[500] text-white rounded-lg cursor-pointer duration-200 ease-in  font-mono bg-[#2133FF] hover:bg-blue-600 transition-colors text-lg"
      >
        Confirm
      </button>
    </div>
  </div>
)}

        {/* Onboard Button for non-onboarded users */}
        {isConnected && !isOnboarded && (
          <div className='px-4 mt-2'>
            <button
              onClick={() => window.open('https://app.hyperliquid.xyz/trade', '_blank')}
              className="w-full py-2 px-4 text-[14px] font-[500] bg-[#2133FF] hover:bg-blue-700  text-white rounded transition-colors cursor-pointer"
            >
              🚀 Onboard to Hyperliquid
            </button>
          </div>
        )}

        {/* Agent Wallet Button for onboarded users */}
        {isConnected && isOnboarded && (
          <div className='px-4 mt-2'>
            <button
              onClick={async () => {
                try {
                  // Generate a new agent wallet using the already imported ethers
                  const agentWallet = await getOrCreateSessionAgentWallet()
                  // Approve the agent wallet with the main wallet
                  await ensureAgentWalletApproved(wallet.signer, agentWallet, true, 'SessionAgent');
                  alert('✅ New Agent Wallet created, saved, and approved!');
                } catch (error) {
                  console.error('❌ Error creating/approving agent wallet:', error);
                  alert('❌ Failed to create/approve agent wallet. Please try again or visit app.hyperliquid.xyz');
                }
              }}
              className="w-full py-2 px-4 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors cursor-pointer"
            >
              🤖 Create Agent Wallet
            </button>
          </div>
        )}


      </div>
    </>
  );
};

export default TradingPanel;