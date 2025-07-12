// utils/hyperLiquidTrading.js - Using EXACT official SDK patterns
import { 
  signL1Action, 
  orderToWire, 
  orderWireToAction, 
  getTimestampMs,
  signUsdTransferAction,
  removeTrailingZeros
} from "./hyperLiquidSigning"

export const HYPERLIQUID_ENDPOINTS = {
  MAINNET_INFO: 'https://api.hyperliquid.xyz/info',
  MAINNET_EXCHANGE: 'https://api.hyperliquid.xyz/exchange',
  TESTNET_INFO: 'https://api.hyperliquid-testnet.xyz/info',
  TESTNET_EXCHANGE: 'https://api.hyperliquid-testnet.xyz/exchange'
};

/**
 * Get asset information
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
 * Generate unique nonce - EXACT pattern from official SDK
 */
let nonceCounter = 0;
let lastNonceTimestamp = 0;

function generateUniqueNonce() {
  const timestamp = Date.now();

  // Ensure the nonce is always greater than the previous one
  if (timestamp <= lastNonceTimestamp) {
    // If we're in the same millisecond, increment by 1 from the last nonce
    lastNonceTimestamp += 1;
    return lastNonceTimestamp;
  }

  // Otherwise use the current timestamp
  lastNonceTimestamp = timestamp;
  return timestamp;
}

/**
 * Place order using EXACT official SDK pattern
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
  cloid = null
}, signer, isTestnet = false) {
  try {
    console.log('📤 Placing order with official SDK pattern...');
    
    // Validate inputs
    const orderSize = parseFloat(size);
    if (orderSize <= 0) {
      throw new Error('Order size must be greater than 0');
    }
    
    const vaultAddress = null;
    const grouping = (takeProfitPrice || stopLossPrice) ? 'normalTpsl' : 'na';

    // Create order request - EXACT pattern from official SDK
    const orderRequest = {
      is_buy: isBuy,
      sz: orderSize,
      limit_px: orderType.toLowerCase() === 'market' ? 
        (isBuy ? 999999 : 0.000001) : parseFloat(price),
      reduce_only: reduceOnly,
      order_type: orderType.toLowerCase() === 'market' ? 
        { limit: { tif: 'Ioc' } } : 
        { limit: { tif: timeInForce } }
    };
    
    if (cloid) {
      orderRequest.cloid = cloid;
    }

    // Normalize price and size values to remove trailing zeros - EXACT pattern
    const normalizedOrder = { ...orderRequest };

    // Handle price normalization
    if (typeof normalizedOrder.limit_px === 'string') {
      normalizedOrder.limit_px = removeTrailingZeros(normalizedOrder.limit_px);
    }

    // Handle size normalization
    if (typeof normalizedOrder.sz === 'string') {
      normalizedOrder.sz = removeTrailingZeros(normalizedOrder.sz);
    }

    const orders = [normalizedOrder];

    // Add TP/SL orders if specified
    if (takeProfitPrice) {
      const tpOrder = {
        is_buy: !isBuy,
        sz: orderSize,
        limit_px: parseFloat(takeProfitPrice),
        reduce_only: true,
        order_type: {
          trigger: {
            triggerPx: parseFloat(takeProfitPrice),
            isMarket: false,
            tpsl: 'tp'
          }
        }
      };
      orders.push(tpOrder);
    }

    if (stopLossPrice) {
      const slOrder = {
        is_buy: !isBuy,
        sz: orderSize,
        limit_px: parseFloat(stopLossPrice),
        reduce_only: true,
        order_type: {
          trigger: {
            triggerPx: parseFloat(stopLossPrice),
            isMarket: false,
            tpsl: 'sl'
          }
        }
      };
      orders.push(slOrder);
    }

    // Convert to order wires - EXACT pattern from official SDK
    const orderWires = orders.map(o => orderToWire(o, parseInt(assetIndex)));

    // Create action - EXACT pattern from official SDK
    const actions = orderWireToAction(orderWires, grouping);

    // Generate nonce and sign - EXACT pattern from official SDK
    const nonce = generateUniqueNonce();
    const signature = await signL1Action(
      signer,
      actions,
      vaultAddress,
      nonce,
      !isTestnet
    );

    // Create payload - EXACT pattern from official SDK
    const payload = { action: actions, nonce, signature, vaultAddress };

    console.log('📤 Submitting order payload:', JSON.stringify(payload, null, 2));

    // Submit to Hyperliquid
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('📥 API Response:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Order placement failed:', error);
    throw error;
  }
}

/**
 * Transfer USDC using official SDK pattern
 */
export async function transferUSDC(signer, destination, amount, isTestnet = false) {
  try {
    const action = {
      type: 'usdSend',
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: isTestnet ? '0x66eee' : '0xa4b1', // Arbitrum chain IDs
      destination: destination.toLowerCase(),
      amount: amount.toString(),
      time: Date.now()
    };
    
    const signature = await signUsdTransferAction(signer, action, !isTestnet);
    
    const payload = {
      action,
      nonce: action.time,
      signature
    };
    
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
 * Cancel order using official SDK pattern
 */
export async function cancelOrder(signer, assetIndex, orderId, isTestnet = false) {
  try {
    const vaultAddress = null;
    
    const action = {
      type: 'cancel',
      cancels: [{
        a: parseInt(assetIndex),
        o: orderId
      }]
    };
    
    const nonce = generateUniqueNonce();
    const signature = await signL1Action(
      signer, 
      action, 
      vaultAddress, 
      nonce, 
      !isTestnet
    );
    
    const payload = { action, nonce, signature, vaultAddress };
    
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('❌ Cancel order failed:', error);
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
  cancelOrder,
  validateOrderSize,
  calculatePositionSize,
  formatPrice,
  parseErrorMessage,
  HYPERLIQUID_ENDPOINTS
};