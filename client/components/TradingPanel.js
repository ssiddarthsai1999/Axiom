// components/TradingPanel.js
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ethers } from 'ethers';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import { useAccount, useConnect, useDisconnect,useWalletClient  } from 'wagmi';
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
  let assetInfo
  const [ethBalance, setEthBalance] = useState(0);
  const [usdEquivalent, setUsdEquivalent] = useState('0.00');
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
    const { data: walletClient } = useWalletClient();
const { address, isConnected } = useAccount();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
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

  const checkOnboardingStatus = async () => {
  if (!address) return false;
  
  setCheckingOnboarding(true);
  try {
    // Ensure address is lowercase for Hyperliquid API
    const normalizedAddress = address.toLowerCase();
    console.log('🔍 Checking onboarding for:', normalizedAddress);
    
    const userState = await hyperliquidUtils.getUserAccountState(normalizedAddress, false);
    
    console.log('User state:', userState);
    
    if (userState && userState.marginSummary) {
      setIsOnboarded(true);
      
      // Update account data with actual values from Hyperliquid
      const accountValue = parseFloat(userState.marginSummary.accountValue || 0);
      const marginUsed = parseFloat(userState.marginSummary.marginUsed || 0);
      
      let availableMargin = accountValue;
      
      if (userState.assetPositions && userState.assetPositions.length > 0) {
        const withdrawable = parseFloat(userState.withdrawable || 0);
        availableMargin = withdrawable > 0 ? withdrawable : (accountValue - marginUsed);
      }
      
      if (availableMargin === 0 && userState.crossMarginSummary) {
        availableMargin = parseFloat(userState.crossMarginSummary.accountValue || 0);
      }
      
      console.log('💰 Margin calculations:', {
        accountValue,
        marginUsed,
        availableMargin,
        withdrawable: userState.withdrawable
      });
      
      setAccountData(prev => ({
        ...prev,
        availableMargin: availableMargin,
        accountValue: accountValue,
        marginUsed: marginUsed
      }));
      
      console.log('✅ User is onboarded with margin:', availableMargin);
      return true;
    } else {
      setIsOnboarded(false);
      console.log('❌ User not onboarded');
      return false;
    }
  } catch (error) {
    console.error('Error checking onboarding:', error);
    setIsOnboarded(false);
    return false;
  } finally {
    setCheckingOnboarding(false);
  }
};

const fetchHyperliquidBalance = async () => {
  if (!address) return;
  
  try {
    // Use lowercase address for Hyperliquid API
    const normalizedAddress = address.toLowerCase();
    
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: normalizedAddress
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user state');
    }
    
    const data = await response.json();
    console.log('📊 Hyperliquid user data:', data);
    
    if (data) {
      let availableMargin = 0;
      let accountValue = 0;
      
      if (data.marginSummary) {
        accountValue = parseFloat(data.marginSummary.accountValue || 0);
        const marginUsed = parseFloat(data.marginSummary.marginUsed || 0);
        availableMargin = accountValue - marginUsed;
      }
      
      if (data.withdrawable) {
        availableMargin = Math.max(availableMargin, parseFloat(data.withdrawable));
      }
      
      if (data.balances) {
        data.balances.forEach(balance => {
          if (balance.coin === 'USDC') {
            const total = parseFloat(balance.total || 0);
            const hold = parseFloat(balance.hold || 0);
            availableMargin = Math.max(availableMargin, total - hold);
            accountValue = Math.max(accountValue, total);
          }
        });
      }
      
      console.log('💵 Parsed balances:', {
        availableMargin,
        accountValue
      });
      
      setAccountData(prev => ({
        ...prev,
        availableMargin: availableMargin,
        accountValue: accountValue
      }));
    }
  } catch (error) {
    console.error('Error fetching Hyperliquid balance:', error);
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
  const orderSize = parseFloat(buyAmount);
  
  // Format size according to asset's szDecimals
  const sizeValidation = hyperliquidUtils.validateOrderSize(orderSize, assetInfo.szDecimals);
  if (!sizeValidation.isValid) {
    throw new Error(sizeValidation.error);
  }
  
  const formattedSize = sizeValidation.formattedSize;
  
  // For market orders, use a price that guarantees execution
  let orderPrice;
  if (isMarketOrder) {
    if (!marketData?.price) {
      throw new Error('Market price not available');
    }
    
    // For market orders, use a price that guarantees immediate execution
    // For buy orders, use a high price; for sell orders, use a low price
    const marketPrice = marketData.price;
    const buffer = 0.05; // 5% buffer to ensure execution
    
    if (isBuy) {
      orderPrice = (marketPrice * (1 + buffer)).toString();
    } else {
      orderPrice = (marketPrice * (1 - buffer)).toString();
    }
  } else {
    // For limit orders, use the specified limit price
    if (!limitPrice || parseFloat(limitPrice) <= 0) {
      throw new Error('Please enter a valid limit price');
    }
    orderPrice = parseFloat(limitPrice).toString();
  }
  
  // Create the main order with correct format for @nktkas/hyperliquid
  const mainOrder = {
    a: assetInfo.index,           // Asset index (correct)
    b: isBuy,                     // Buy/sell boolean (correct)
    p: orderPrice,                // Price as string (fixed)
    s: formattedSize,             // Size as string with correct decimals (fixed)
    r: reduceOnly,                // Reduce only
    t: isMarketOrder ? {
      // Market order: Use IOC (Immediate or Cancel) with aggressive pricing
      limit: {
        tif: "Ioc"              // Immediate or Cancel for market-like behavior
      }
    } : {
      // Limit order: Use GTC (Good Til Cancel)
      limit: {
        tif: timeInForce || "Gtc"
      }
    }
  };

  console.log('📦 Created order payload:', {
    symbol: selectedSymbol,
    assetIndex: assetInfo.index,
    szDecimals: assetInfo.szDecimals,
    side: side,
    orderType: orderType,
    size: buyAmount,
    formattedSize: formattedSize,
    price: orderPrice,
    mainOrder: mainOrder
  });

  const orders = [mainOrder];

  // Add TP/SL orders if enabled
  if (tpSlEnabled) {
    // Take Profit Order
    if (tpPrice || tpPercentage) {
      let takeProfitPrice;
      
      if (tpPrice) {
        takeProfitPrice = parseFloat(tpPrice);
      } else if (tpPercentage && marketData) {
        const tpPercent = parseFloat(tpPercentage) / 100;
        takeProfitPrice = isBuy 
          ? marketData.price * (1 + tpPercent)
          : marketData.price * (1 - tpPercent);
      }
      
      if (takeProfitPrice) {
        orders.push({
          a: assetInfo.index,
          b: !isBuy,                // Opposite side
          p: takeProfitPrice.toString(),
          s: formattedSize,
          r: true,                  // Reduce only
          t: {
            trigger: {
              isMarket: false,
              triggerPx: takeProfitPrice.toString(),
              tpsl: "tp"
            }
          }
        });
      }
    }
    
    // Stop Loss Order  
    if (slPrice || slPercentage) {
      let stopLossPrice;
      
      if (slPrice) {
        stopLossPrice = parseFloat(slPrice);
      } else if (slPercentage && marketData) {
        const slPercent = parseFloat(slPercentage) / 100;
        stopLossPrice = isBuy 
          ? marketData.price * (1 - slPercent)
          : marketData.price * (1 + slPercent);
      }
      
      if (stopLossPrice) {
        orders.push({
          a: assetInfo.index,
          b: !isBuy,                // Opposite side
          p: stopLossPrice.toString(),
          s: formattedSize,
          r: true,                  // Reduce only
          t: {
            trigger: {
              isMarket: false,
              triggerPx: stopLossPrice.toString(),
              tpsl: "sl"
            }
          }
        });
      }
    }
  }

  const grouping = (tpSlEnabled && (tpPrice || tpPercentage || slPrice || slPercentage)) 
    ? 'normalTpsl' 
    : 'na';

  return {
    orders,
    grouping
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

  useEffect(() => {
  if (isConnected && address && isOnboarded) {
    // Fetch balance immediately
    fetchHyperliquidBalance();
    
    // Then fetch every 30 seconds
    const interval = setInterval(() => {
      fetchHyperliquidBalance();
    }, 30000);
    
    return () => clearInterval(interval);
  }
}, [isConnected, address, isOnboarded]);


const createSigner = async () => {
  if (!walletClient || !address) {
    console.error('No wallet client or address available');
    setOrderError('Please connect your wallet');
    return;
  }

  try {
    console.log('🔍 Creating signer for address:', address);
    console.log('🔍 Wallet client details:', {
      chainId: walletClient.chain?.id,
      chainName: walletClient.chain?.name
    });
    
    // Ensure we're on Arbitrum (chain ID 42161)
    if (walletClient.chain?.id !== 42161) {
      setOrderError('Please switch to Arbitrum network');
      return;
    }
    
    // Create provider with explicit network config
    const network = {
      chainId: 42161,
      name: 'arbitrum',
      ensAddress: null
    };
    
    const provider = new ethers.BrowserProvider(walletClient.transport, network);
    
    // Get signer and verify
    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();
    
    console.log('🔍 Provider network:', await provider.getNetwork());
    console.log('🔍 Signer address:', signerAddress);
    console.log('🔍 Expected address:', address);
    
    // Normalize addresses to lowercase for comparison
    const normalizedSignerAddress = signerAddress.toLowerCase();
    const normalizedExpectedAddress = address.toLowerCase();
    
    if (normalizedSignerAddress !== normalizedExpectedAddress) {
      console.error('❌ Address mismatch!');
      console.error('Signer:', normalizedSignerAddress);
      console.error('Expected:', normalizedExpectedAddress);
      setOrderError('Wallet address mismatch. Please reconnect your wallet.');
      return;
    }
    
    // NO SIGNATURE TESTING HERE - just basic verification
    console.log('✅ Basic wallet verification passed');
    
    setWallet({
      address: normalizedExpectedAddress,
      signer: signer,
      provider: provider,
      walletClient: walletClient
    });
    
    console.log('✅ Signer created successfully with address:', normalizedExpectedAddress);
    
    // Check onboarding status after wallet is set
    await checkOnboardingStatus();
    
  } catch (error) {
    console.error('Error creating signer:', error);
    setOrderError('Failed to connect wallet: ' + error.message);
  }
};

const debugHyperliquidSignature = async () => {
  if (!wallet?.signer) {
    console.error('No signer available');
    return;
  }

  try {
    console.log('🧪 Starting Hyperliquid signature debug...');
    
    // Create exact test order from Python SDK
    const testOrderData = {
      action: {
        type: 'order',
        orders: [{
          a: 1,  // ETH asset index from Python test
          b: true,  // Buy
          p: '100',  // Price
          s: '100',  // Size  
          r: false,  // Not reduce only
          t: { limit: { tif: 'Gtc' } }
        }],
        grouping: 'na'
      },
      nonce: 0  // Use 0 to match Python test
    };

    console.log('🧪 Test order data:', JSON.stringify(testOrderData, null, 2));

    // Domain for Hyperliquid
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 42161,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    // Types for Hyperliquid
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      'HyperliquidTransaction:PlaceOrder': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'orders', type: 'string' },
        { name: 'grouping', type: 'string' },
        { name: 'builder', type: 'string' },
        { name: 'time', type: 'uint64' }
      ]
    };

    // Message for Hyperliquid
    const message = {
      hyperliquidChain: 'Mainnet',
      orders: JSON.stringify(testOrderData.action.orders),
      grouping: 'na',
      builder: '',
      time: 0
    };

    console.log('🧪 Domain:', JSON.stringify(domain, null, 2));
    console.log('🧪 Types:', JSON.stringify(types, null, 2));  
    console.log('🧪 Message:', JSON.stringify(message, null, 2));

    // Sign with our signer
    const signature = await wallet.signer.signTypedData(domain, types, message);
    console.log('🧪 Raw signature:', signature);

    // Parse signature
    const sig = ethers.Signature.from(signature);
    console.log('🧪 Parsed signature:', {
      r: sig.r,
      s: sig.s,
      v: sig.v
    });

    // Verify signature recovery
    const recoveredAddress = ethers.verifyTypedData(domain, types, message, signature);
    const signerAddress = await wallet.signer.getAddress();
    
    console.log('🧪 Signer address:', signerAddress.toLowerCase());
    console.log('🧪 Recovered address:', recoveredAddress.toLowerCase());
    console.log('🧪 Addresses match:', recoveredAddress.toLowerCase() === signerAddress.toLowerCase());

    // Expected values from Python SDK test (with wallet 0x0123456789012345678901234567890123456789012345678901234567890123)
    const expectedR = '0xd65369825a9df5d80099e513cce430311d7d26ddf477f5b3a33d2806b100d78e';
    const expectedS = '0x2b54116ff64054968aa237c20ca9ff68000f977c93289157748a3162b6ea940e';
    const expectedV = 28;

    console.log('🧪 Expected from Python SDK test:');
    console.log('  R:', expectedR);
    console.log('  S:', expectedS);
    console.log('  V:', expectedV);

    console.log('🧪 Our values:');
    console.log('  R:', sig.r);
    console.log('  S:', sig.s);
    console.log('  V:', sig.v);

    // Note: These won't match unless you use the exact same private key as the test
    console.log('🧪 Signature format looks correct:', 
      sig.r.startsWith('0x') && sig.r.length === 66 &&
      sig.s.startsWith('0x') && sig.s.length === 66 &&
      (sig.v === 27 || sig.v === 28)
    );

    return {
      signature: sig,
      recovered: recoveredAddress,
      signer: signerAddress,
      match: recoveredAddress.toLowerCase() === signerAddress.toLowerCase()
    };

  } catch (error) {
    console.error('🧪 Debug signature failed:', error);
    return { error: error.message };
  }
};

// 3. ADD THIS BUTTON TO YOUR TRADING PANEL UI (temporarily for debugging):
{wallet?.signer && (
  <button
    onClick={debugHyperliquidSignature}
    className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-black rounded mb-4"
  >
    🧪 Debug Hyperliquid Signature
  </button>
)}

 const handleTrade = async () => {
  if (!isConnected) {
    await connectWallet();
    return;
  }

  if (!wallet || !wallet.signer) {
    setOrderError('Wallet not properly connected. Please try reconnecting.');
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

    // Check minimum order size
    const minSize = hyperliquidUtils.getMinOrderSize(assetInfo.szDecimals);
    if (orderSize < minSize) {
      setOrderError(`Minimum order size is ${minSize} ${selectedSymbol}`);
      return;
    }

    // Check available margin
    const availableBalance = Math.max(accountData.availableMargin, usdcBalance);
    if (availableBalance <= 0) {
      setOrderError('No available margin. Please deposit USDC to Hyperliquid.');
      return;
    }

    // Calculate required margin
    const orderValue = orderSize * (marketData?.price || 0);
    const requiredMargin = orderValue / leverage;
    
    if (requiredMargin > availableBalance) {
      setOrderError(
        `Insufficient margin. Required: $${requiredMargin.toFixed(2)}, ` +
        `Available: $${availableBalance.toFixed(2)}`
      );
      return;
    }

    setIsPlacingOrder(true);
    setOrderError(null);
    setOrderSuccess(null);

    try {
      // Create order payload with correct format
      const { orders, grouping } = createOrderPayload();
      
      console.log('📤 Placing order with correct format:', {
        orders,
        grouping,
        wallet: signerAddress,
        symbol: selectedSymbol,
        assetInfo
      });

      // Use the utility function to place the order
      const result = await hyperliquidUtils.placeOrder({
        assetIndex: assetInfo.index,
        isBuy: side === 'Long',
        size: buyAmount,
        price: orderType === 'Limit' ? limitPrice : null,
        orderType: orderType.toLowerCase(),
        timeInForce: 'Gtc',
        reduceOnly: false,
        takeProfitPrice: null, // We handle TP/SL separately in createOrderPayload
        stopLossPrice: null,
        clientOrderId: null,
        symbol: selectedSymbol
      }, wallet.signer, false);

      console.log('📥 Order result:', result);

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
        setTimeout(() => {
          checkOnboardingStatus();
          fetchHyperliquidBalance();
        }, 2000);
      } else {
        const errorMsg = hyperliquidUtils.parseErrorMessage(result);
        throw new Error(errorMsg);
      }
      
    } catch (error) {
      console.error('Order placement error:', error);
      let errorMessage = error.message || 'Failed to place order. Please try again.';
      
      // Handle common errors
      if (errorMessage.includes('Invalid size')) {
        errorMessage = `Invalid order size. Must be at least ${hyperliquidUtils.getMinOrderSize(assetInfo.szDecimals)} ${selectedSymbol} with max ${assetInfo.szDecimals} decimal places.`;
      }
      
      setOrderError(errorMessage);
    }
    
  } catch (error) {
    console.error('Trade validation error:', error);
    setOrderError(error.message || 'Failed to validate trade. Please try again.');
  } finally {
    setIsPlacingOrder(false);
  }
};



const TestSignatureButton = () => (
  wallet?.signer && (
    <button
      onClick={debugHyperliquidSignature}
      className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-black rounded mb-4"
    >
      🧪 Test Signature (Debug Only)
    </button>
  )
);

  const DebugInfo = () => (
    <div className="mb-4 p-3 bg-gray-800 rounded text-xs">
      <div className="text-gray-400">Debug Info:</div>
      <div className="text-gray-300">Connected: {isConnected ? '✅' : '❌'}</div>
      <div className="text-gray-300">Address: {address || 'None'}</div>
      <div className="text-gray-300">WalletClient: {walletClient ? '✅' : '❌'}</div>
      <div className="text-gray-300">Signer: {wallet?.signer ? '✅' : '❌'}</div>
      <div className="text-gray-300">Onboarded: {isOnboarded ? '✅' : '❌'}</div>
    </div>
  );

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
      onChange={(e) => {
        setBuyAmount(e.target.value);
        calculateUSDValue(e.target.value); // Calculate USD equivalent
      }}
      placeholder="0.0"
      className="w-full bg-[#181a20] border border-gray-600 rounded px-3 py-2 text-white text-lg font-mono focus:outline-none focus:border-blue-500"
    />
    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
      <span className="text-blue-400 text-sm">💎</span>
      <span className="text-white font-mono">{assetIndex}</span>
    </div>
  </div>
  
  {/* USD Equivalent Display */}
  {parseFloat(buyAmount) > 0 && (
    <div className="mt-2 text-xs text-gray-400 text-right">
      ≈ ${usdEquivalent} USD
    </div>
  )}
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
    {usdcBalance} USDC
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