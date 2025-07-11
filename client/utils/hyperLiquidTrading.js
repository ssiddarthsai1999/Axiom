// SOLUTION: Agent Wallet Implementation for Hyperliquid

import * as hl from "@nktkas/hyperliquid";
import { ethers } from 'ethers';

// API endpoints for reference
export const HYPERLIQUID_ENDPOINTS = {
  MAINNET_INFO: 'https://api.hyperliquid.xyz/info',
  MAINNET_EXCHANGE: 'https://api.hyperliquid.xyz/exchange',
  TESTNET_INFO: 'https://api.hyperliquid-testnet.xyz/info',
  TESTNET_EXCHANGE: 'https://api.hyperliquid-testnet.xyz/exchange'
};

/**
 * Create an Agent Wallet for trading (solves chainId mismatch)
 */
export async function createAgentWallet(masterSigner, agentName = "TradingBot", isTestnet = false) {
  try {
    console.log('🤖 Creating Agent Wallet...');
    
    // Generate a new private key for the agent
    const agentPrivateKey = ethers.Wallet.createRandom().privateKey;
    const agentWallet = new ethers.Wallet(agentPrivateKey);
    const agentAddress = agentWallet.address;
    
    console.log('🔑 Generated agent address:', agentAddress);
    
    // Create transport and exchange client with master signer
    const transport = new hl.HttpTransport({ isTestnet });
    const masterExchangeClient = new hl.ExchangeClient({ 
      wallet: masterSigner, 
      transport 
    });
    
    console.log('✍️ Approving agent with master wallet...');
    
    // Approve the agent wallet using the master account
    const approveResult = await masterExchangeClient.approveAgent({
      agentAddress: agentAddress,
      agentName: agentName
    });
    
    console.log('📝 Agent approval result:', approveResult);
    
    if (approveResult.status !== 'ok') {
      throw new Error(`Failed to approve agent: ${approveResult.response}`);
    }
    
    // Create exchange client with the agent wallet for trading
    const agentExchangeClient = new hl.ExchangeClient({
      wallet: agentWallet,
      transport,
      walletAddress: await masterSigner.getAddress() // Important: specify master address
    });
    
    // Create info client
    const infoClient = new hl.InfoClient({ transport });
    
    console.log('✅ Agent wallet created successfully!');
    
    return {
      agentWallet,
      agentAddress,
      agentPrivateKey,
      clients: {
        info: infoClient,
        exchange: agentExchangeClient,
        masterExchange: masterExchangeClient
      },
      masterAddress: await masterSigner.getAddress()
    };
    
  } catch (error) {
    console.error('❌ Failed to create agent wallet:', error);
    throw error;
  }
}

/**
 * Alternative: Use a pre-existing agent wallet
 */
export function createAgentClients(agentPrivateKey, masterAddress, isTestnet = false) {
  try {
    const agentWallet = new ethers.Wallet(agentPrivateKey);
    const transport = new hl.HttpTransport({ isTestnet });
    
    const agentExchangeClient = new hl.ExchangeClient({
      wallet: agentWallet,
      transport,
      walletAddress: masterAddress // Specify which account this agent trades for
    });
    
    const infoClient = new hl.InfoClient({ transport });
    
    return {
      info: infoClient,
      exchange: agentExchangeClient,
      agentAddress: agentWallet.address
    };
  } catch (error) {
    console.error('Error creating agent clients:', error);
    throw error;
  }
}

/**
 * Store agent credentials securely (implement based on your storage solution)
 */
export function storeAgentCredentials(masterAddress, agentData) {
  // Store in localStorage for now (in production, use secure storage)
  const key = `hyperliquid_agent_${masterAddress.toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify({
    agentAddress: agentData.agentAddress,
    agentPrivateKey: agentData.agentPrivateKey,
    created: Date.now()
  }));
}

/**
 * Retrieve stored agent credentials
 */
export function getStoredAgentCredentials(masterAddress) {
  try {
    const key = `hyperliquid_agent_${masterAddress.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error retrieving agent credentials:', error);
    return null;
  }
}

/**
 * Get or create agent wallet for trading
 */
export async function getOrCreateAgentWallet(masterSigner, isTestnet = false) {
  try {
    const masterAddress = await masterSigner.getAddress();
    
    // Check if we already have an agent for this master address
    const storedAgent = getStoredAgentCredentials(masterAddress);
    
    if (storedAgent) {
      console.log('🔄 Using existing agent wallet:', storedAgent.agentAddress);
      
      // Test if the agent is still valid
      try {
        const clients = createAgentClients(storedAgent.agentPrivateKey, masterAddress, isTestnet);
        
        // Test a simple API call to verify the agent works
        const userState = await clients.info.clearinghouseState({ 
          user: masterAddress.toLowerCase() 
        });
        
        console.log('✅ Existing agent wallet is valid');
        return {
          ...storedAgent,
          clients,
          masterAddress
        };
      } catch (error) {
        console.log('⚠️ Existing agent wallet invalid, creating new one...');
        // Fall through to create new agent
      }
    }
    
    // Create new agent wallet
    console.log('🆕 Creating new agent wallet...');
    const agentData = await createAgentWallet(masterSigner, "TradingBot", isTestnet);
    
    // Store for future use
    storeAgentCredentials(masterAddress, agentData);
    
    return agentData;
    
  } catch (error) {
    console.error('❌ Failed to get or create agent wallet:', error);
    throw error;
  }
}

/**
 * Updated place order function using agent wallet
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
}, masterSigner, isTestnet = false) {
  try {
    console.log('📤 Placing order with agent wallet...');
    
    // Get or create agent wallet
    const agentData = await getOrCreateAgentWallet(masterSigner, isTestnet);
    const { exchange } = agentData.clients;
    
    // Prepare the main order
    const mainOrder = {
      a: assetIndex,
      b: isBuy,
      p: orderType.toLowerCase() === 'market' ? '0' : price.toString(),
      s: size.toString(),
      r: reduceOnly,
      t: orderType.toLowerCase() === 'market' 
        ? { trigger: { isMarket: true, triggerPx: '0', tpsl: 'tp' } }
        : { limit: { tif: timeInForce } }
    };

    // Add client order ID if provided
    if (clientOrderId !== null && clientOrderId !== undefined && clientOrderId !== '') {
      mainOrder.c = clientOrderId;
    }

    const orders = [mainOrder];

    // Add TP/SL orders if specified
    if (takeProfitPrice) {
      orders.push({
        a: assetIndex,
        b: !isBuy,
        p: takeProfitPrice.toString(),
        s: size.toString(),
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
        s: size.toString(),
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

    console.log('📦 Placing order via agent:', {
      agentAddress: agentData.agentAddress,
      masterAddress: agentData.masterAddress,
      orders,
      grouping
    });

    // Place the order using the agent
    const result = await exchange.order({
      orders,
      grouping
    });

    console.log('📥 Agent order result:', result);
    return result;

  } catch (error) {
    console.error('❌ Agent order placement failed:', error);
    throw error;
  }
}

/**
 * Get asset index using agent setup
 */
export async function getAssetIndex(symbol, isTestnet = false) {
  try {
    const transport = new hl.HttpTransport({ isTestnet });
    const client = new hl.InfoClient({ transport });
    
    const meta = await client.meta();
    
    if (meta && meta.universe) {
      const tokenIndex = meta.universe.findIndex(token => token.name === symbol);
      return tokenIndex >= 0 ? tokenIndex : 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error fetching asset index:', error);
    return 0;
  }
}

/**
 * Get user account state using agent setup
 */
export async function getUserAccountState(userAddress, isTestnet = false) {
  try {
    const transport = new hl.HttpTransport({ isTestnet });
    const client = new hl.InfoClient({ transport });
    
    const normalizedAddress = userAddress.toLowerCase();
    
    const userState = await client.clearinghouseState({ 
      user: normalizedAddress 
    });
    
    return userState;
  } catch (error) {
    console.error('Error fetching user account state:', error);
    return null;
  }
}

// Keep all the utility functions as before...
export function calculatePositionSize(margin, leverage, price) {
  const notionalValue = margin * leverage;
  return notionalValue / price;
}

export function calculateLiquidationPrice(entryPrice, leverage, isLong) {
  const maintenanceMarginRate = 0.05;
  const factor = 1 - (1 / leverage) - maintenanceMarginRate;
  
  if (isLong) {
    return entryPrice * factor;
  } else {
    return entryPrice * (2 - factor);
  }
}

export function calculateUnrealizedPnL(entryPrice, currentPrice, size, isLong) {
  const priceDiff = currentPrice - entryPrice;
  return isLong ? priceDiff * size : -priceDiff * size;
}

export function calculatePositionValue(size, price) {
  return size * price;
}

export function calculateRequiredMargin(notionalValue, leverage) {
  return notionalValue / leverage;
}

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

export function formatNumber(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return value.toFixed(decimals);
}

export function formatCurrency(value, currency = 'USD') {
  if (typeof value !== 'number' || isNaN(value)) return `0.00 ${currency}`;
  return `${value.toFixed(2)} ${currency}`;
}

export function formatPercentage(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) return '0.00%';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function parseErrorMessage(response) {
  if (response.status === 'ok') return null;
  
  const errorMsg = response.response || response.message || 'Unknown error';
  
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

export function getCurrentTimestamp() {
  return Date.now();
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  placeOrder,
  getOrCreateAgentWallet,
  createAgentWallet,
  storeAgentCredentials,
  getStoredAgentCredentials,
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
  HYPERLIQUID_ENDPOINTS
};