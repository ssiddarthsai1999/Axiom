// utils/hyperliquidTrading.js
import { ethers } from 'ethers';

// Hyperliquid API endpoints
export const HYPERLIQUID_ENDPOINTS = {
  MAINNET_INFO: 'https://api.hyperliquid.xyz/info',
  MAINNET_EXCHANGE: 'https://api.hyperliquid.xyz/exchange',
  TESTNET_INFO: 'https://api.hyperliquid-testnet.xyz/info',
  TESTNET_EXCHANGE: 'https://api.hyperliquid-testnet.xyz/exchange'
};

// EIP-712 Domain for Hyperliquid
export const HYPERLIQUID_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: 42161, // Arbitrum
  verifyingContract: '0x0000000000000000000000000000000000000000'
};

// Order types for EIP-712 signing
export const ORDER_TYPES = {
  'HyperliquidTransaction:PlaceOrder': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'orders', type: 'string' },
    { name: 'grouping', type: 'string' },
    { name: 'builder', type: 'string' },
    { name: 'time', type: 'uint64' }
  ]
};

/**
 * Get asset index from symbol
 * @param {string} symbol - Trading symbol (e.g., 'BTC', 'ETH')
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<number>} Asset index
 */
export async function getAssetIndex(symbol, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.universe) {
      const tokenIndex = data.universe.findIndex(token => token.name === symbol);
      return tokenIndex >= 0 ? tokenIndex : 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error fetching asset index:', error);
    return 0;
  }
}

/**
 * Get user account state
 * @param {string} userAddress - User's wallet address
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} User account state
 */
export async function getUserAccountState(userAddress, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'clearinghouseState',
        user: userAddress 
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user account state:', error);
    return null;
  }
}

/**
 * Create order object for Hyperliquid API
 * @param {Object} orderParams - Order parameters
 * @returns {Object} Formatted order object
 */
export function createOrder({
  assetIndex,
  isBuy,
  size,
  price = null,
  orderType = 'market', // 'market' or 'limit'
  timeInForce = 'Gtc', // 'Gtc', 'Ioc', 'Alo'
  reduceOnly = false,
  clientOrderId = null
}) {
  const isMarketOrder = orderType.toLowerCase() === 'market';
  
  return {
    a: assetIndex,
    b: isBuy,
    p: isMarketOrder ? '0' : price.toString(),
    s: size.toString(),
    r: reduceOnly,
    t: isMarketOrder 
      ? { trigger: { isMarket: true, triggerPx: '0', tpsl: 'tp' } }
      : { limit: { tif: timeInForce } },
    c: clientOrderId
  };
}

/**
 * Create TP/SL orders
 * @param {Object} tpslParams - TP/SL parameters
 * @returns {Array} Array of TP/SL orders
 */
export function createTPSLOrders({
  assetIndex,
  isBuy,
  size,
  takeProfitPrice = null,
  stopLossPrice = null
}) {
  const orders = [];
  
  if (takeProfitPrice) {
    orders.push({
      a: assetIndex,
      b: !isBuy, // Opposite direction for TP
      p: takeProfitPrice.toString(),
      s: size.toString(),
      r: true, // Reduce only
      t: { trigger: { isMarket: false, triggerPx: takeProfitPrice.toString(), tpsl: 'tp' } }
    });
  }
  
  if (stopLossPrice) {
    orders.push({
      a: assetIndex,
      b: !isBuy, // Opposite direction for SL
      p: stopLossPrice.toString(),
      s: size.toString(),
      r: true, // Reduce only
      t: { trigger: { isMarket: false, triggerPx: stopLossPrice.toString(), tpsl: 'sl' } }
    });
  }
  
  return orders;
}

/**
 * Sign order using EIP-712
 * @param {Object} orderData - Order data to sign
 * @param {Object} signer - Ethers signer object
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} Signature object
 */
export async function signOrder(orderData, signer, isTestnet = false) {
  try {
    const domain = {
      ...HYPERLIQUID_DOMAIN,
      chainId: isTestnet ? 421614 : 42161 // Arbitrum testnet vs mainnet
    };

    const message = {
      hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
      orders: JSON.stringify(orderData.action.orders),
      grouping: orderData.action.grouping || 'na',
      builder: orderData.action.builder ? JSON.stringify(orderData.action.builder) : '',
      time: orderData.nonce
    };

    const signature = await signer._signTypedData(
      domain,
      ORDER_TYPES,
      message
    );

    // Split signature into r, s, v components
    const sig = ethers.utils.splitSignature(signature);
    
    return {
      r: sig.r,
      s: sig.s,
      v: sig.v
    };
  } catch (error) {
    console.error('Error signing order:', error);
    throw new Error('Failed to sign order');
  }
}

/**
 * Place order on Hyperliquid
 * @param {Object} orderParams - Order parameters
 * @param {Object} signer - Ethers signer object
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} Order result
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
  clientOrderId = null
}, signer, isTestnet = false) {
  try {
    // Create main order
    const mainOrder = createOrder({
      assetIndex,
      isBuy,
      size,
      price,
      orderType,
      timeInForce,
      reduceOnly,
      clientOrderId
    });

    // Create TP/SL orders if specified
    const tpslOrders = createTPSLOrders({
      assetIndex,
      isBuy,
      size,
      takeProfitPrice,
      stopLossPrice
    });

    // Combine all orders
    const allOrders = [mainOrder, ...tpslOrders];
    
    // Determine grouping
    const grouping = tpslOrders.length > 0 ? 'normalTpsl' : 'na';

    // Create order payload
    const orderData = {
      action: {
        type: 'order',
        orders: allOrders,
        grouping
      },
      nonce: Date.now()
    };

    // Sign the order
    const signature = await signOrder(orderData, signer, isTestnet);

    // Add signature to payload
    const signedOrderData = {
      ...orderData,
      signature
    };

    // Submit to Hyperliquid
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedOrderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.status !== 'ok') {
      throw new Error(`Order failed: ${result.response || 'Unknown error'}`);
    }

    return result;
  } catch (error) {
    console.error('Error placing order:', error);
    throw error;
  }
}

/**
 * Cancel order on Hyperliquid
 * @param {number} assetIndex - Asset index
 * @param {number} orderId - Order ID to cancel
 * @param {Object} signer - Ethers signer object
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} Cancel result
 */
export async function cancelOrder(assetIndex, orderId, signer, isTestnet = false) {
  try {
    const cancelData = {
      action: {
        type: 'cancel',
        cancels: [{
          a: assetIndex,
          o: orderId
        }]
      },
      nonce: Date.now()
    };

    // Note: Cancel orders also need to be signed with EIP-712
    // Implementation would be similar to placeOrder but with cancel-specific types
    
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error canceling order:', error);
    throw error;
  }
}

/**
 * Update leverage for an asset
 * @param {number} assetIndex - Asset index
 * @param {number} leverage - New leverage value
 * @param {boolean} isCross - Whether to use cross margin
 * @param {Object} signer - Ethers signer object
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} Update result
 */
export async function updateLeverage(assetIndex, leverage, isCross, signer, isTestnet = false) {
  try {
    const leverageData = {
      action: {
        type: 'updateLeverage',
        asset: assetIndex,
        isCross,
        leverage
      },
      nonce: Date.now()
    };

    // Sign and submit similar to other actions
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leverageData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating leverage:', error);
    throw error;
  }
}

/**
 * Get user's open orders
 * @param {string} userAddress - User's wallet address
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Array>} Open orders
 */
export async function getUserOpenOrders(userAddress, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'openOrders',
        user: userAddress 
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error('Error fetching open orders:', error);
    return [];
  }
}

/**
 * Get user's positions
 * @param {string} userAddress - User's wallet address
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Array>} User positions
 */
export async function getUserPositions(userAddress, isTestnet = false) {
  try {
    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_INFO : HYPERLIQUID_ENDPOINTS.MAINNET_INFO;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'clearinghouseState',
        user: userAddress 
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data?.assetPositions || [];
  } catch (error) {
    console.error('Error fetching user positions:', error);
    return [];
  }
}

/**
 * Transfer between spot and perp accounts
 * @param {number} amount - Amount to transfer
 * @param {boolean} toPerp - true for spot->perp, false for perp->spot
 * @param {Object} signer - Ethers signer object
 * @param {boolean} isTestnet - Whether to use testnet
 * @returns {Promise<Object>} Transfer result
 */
export async function transferBetweenSpotAndPerp(amount, toPerp, signer, isTestnet = false) {
  try {
    const transferData = {
      action: {
        type: 'usdClassTransfer',
        hyperliquidChain: isTestnet ? 'Testnet' : 'Mainnet',
        signatureChainId: isTestnet ? '0x66eee' : '0xa4b1',
        amount: amount.toString(),
        toPerp,
        nonce: Date.now()
      },
      nonce: Date.now()
    };

    const endpoint = isTestnet ? HYPERLIQUID_ENDPOINTS.TESTNET_EXCHANGE : HYPERLIQUID_ENDPOINTS.MAINNET_EXCHANGE;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transferData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error transferring funds:', error);
    throw error;
  }
}

/**
 * Calculate position size based on leverage and margin
 * @param {number} margin - Available margin in USDC
 * @param {number} leverage - Leverage multiplier
 * @param {number} price - Asset price
 * @returns {number} Position size
 */
export function calculatePositionSize(margin, leverage, price) {
  const notionalValue = margin * leverage;
  return notionalValue / price;
}

/**
 * Calculate liquidation price
 * @param {number} entryPrice - Entry price
 * @param {number} leverage - Leverage used
 * @param {boolean} isLong - Whether it's a long position
 * @returns {number} Liquidation price
 */
export function calculateLiquidationPrice(entryPrice, leverage, isLong) {
  const maintenanceMarginRate = 0.05; // 5% maintenance margin (adjust based on asset)
  const factor = 1 - (1 / leverage) - maintenanceMarginRate;
  
  if (isLong) {
    return entryPrice * factor;
  } else {
    return entryPrice * (2 - factor);
  }
}

/**
 * Calculate unrealized PnL
 * @param {number} entryPrice - Entry price
 * @param {number} currentPrice - Current market price
 * @param {number} size - Position size
 * @param {boolean} isLong - Whether it's a long position
 * @returns {number} Unrealized PnL
 */
export function calculateUnrealizedPnL(entryPrice, currentPrice, size, isLong) {
  const priceDiff = currentPrice - entryPrice;
  return isLong ? priceDiff * size : -priceDiff * size;
}

/**
 * Calculate position value in USD
 * @param {number} size - Position size
 * @param {number} price - Current price
 * @returns {number} Position value in USD
 */
export function calculatePositionValue(size, price) {
  return size * price;
}

/**
 * Calculate required margin for position
 * @param {number} notionalValue - Notional value of position
 * @param {number} leverage - Leverage used
 * @returns {number} Required margin
 */
export function calculateRequiredMargin(notionalValue, leverage) {
  return notionalValue / leverage;
}

/**
 * Validate order parameters
 * @param {Object} orderParams - Order parameters to validate
 * @returns {Object} Validation result
 */
export function validateOrderParams({
  size,
  price = null,
  orderType,
  leverage,
  availableMargin
}) {
  const errors = [];
  
  if (!size || parseFloat(size) <= 0) {
    errors.push('Size must be greater than 0');
  }
  
  if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
    errors.push('Limit price must be greater than 0');
  }
  
  if (leverage < 1 || leverage > 50) {
    errors.push('Leverage must be between 1 and 50');
  }
  
  const orderValue = parseFloat(size) * parseFloat(price || 1);
  const maxOrderValue = availableMargin * leverage;
  
  if (orderValue > maxOrderValue) {
    errors.push('Order size exceeds available margin');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Format number for display
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return value.toFixed(decimals);
}

/**
 * Format currency for display
 * @param {number} value - Number to format
 * @param {string} currency - Currency symbol
 * @returns {string} Formatted currency
 */
export function formatCurrency(value, currency = 'USD') {
  if (typeof value !== 'number' || isNaN(value)) return `0.00 ${currency}`;
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Format percentage for display
 * @param {number} value - Number to format as percentage
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) return '0.00%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Parse error message from Hyperliquid API response
 * @param {Object} response - API response
 * @returns {string} Human-readable error message
 */
export function parseErrorMessage(response) {
  if (response.status === 'ok') return null;
  
  const errorMsg = response.response || response.message || 'Unknown error';
  
  // Map common error messages to user-friendly ones
  const errorMap = {
    'Insufficient margin': 'Not enough margin available for this trade',
    'Invalid price': 'Please enter a valid price',
    'Invalid size': 'Please enter a valid trade size',
    'Asset not found': 'Trading pair not available',
    'Order too small': 'Order size is below minimum requirement',
    'Order too large': 'Order size exceeds maximum limit',
    'Price too far from mark': 'Price is too far from current market price',
    'Self trade': 'Order would trade against your own order',
    'Post only failed': 'Post-only order would have crossed the spread'
  };
  
  return errorMap[errorMsg] || errorMsg;
}

/**
 * Get current timestamp in milliseconds
 * @returns {number} Current timestamp
 */
export function getCurrentTimestamp() {
  return Date.now();
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after sleep
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Result of function or throws last error
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Default export with all functions
export default {
  getAssetIndex,
  getUserAccountState,
  getUserOpenOrders,
  getUserPositions,
  placeOrder,
  cancelOrder,
  updateLeverage,
  transferBetweenSpotAndPerp,
  calculatePositionSize,
  calculateLiquidationPrice,
  calculateUnrealizedPnL,
  calculatePositionValue,
  calculateRequiredMargin,
  validateOrderParams,
  formatNumber,
  formatCurrency,
  formatPercentage,
  parseErrorMessage,
  getCurrentTimestamp,
  sleep,
  retryWithBackoff,
  createOrder,
  createTPSLOrders,
  signOrder,
  HYPERLIQUID_ENDPOINTS,
  HYPERLIQUID_DOMAIN,
  ORDER_TYPES
};