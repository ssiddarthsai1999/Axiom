// components/TradingPanel.js
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ethers } from 'ethers';
import hyperliquidUtils from '@/utils/hyperLiquidTrading';
import { useAccount, useConnect, useDisconnect, useWalletClient } from 'wagmi';
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
  const [assetInfo, setAssetInfo] = useState(null);
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [tempLeverage, setTempLeverage] = useState(10);

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
    const fetchAssetInfo = async () => {
      try {
        console.log('🔍 Fetching asset info for:', selectedSymbol);
        
        // Get the meta data from Hyperliquid
        const response = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta' })
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch meta data');
        }
        
        const metaData = await response.json();
        console.log('📊 Meta data received:', metaData);
        
        if (metaData && metaData.universe) {
          // Find the asset by symbol
          const asset = metaData.universe.find(token => token.name === selectedSymbol);
          
          if (asset) {
            const assetData = {
              index: metaData.universe.indexOf(asset),
              name: asset.name,
              szDecimals: asset.szDecimals || 3, // Default to 3 if not specified
              ...asset
            };
            
            setAssetInfo(assetData);
            setAssetIndex(assetData.index);
            
            console.log('✅ Asset info set:', assetData);
          } else {
            console.error('❌ Asset not found:', selectedSymbol);
            // Set default values
            setAssetInfo({
              index: 0,
              name: selectedSymbol,
              szDecimals: 3
            });
            setAssetIndex(0);
          }
        }
      } catch (error) {
        console.error('Error fetching asset info:', error);
        // Set fallback values
        setAssetInfo({
          index: 0,
          name: selectedSymbol,
          szDecimals: 3
        });
        setAssetIndex(0);
      }
    };

    fetchAssetInfo();
  }, [selectedSymbol]);

  // Replace your existing checkOnboardingStatus function with this:
  const checkOnboardingStatus = async () => {
    if (!address) return false;
    
    setCheckingOnboarding(true);
    try {
      // Ensure address is lowercase for Hyperliquid API (critical!)
      const normalizedAddress = address.toLowerCase();
      console.log('🔍 Checking onboarding for:', normalizedAddress);
      
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: normalizedAddress
        })
      });
      
      if (!response.ok) {
        console.error('❌ Failed to fetch user state:', response.status);
        return false;
      }
      
      const userState = await response.json();
      console.log('📊 User state response:', userState);
      
      // Check if user exists and has been onboarded
      if (userState && (userState.marginSummary || userState.balances)) {
        setIsOnboarded(true);
        
        // Update account data with actual values from Hyperliquid
        let accountValue = 0;
        let availableMargin = 0;
        
        if (userState.marginSummary) {
          accountValue = parseFloat(userState.marginSummary.accountValue || 0);
          const marginUsed = parseFloat(userState.marginSummary.marginUsed || 0);
          availableMargin = accountValue - marginUsed;
        }
        
        // Check for withdrawable funds
        if (userState.withdrawable) {
          availableMargin = Math.max(availableMargin, parseFloat(userState.withdrawable));
        }
        
        // Check balances for USDC
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
        
        console.log('💰 Account details:', {
          accountValue,
          availableMargin,
          withdrawable: userState.withdrawable,
          marginSummary: userState.marginSummary
        });
        
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
    if (!assetInfo) {
      throw new Error('Asset information not loaded. Please wait and try again.');
    }
    
    const isBuy = side === 'Long';
    const isMarketOrder = orderType === 'Market';
    const orderSize = parseFloat(buyAmount);
    
    if (orderSize <= 0) {
      throw new Error('Order size must be greater than 0');
    }
    
    // Format size according to asset's szDecimals
    const formattedSize = orderSize.toFixed(assetInfo.szDecimals);
    
    // Check minimum size
    const minSize = Math.pow(10, -assetInfo.szDecimals);
    if (parseFloat(formattedSize) < minSize) {
      throw new Error(`Minimum order size is ${minSize} ${selectedSymbol}`);
    }
    
    // ⭐ CRITICAL: Price formatting for market vs limit orders
    let orderPrice;
    if (isMarketOrder) {
      // For market orders, set price to null to let Hyperliquid handle it
      orderPrice = null;
    } else {
      if (!limitPrice || parseFloat(limitPrice) <= 0) {
        throw new Error('Please enter a valid limit price');
      }
      orderPrice = parseFloat(limitPrice).toString();
    }
    
    // ⭐ CRITICAL: Create order with correct Hyperliquid format
    const mainOrder = {
      a: assetInfo.index,           // Asset index
      b: isBuy,                     // Buy/sell boolean
      p: orderPrice || '0',         // Price (use '0' for market orders)
      s: formattedSize,             // Size as string
      r: false,                     // Reduce only
      t: isMarketOrder ? {
        // Market order: Use correct trigger format
        trigger: {
          isMarket: true,
          triggerPx: '0',
          tpsl: 'tp'
        }
      } : {
        // Limit order: Use correct limit format
        limit: {
          tif: 'Gtc'  // Good Till Cancel
        }
      }
    };

    console.log('📦 Created main order:', mainOrder);

    const orders = [mainOrder];

    // Add TP/SL orders if enabled
    if (tpSlEnabled) {
      const currentPrice = marketData?.price || parseFloat(orderPrice || '0');
      
      // Take Profit Order
      if (tpPrice || tpPercentage) {
        let takeProfitPrice;
        
        if (tpPrice) {
          takeProfitPrice = parseFloat(tpPrice);
        } else if (tpPercentage && currentPrice > 0) {
          const tpPercent = parseFloat(tpPercentage) / 100;
          takeProfitPrice = isBuy 
            ? currentPrice * (1 + tpPercent)
            : currentPrice * (1 - tpPercent);
        }
        
        if (takeProfitPrice) {
          orders.push({
            a: assetInfo.index,
            b: !isBuy,
            p: takeProfitPrice.toString(),
            s: formattedSize,
            r: true,  // Reduce only for TP/SL
            t: {
              trigger: {
                isMarket: false,
                triggerPx: takeProfitPrice.toString(),
                tpsl: 'tp'
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
        } else if (slPercentage && currentPrice > 0) {
          const slPercent = parseFloat(slPercentage) / 100;
          stopLossPrice = isBuy 
            ? currentPrice * (1 - slPercent)
            : currentPrice * (1 + slPercent);
        }
        
        if (stopLossPrice) {
          orders.push({
            a: assetInfo.index,
            b: !isBuy,
            p: stopLossPrice.toString(),
            s: formattedSize,
            r: true,  // Reduce only for TP/SL
            t: {
              trigger: {
                isMarket: false,
                triggerPx: stopLossPrice.toString(),
                tpsl: 'sl'
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

  // Hyperliquid-specific functions for L1 action signing
  const floatToWire = (x) => {
    // Convert float to wire format (8 decimal places as integer)
    const rounded = Math.round(x * 1e8);
    if (Math.abs(rounded) >= 2**53) {
      throw new Error("float_to_wire: float too large");
    }
    return rounded;
  };

  const floatToIntForHashing = (x) => {
    // Convert float to int for hashing
    return Math.floor(x + 0.5);
  };

  const stringToHex = (str) => {
    // Convert string to hex bytes
    return '0x' + Array.from(ethers.toUtf8Bytes(str))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const encodeVarInt = (value) => {
    // MessagePack variable integer encoding
    const bytes = [];
    if (value < 128) {
      bytes.push(value);
    } else if (value < 256) {
      bytes.push(0xcc, value);
    } else if (value < 65536) {
      bytes.push(0xcd, value >> 8, value & 0xff);
    } else if (value < 4294967296) {
      bytes.push(0xce, value >> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
    } else {
      // For larger numbers, use 64-bit encoding
      const high = Math.floor(value / 4294967296);
      const low = value % 4294967296;
      bytes.push(0xcf, high >> 24, (high >> 16) & 0xff, (high >> 8) & 0xff, high & 0xff,
                 low >> 24, (low >> 16) & 0xff, (low >> 8) & 0xff, low & 0xff);
    }
    return bytes;
  };

  const msgpackEncode = (obj) => {
    // Simple msgpack encoder for Hyperliquid action format
    const bytes = [];
    
    if (obj === null) {
      bytes.push(0xc0);
    } else if (typeof obj === 'boolean') {
      bytes.push(obj ? 0xc3 : 0xc2);
    } else if (typeof obj === 'number') {
      if (Number.isInteger(obj)) {
        if (obj >= 0 && obj < 128) {
          bytes.push(obj);
        } else if (obj >= 0) {
          bytes.push(...encodeVarInt(obj));
        } else {
          // Negative integers
          if (obj >= -32) {
            bytes.push(0xe0 | (obj & 0x1f));
          } else if (obj >= -128) {
            bytes.push(0xd0, obj & 0xff);
          } else if (obj >= -32768) {
            bytes.push(0xd1, (obj >> 8) & 0xff, obj & 0xff);
          } else if (obj >= -2147483648) {
            bytes.push(0xd2, (obj >> 24) & 0xff, (obj >> 16) & 0xff, (obj >> 8) & 0xff, obj & 0xff);
          } else {
            // 64-bit negative
            const value = obj < 0 ? 0x10000000000000000 + obj : obj;
            const high = Math.floor(value / 0x100000000);
            const low = value % 0x100000000;
            bytes.push(0xd3, (high >> 24) & 0xff, (high >> 16) & 0xff, (high >> 8) & 0xff, high & 0xff,
                      (low >> 24) & 0xff, (low >> 16) & 0xff, (low >> 8) & 0xff, low & 0xff);
          }
        }
      } else {
        // Float - use double precision
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, obj, false); // big-endian
        bytes.push(0xcb);
        for (let i = 0; i < 8; i++) {
          bytes.push(view.getUint8(i));
        }
      }
    } else if (typeof obj === 'string') {
      const strBytes = ethers.toUtf8Bytes(obj);
      const len = strBytes.length;
      if (len < 32) {
        bytes.push(0xa0 | len);
      } else if (len < 256) {
        bytes.push(0xd9, len);
      } else if (len < 65536) {
        bytes.push(0xda, len >> 8, len & 0xff);
      } else {
        bytes.push(0xdb, len >> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
      }
      bytes.push(...strBytes);
    } else if (Array.isArray(obj)) {
      const len = obj.length;
      if (len < 16) {
        bytes.push(0x90 | len);
      } else if (len < 65536) {
        bytes.push(0xdc, len >> 8, len & 0xff);
      } else {
        bytes.push(0xdd, len >> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
      }
      for (const item of obj) {
        bytes.push(...msgpackEncode(item));
      }
    } else if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      const len = keys.length;
      if (len < 16) {
        bytes.push(0x80 | len);
      } else if (len < 65536) {
        bytes.push(0xde, len >> 8, len & 0xff);
      } else {
        bytes.push(0xdf, len >> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
      }
      // Sort keys for consistent ordering
      keys.sort();
      for (const key of keys) {
        bytes.push(...msgpackEncode(key));
        bytes.push(...msgpackEncode(obj[key]));
      }
    }
    
    return bytes;
  };

  const actionHash = (action, vaultAddress, nonce) => {
    // Pack the action using msgpack format like Python SDK
    const connId = ethers.solidityPackedKeccak256(
      ['string', 'address', 'uint64'],
      ['HyperliquidTransaction:0', vaultAddress || ethers.ZeroAddress, nonce]
    );
    
    // Create the packed structure
    const toHash = [vaultAddress || ethers.ZeroAddress, nonce, action];
    
    // Encode with msgpack
    const encoded = msgpackEncode(toHash);
    
    // Hash the encoded data
    return ethers.keccak256(new Uint8Array(encoded));
  };

  const constructPhantomAgent = (hash, isMainnet) => {
    const source = isMainnet ? 'https://hyperliquid.xyz' : 'https://hyperliquid-testnet.xyz';
    return {
      source,
      connectionId: hash
    };
  };

  const signL1Action = async (wallet, action, vaultAddress, timestamp, isMainnet) => {
    try {
      console.log('🔐 Signing L1 action...');
      
      // 1. Create action hash
      const hash = actionHash(action, vaultAddress, timestamp);
      console.log('📝 Action hash:', hash);
      
      // 2. Construct phantom agent
      const agent = constructPhantomAgent(hash, isMainnet);
      console.log('👻 Phantom agent:', agent);
      
      // 3. Sign the agent using EIP-712
      const domain = {
        name: 'Exchange',
        version: '1',
        chainId: 42161,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      };

      // CRITICAL: Do NOT include EIP712Domain in types!
      const types = {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' }
        ]
      };

      const signature = await wallet.signTypedData(domain, types, agent);
      console.log('✍️ Signature:', signature);
      
      const sig = ethers.Signature.from(signature);
      
      return {
        r: sig.r,
        s: sig.s,
        v: sig.v
      };
      
    } catch (error) {
      console.error('❌ L1 action signing failed:', error);
      throw error;
    }
  };

  const placeOrderDirect = async (orders, grouping, signer) => {
    try {
      console.log('🔐 Placing order with L1 action signature...');
      
      const timestamp = Date.now();
      const vaultAddress = null; // Use null unless trading for a vault
      
      // Create the action object
      const action = {
        type: 'order',
        orders: orders,
        grouping: grouping
      };
      
      // Sign the L1 action (not user-signed action!)
      const signature = await signL1Action(signer, action, vaultAddress, timestamp, true);
      
      // Create request payload
      const requestPayload = {
        action: action,
        nonce: timestamp,
        signature: signature,
        vaultAddress: vaultAddress
      };

      console.log('📤 Final request payload:', JSON.stringify(requestPayload, null, 2));

      // Send to Hyperliquid
      const response = await fetch('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('📥 Hyperliquid response:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Order placement failed:', error);
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

  const handleTrade = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (!wallet || !wallet.signer) {
      setOrderError('Wallet not properly connected. Please try reconnecting.');
      return;
    }

    // Check if asset info is loaded
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

      // Check minimum order size using asset info
      const minSize = Math.pow(10, -assetInfo.szDecimals);
      if (orderSize < minSize) {
        setOrderError(`Minimum order size is ${minSize} ${selectedSymbol}`);
        return;
      }

      // Validate limit price for limit orders
      if (orderType === 'Limit') {
        const limitPriceValue = parseFloat(limitPrice);
        if (!limitPrice || limitPriceValue <= 0) {
          setOrderError('Please enter a valid limit price for limit orders');
          return;
        }
      }

      // Check market data availability
      if (!marketData || !marketData.price) {
        setOrderError('Market data not available. Please try again.');
        return;
      }

      // Check available margin
      const availableBalance = Math.max(accountData.availableMargin, usdcBalance);
      if (availableBalance <= 0) {
        setOrderError('No available margin. Please deposit USDC to Hyperliquid.');
        return;
      }

      // Calculate required margin
      const orderPrice = orderType === 'Market' ? marketData.price : parseFloat(limitPrice);
      const orderValue = orderSize * orderPrice;
      const requiredMargin = orderValue / leverage;
      
      if (requiredMargin > availableBalance) {
        setOrderError(
          `Insufficient margin. Required: ${requiredMargin.toFixed(2)}, ` +
          `Available: ${availableBalance.toFixed(2)}`
        );
        return;
      }

      // Validate TP/SL prices if enabled
      if (tpSlEnabled) {
        if (tpPrice) {
          const tpPriceValue = parseFloat(tpPrice);
          if (tpPriceValue <= 0) {
            setOrderError('Take profit price must be greater than 0');
            return;
          }
          
          // Validate TP price direction
          if (side === 'Long' && tpPriceValue <= orderPrice) {
            setOrderError('Take profit price must be higher than entry price for long positions');
            return;
          }
          if (side === 'Short' && tpPriceValue >= orderPrice) {
            setOrderError('Take profit price must be lower than entry price for short positions');
            return;
          }
        }
        
        if (slPrice) {
          const slPriceValue = parseFloat(slPrice);
          if (slPriceValue <= 0) {
            setOrderError('Stop loss price must be greater than 0');
            return;
          }
          
          // Validate SL price direction
          if (side === 'Long' && slPriceValue >= orderPrice) {
            setOrderError('Stop loss price must be lower than entry price for long positions');
            return;
          }
          if (side === 'Short' && slPriceValue <= orderPrice) {
            setOrderError('Stop loss price must be higher than entry price for short positions');
            return;
          }
        }
        
        if (tpPercentage) {
          const tpPercent = parseFloat(tpPercentage);
          if (tpPercent <= 0 || tpPercent > 1000) {
            setOrderError('Take profit percentage must be between 0.1% and 1000%');
            return;
          }
        }
        
        if (slPercentage) {
          const slPercent = parseFloat(slPercentage);
          if (slPercent <= 0 || slPercent > 100) {
            setOrderError('Stop loss percentage must be between 0.1% and 100%');
            return;
          }
        }
      }

      setIsPlacingOrder(true);
      setOrderError(null);
      setOrderSuccess(null);

      try {
        console.log('📤 Starting order placement with asset info:', {
          assetInfo,
          symbol: selectedSymbol,
          size: buyAmount,
          price: orderType === 'Limit' ? limitPrice : 'market',
          side,
          leverage
        });

        // Create order payload with validation
        const { orders, grouping } = createOrderPayload();
        
        console.log('📦 Order payload created:', {
          orders,
          grouping,
          wallet: signerAddress,
          symbol: selectedSymbol
        });

        // Place order directly with proper signing
        const result = await placeOrderDirect(orders, grouping, wallet.signer);

        console.log('📥 Order result:', result);

        // Check result status
        if (result && result.status === 'ok') {
          setOrderSuccess(
            `✅ ${side} order for ${buyAmount} ${selectedSymbol} placed successfully!`
          );
          
          // Reset form
          setBuyAmount('0.0');
          setLimitPrice('');
          setPercentage(0);
          setUsdEquivalent('0.00');
          
          // Reset TP/SL if they were used
          if (tpSlEnabled) {
            setTpPrice('');
            setTpPercentage('');
            setSlPrice('');
            setSlPercentage('');
          }
          
          // Refresh account data after successful order
          setTimeout(() => {
            checkOnboardingStatus();
            fetchHyperliquidBalance();
          }, 2000);
          
        } else {
          // Handle error response
          const errorMsg = result?.response || result?.message || 'Unknown error occurred';
          console.error('❌ Order failed:', errorMsg);
          
          // Parse and format error message
          let formattedError = errorMsg;
          
          if (typeof errorMsg === 'string') {
            if (errorMsg.includes('Invalid size')) {
              formattedError = `Invalid order size. Must be at least ${minSize} ${selectedSymbol} with max ${assetInfo.szDecimals} decimal places.`;
            } else if (errorMsg.includes('Insufficient margin')) {
              formattedError = 'Insufficient margin for this trade. Please reduce size or add more funds.';
            } else if (errorMsg.includes('Price too far')) {
              formattedError = 'Order price is too far from current market price. Please adjust.';
            } else if (errorMsg.includes('Self trade')) {
              formattedError = 'Order would trade against your own existing order.';
            } else if (errorMsg.includes('Order too small')) {
              formattedError = `Order size is below minimum requirement of ${minSize} ${selectedSymbol}.`;
            }
          }
          
          setOrderError(formattedError);
        }
        
      } catch (orderError) {
        console.error('❌ Order placement exception:', orderError);
        
        let errorMessage = orderError.message || 'Failed to place order. Please try again.';
        
        // Handle specific error types
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
          
          {/* Leverage Display - Clickable */}
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
          </div></div>
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
            <input
              type="checkbox"
              id="tpsl"
              checked={tpSlEnabled}
              onChange={(e) => setTpSlEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="tpsl" className="text-white text-[12px] leading-[18px] font-[500]  font-mono">
              TP/SL
            </label>
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
            <span className="text-[#919093] text-[13px] leading-[13px] font-[500] font-mono ">USDC Balance (Wallet)</span>
            <span className="text-white text-[13px] leading-[13px] font-[500]  font-mono">
              {usdcBalance} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-[#919093] text-[13px] leading-[13px] font-[500] font-mono">Account Value</span>
            <span className="text-white text-[13px] leading-[13px] font-[500]  font-mono">
              {accountData.accountValue.toFixed(2)} USDC
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-[#919093] text-[13px] leading-[13px] font-[500] font-mono">Current Position</span>
            <span className="text-white text-[13px] leading-[13px] font-[500]  font-mono">
              {accountData.currentPosition || '—'}
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