// utils/hyperLiquidTrading.js
import { ethers } from 'ethers';

export const HYPERLIQUID_ENDPOINTS = {
  MAINNET_INFO: 'https://api.hyperliquid.xyz/info',
  MAINNET_EXCHANGE: 'https://api.hyperliquid.xyz/exchange',
  TESTNET_INFO: 'https://api.hyperliquid-testnet.xyz/info',
  TESTNET_EXCHANGE: 'https://api.hyperliquid-testnet.xyz/exchange'
};

/**
 * Get asset information from Hyperliquid
 */
export async function getAssetInfo(symbol, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' })
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch asset metadata');
    }
    
    const data = await response.json();
    
    if (data?.universe) {
      const asset = data.universe.find(token => token.name === symbol);
      if (asset) {
        return {
          index: data.universe.indexOf(asset),
          name: asset.name,
          szDecimals: asset.szDecimals || 3,
          ...asset
        };
      }
    }
    
    throw new Error(`Asset ${symbol} not found`);
  } catch (error) {
    console.error('Error fetching asset info:', error);
    throw error;
  }
}

/**
 * Get user account state
 */
export async function getUserAccountState(userAddress, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress.toLowerCase()
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user state');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching user state:', error);
    throw error;
  }
}

/**
 * Create action hash for L1 actions (Hyperliquid specific)
 */
function actionHash(action, vaultAddress, nonce) {
  // In production, this should use proper msgpack encoding
  // For now, we'll use a simplified version
  const packedData = JSON.stringify({
    action,
    nonce,
    vaultAddress: vaultAddress || ethers.ZeroAddress
  });
  
  return ethers.keccak256(ethers.toUtf8Bytes(packedData));
}

/**
 * Construct phantom agent for L1 actions
 */
function constructPhantomAgent(hash, isMainnet) {
  const source = isMainnet ? 'https://hyperliquid.xyz' : 'https://hyperliquid-testnet.xyz';
  return {
    source,
    connectionId: hash
  };
}

/**
 * Sign L1 action (for orders, cancels, etc.)
 */
async function signL1Action(signer, action, vaultAddress, timestamp, isMainnet) {
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

    const signature = await signer.signTypedData(domain, types, agent);
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
}

/**
 * Sign user-signed action (for transfers, withdrawals, etc.)
 */
async function signUserSignedAction(signer, action, types, primaryType, isMainnet) {
  try {
    const timestamp = Date.now();
    const chainId = isMainnet ? 42161 : 421614;
    
    // Add required fields for user-signed actions
    const enrichedAction = {
      ...action,
      hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
      signatureChainId: '0x' + chainId.toString(16),
      time: timestamp
    };
    
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    // CRITICAL: Do NOT include EIP712Domain in types!
    const signature = await signer.signTypedData(domain, types, enrichedAction);
    const sig = ethers.Signature.from(signature);
    
    return {
      r: sig.r,
      s: sig.s,
      v: sig.v
    };
    
  } catch (error) {
    console.error('❌ User-signed action signing failed:', error);
    throw error;
  }
}

/**
 * Place order using correct EIP-712 signature
 */
export async function placeOrder({
  assetIndex,
  isBuy,
  size,
  price = null,
  orderType = 'market',
  timeInForce = 'Gtc',
  reduceOnly = false,
  takeProfitPrice = null,
  stopLossPrice = null,
  szDecimals = 3
}, signer, isTestnet = false) {
  try {
    console.log('📤 Placing order via utility function...');
    
    // Validate inputs
    const orderSize = parseFloat(size);
    if (orderSize <= 0) {
      throw new Error('Order size must be greater than 0');
    }
    
    // Format size according to asset's szDecimals
    const formattedSize = orderSize.toFixed(szDecimals);
    const minSize = Math.pow(10, -szDecimals);
    if (parseFloat(formattedSize) < minSize) {
      throw new Error(`Minimum order size is ${minSize}`);
    }
    
    // Create main order
    const mainOrder = {
      a: assetIndex,
      b: isBuy,
      p: orderType.toLowerCase() === 'market' ? '0' : price?.toString() || '0',
      s: formattedSize,
      r: reduceOnly,
      t: orderType.toLowerCase() === 'market' ? {
        trigger: {
          isMarket: true,
          triggerPx: '0',
          tpsl: 'tp'
        }
      } : {
        limit: {
          tif: timeInForce
        }
      }
    };

    const orders = [mainOrder];

    // Add TP/SL orders
    if (takeProfitPrice) {
      orders.push({
        a: assetIndex,
        b: !isBuy,
        p: takeProfitPrice.toString(),
        s: formattedSize,
        r: true,
        t: {
          trigger: {
            isMarket: false,
            triggerPx: takeProfitPrice.toString(),
            tpsl: 'tp'
          }
        }
      });
    }

    if (stopLossPrice) {
      orders.push({
        a: assetIndex,
        b: !isBuy,
        p: stopLossPrice.toString(),
        s: formattedSize,
        r: true,
        t: {
          trigger: {
            isMarket: false,
            triggerPx: stopLossPrice.toString(),
            tpsl: 'sl'
          }
        }
      });
    }

    const grouping = (takeProfitPrice || stopLossPrice) ? 'normalTpsl' : 'na';
    
    // Use the corrected signing function
    return await signAndSubmitOrder(orders, grouping, signer, isTestnet);
    
  } catch (error) {
    console.error('❌ Order placement failed:', error);
    throw error;
  }
}

/**
 * Sign and submit order with correct EIP-712 format
 */
async function signAndSubmitOrder(orders, grouping, signer, isTestnet = false) {
  try {
    const timestamp = Date.now();
    const vaultAddress = null; // Use null unless trading for a vault
    
    // Create the action object
    const action = {
      type: 'order',
      orders: orders,
      grouping: grouping
    };
    
    // Sign the L1 action (NOT user-signed action!)
    const signature = await signL1Action(signer, action, vaultAddress, timestamp, !isTestnet);
    
    // Create request payload
    const requestPayload = {
      action: action,
      nonce: timestamp,
      signature: signature,
      vaultAddress: vaultAddress
    };

    console.log('📤 Submitting order to Hyperliquid...');

    // Submit to Hyperliquid
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('❌ Sign and submit failed:', error);
    throw error;
  }
}

/**
 * Transfer USDC (user-signed action)
 */
export async function transferUSDC(signer, destination, amount, isTestnet = false) {
  try {
    const action = {
      destination: destination.toLowerCase(),
      amount: amount.toString()
    };
    
    const types = {
      'HyperliquidTransaction:UsdSend': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'signatureChainId', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' }
      ]
    };
    
    const signature = await signUserSignedAction(
      signer,
      action,
      types,
      'HyperliquidTransaction:UsdSend',
      !isTestnet
    );
    
    const timestamp = Date.now();
    const requestPayload = {
      action: {
        type: 'usdSend',
        ...action
      },
      nonce: timestamp,
      signature: signature
    };
    
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('❌ USDC transfer failed:', error);
    throw error;
  }
}

/**
 * Withdraw from bridge (user-signed action)
 */
export async function withdrawFromBridge(signer, destination, amount, isTestnet = false) {
  try {
    const action = {
      destination: destination.toLowerCase(),
      amount: amount.toString()
    };
    
    const types = {
      'HyperliquidTransaction:Withdraw': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'signatureChainId', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' }
      ]
    };
    
    const signature = await signUserSignedAction(
      signer,
      action,
      types,
      'HyperliquidTransaction:Withdraw',
      !isTestnet
    );
    
    const timestamp = Date.now();
    const requestPayload = {
      action: {
        type: 'withdraw3',
        ...action
      },
      nonce: timestamp,
      signature: signature
    };
    
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('❌ Withdrawal failed:', error);
    throw error;
  }
}

// Utility functions
export function calculatePositionSize(margin, leverage, price) {
  return (margin * leverage) / price;
}

export function validateOrderSize(size, szDecimals) {
  if (size <= 0) {
    return { isValid: false, error: 'Order size must be greater than 0' };
  }
  
  const formattedSize = size.toFixed(szDecimals);
  const minSize = Math.pow(10, -szDecimals);
  
  if (parseFloat(formattedSize) < minSize) {
    return { isValid: false, error: `Minimum order size is ${minSize}` };
  }
  
  return { isValid: true, formattedSize };
}

export function formatPrice(price, decimals = 6) {
  return parseFloat(price).toFixed(decimals);
}

export function parseErrorMessage(response) {
  if (response?.status === 'ok') return null;
  
  const errorMsg = response?.response || response?.message || 'Unknown error';
  
  // Map common Hyperliquid errors to user-friendly messages
  const errorMap = {
    'Insufficient margin': 'Not enough margin available for this trade',
    'Invalid price': 'Please enter a valid price',
    'Invalid size': 'Please enter a valid trade size',
    'Asset not found': 'Trading pair not available',
    'Order too small': 'Order size is below minimum requirement',
    'Price too far': 'Price is too far from current market price',
    'Self trade': 'Order would trade against your own order',
    'User or API Wallet': 'Wallet not found. Please ensure your wallet is onboarded to Hyperliquid',
    'does not exist': 'Wallet not found. Please deposit USDC to Hyperliquid first'
  };
  
  // Check for partial matches
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMsg.includes(key)) {
      return value;
    }
  }
  
  return errorMsg;
}

export default {
  getAssetInfo,
  getUserAccountState,
  placeOrder,
  transferUSDC,
  withdrawFromBridge,
  validateOrderSize,
  calculatePositionSize,
  formatPrice,
  parseErrorMessage,
  HYPERLIQUID_ENDPOINTS
};