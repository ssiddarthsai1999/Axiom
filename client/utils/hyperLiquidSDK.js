// utils/hyperLiquidSDK.js - Using @nktkas/hyperliquid SDK
import { ExchangeClient, InfoClient, HttpTransport } from '@nktkas/hyperliquid';
import { signUserSignedAction, userSignedActionEip712Types } from "@nktkas/hyperliquid/signing";
import { ethers } from "ethers";
import * as hl from "@nktkas/hyperliquid";

/**
 * Custom signer wrapper for the @nktkas/hyperliquid SDK
 */
class CustomSigner {
  constructor(signer, address = null) {
    this.signer = signer;
    this.address = address;
  }

  async getAddress() {
    if (this.address) {
      return this.address;
    }
    
    // Try wagmi wallet client format first
    if (this.signer && this.signer.account && this.signer.account.address) {
      this.address = this.signer.account.address;
      return this.address;
    }
    
    // Try ethers signer format
    if (this.signer && typeof this.signer.getAddress === 'function') {
      this.address = await this.signer.getAddress();
      return this.address;
    }
    
    // If address was passed in constructor, use it
    if (this.address) {
      return this.address;
    }
    
    throw new Error('Unable to get address from signer. Please provide address explicitly.');
  }

  async signTypedData(domain, types, message) {
    // For Hyperliquid on Arbitrum, we need to ensure the domain uses chain ID 42161
    const hyperliquidDomain = {
      ...domain,
      chainId: "0xa4b1" // Chain ID 42161 in hex (Arbitrum mainnet)
    };
    
    console.log('🔐 Signing with Hyperliquid domain:', hyperliquidDomain);
    return await this.signer.signTypedData(hyperliquidDomain, types, message);
  }

  async signMessage(message) {
    return await this.signer.signMessage(message);
  }
}

/**
 * Initialize Hyperliquid SDK with custom signer
 */
async function initializeHyperliquidSDK(signer, isMainnet = true, agentAddress = null) {
  console.log('🚀 Initializing @nktkas/hyperliquid SDK...');
  
  try {
    // Get the wallet address FIRST
    const userAddress = await signer.getAddress();
    console.log('💳 User wallet address:', userAddress);
    
    // Clear any potential cached data
    console.log('🧹 Clearing potential cached data...');
    if (typeof window !== 'undefined') {
      // Clear any localStorage/sessionStorage that might contain wallet addresses
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('hyperliquid') || key.includes('wallet') || key.includes('address'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('🗑️ Removing cached key:', key);
        localStorage.removeItem(key);
      });
      
      // Also clear sessionStorage
      const sessionKeysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('hyperliquid') || key.includes('wallet') || key.includes('address'))) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => {
        console.log('🗑️ Removing session key:', key);
        sessionStorage.removeItem(key);
      });
      
      // Clear any global variables
      if (window.hyperliquidSDK) {
        console.log('🗑️ Clearing cached SDK instance');
        delete window.hyperliquidSDK;
      }
      if (window.hyperliquidWallet) {
        console.log('🗑️ Clearing cached wallet');
        delete window.hyperliquidWallet;
      }
    }
    
    // Create custom signer wrapper
    const customSigner = new CustomSigner(signer);
    
    // Verify the custom signer returns the correct address
    const signerAddress = await customSigner.getAddress();
    console.log('🔍 Custom signer address:', signerAddress);
    
    if (signerAddress.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`Signer address mismatch! Expected ${userAddress} but got ${signerAddress}`);
    }
    
    // Create transport with explicit configuration
    const transport = new HttpTransport({
      isTestnet: !isMainnet,
    });
    
    // Initialize the SDK with proper chain ID configuration
    // For Arbitrum mainnet, we need to use chain ID 42161 (0xa4b1 in hex)
    const sdkConfig = {
      transport,
      wallet: customSigner,
      signatureChainId: "0xa4b1", // Chain ID 42161 in hex (Arbitrum mainnet)
    };
    
    console.log('🔧 SDK config:', sdkConfig);
    
    const sdk = new ExchangeClient(sdkConfig);
    
    console.log('✅ @nktkas/hyperliquid SDK initialized with chain ID 42161 (Arbitrum)');
    console.log('🔍 SDK instance:', sdk);
    
    // Verify the SDK is using the correct address
    try {
      const sdkAddress = await sdk.wallet.getAddress();
      console.log('🔍 SDK wallet address:', sdkAddress);
      if (sdkAddress.toLowerCase() !== userAddress.toLowerCase()) {
        console.error('🚨 SDK wallet address mismatch!');
        console.error('Expected:', userAddress);
        console.error('Got:', sdkAddress);
        throw new Error(`SDK initialization failed: Address mismatch. Expected ${userAddress} but SDK returned ${sdkAddress}`);
      } else {
        console.log('✅ SDK wallet address matches signer address');
      }
    } catch (addrError) {
      console.log('⚠️ Could not verify SDK wallet address:', addrError.message);
      throw new Error(`SDK address verification failed: ${addrError.message}`);
    }
    
    return sdk;
    
  } catch (error) {
    console.error('❌ Error initializing SDK:', error);
    throw error;
  }
}

/**
 * Initialize InfoClient for read-only operations
 */
function initializeInfoClient(isMainnet = true) {
  const transport = new HttpTransport({
    isTestnet: !isMainnet,
  });
  
  return new InfoClient({ transport });
}

/**
 * Helper function to guide users through enabling MetaMask developer mode
 */
export function enableMetaMaskDeveloperMode() {
  const instructions = `
🔧 To enable MetaMask Developer Mode:

1. Open MetaMask
2. Click the menu (three dots) in the top right
3. Go to Settings > Advanced
4. Scroll down and enable "Developer Mode"
5. Restart MetaMask
6. Try the transaction again

This allows MetaMask to sign transactions with different chain IDs than the currently connected network.

Note: The app is now configured to use Arbitrum chain ID (42161) which should match your wallet.
  `;
  
  console.log(instructions);
  alert('Please enable MetaMask Developer Mode. Check the console for detailed instructions.');
  
  return instructions;
}

/**
 * Generate a new agent wallet (in-memory only, not persisted)
 */
export function generateAgentWallet() {
  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('🤖 Generated new agent wallet:', wallet.address);
  return wallet;
}

// /**
//  * Approve the agent wallet with the main wallet (on-chain action)
//  *
//  * @param {ethers.Signer} mainSigner - The main wallet signer (MetaMask, etc)
//  * @param {string} agentAddress - The address of the agent wallet
//  * @param {boolean} isMainnet - Whether to use mainnet or testnet
//  * @param {string} [agentName] - Optional name for the agent wallet
//  * @returns {Promise<any>} The result of the approval transaction
//  */
// export async function approveAgentWallet(mainSigner, agentAddress, isMainnet = true, agentName = undefined) {
//   // Prepare the ApproveAgent action
//   const userAddress = await mainSigner.getAddress();
//   console.log('🔐 Approving agent wallet:', agentAddress, 'for user:', userAddress);
  
//   const nonce = Date.now();
  
//   // Use the exact domain format that Hyperliquid expects
//   const domain = {
//     name: 'Exchange',
//     version: '1',
//     chainId: '0xa4b1', // Arbitrum mainnet
//     verifyingContract: '0x0000000000000000000000000000000000000000',
//   };
  
//   const types = {
//     Exchange: [
//       { name: 'action', type: 'bytes' },
//       { name: 'nonce', type: 'uint64' },
//       { name: 'signatureChainId', type: 'uint256' },
//     ],
//   };
  
//   const action = {
//     type: 'approveAgent',
//     hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
//     signatureChainId: '0xa4b1',
//     agentAddress,
//     agentName,
//     nonce,
//   };
  
//   // Encode action using msgpack
//   const { encode } = await import('@msgpack/msgpack');
//   const actionBytes = encode(action);
  
//   console.log('📦 Encoded action bytes:', actionBytes);
//   console.log('📦 Action bytes length:', actionBytes.length);
  
//   const dataToSign = {
//     action: actionBytes,
//     nonce: BigInt(nonce),
//     signatureChainId: BigInt('0xa4b1'),
//   };
  
//   console.log('📋 Signing data:', {
//     domain,
//     types,
//     dataToSign,
//     userAddress
//   });
  
//   // Sign with main wallet
//   const signature = await mainSigner.signTypedData(domain, types, dataToSign);
//   console.log('🔐 Raw signature:', signature);
  
//   // Parse signature components correctly
//   const r = signature.slice(0, 66);
//   const s = '0x' + signature.slice(66, 130);
//   const v = parseInt(signature.slice(130, 132), 16);
  
//   console.log('🔐 Parsed signature:', { r, s, v });
  
//   // Verify signature recovery (optional but helpful for debugging)
//   try {
//     const { ethers } = await import('ethers');
//     const recoveredAddress = ethers.verifyTypedData(domain, types, dataToSign, signature);
//     console.log('🔍 Recovered address from signature:', recoveredAddress);
//     console.log('🔍 Expected address:', userAddress);
//     console.log('🔍 Addresses match:', recoveredAddress.toLowerCase() === userAddress.toLowerCase());
//   } catch (recoveryError) {
//     console.warn('⚠️ Could not verify signature recovery:', recoveryError.message);
//   }
  
//   // Prepare request body
//   const requestBody = {
//     action,
//     nonce,
//     signature: {
//       v,
//       r,
//       s,
//     },
//   };
  
//   console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));
  
//   // Send to API
//   const apiUrl = isMainnet
//     ? 'https://api.hyperliquid.xyz/exchange'
//     : 'https://api.testnet.hyperliquid-testnet.xyz/exchange';
    
//   const response = await fetch(apiUrl, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(requestBody),
//   });
  
//   if (!response.ok) {
//     const errorText = await response.text();
//     throw new Error(`ApproveAgent failed: ${response.status} - ${errorText}`);
//   }
  
//   const result = await response.json();
//   console.log('✅ Agent wallet approved:', result);
//   return result;
// }


export async function approveAgentWallet(mainSigner, agentAddress, isMainnet = true, agentName) {
  console.log(mainSigner, 'mainSigner in approveAgentWallet');
  const nonce = Date.now();
  console.log('🔐 Approving agent wallet:', agentAddress, 'for user:', mainSigner.getAddress());
  const action = {
    type: "approveAgent",
    signatureChainId: "0xa4b1", // Arbitrum mainnet
    hyperliquidChain: "Mainnet",
    agentAddress,
    agentName,
    nonce,
  };
  console.log('🔐 Action:', action);
  const chainId = parseInt(action.signatureChainId, 16); // 42161
  
  const signature = await signUserSignedAction({
    wallet: mainSigner,
    action,
    types: userSignedActionEip712Types.approveAgent,
    chainId,
  });
  console.log('🔐 Signature:', signature);
  const resp = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, signature, nonce }),
  });
  console.log('🔐 Response:', resp);
  if (!resp.ok) {
    throw new Error(`Approval failed: ${await resp.text()}`);
  }

  return resp.json();
}

/**
 * Get or create the session agent wallet (persisted in sessionStorage for the session)
 * @returns {ethers.Wallet}
 */
export function getOrCreateSessionAgentWallet() {
  if (typeof window === 'undefined') throw new Error('Not in browser environment');
  let agentKey = sessionStorage.getItem('hl_agent_wallet');
  const createdAt = parseInt(sessionStorage.getItem('agentCreatedAt') || '0');
  const isExpired = Date.now() - createdAt > 6 * 60 * 60 * 1000;
  // console.log('🔑 isExpired:', isExpired);
  // return new ethers.Wallet(agentKey);
  if (isExpired) {
    sessionStorage.removeItem('hl_agent_wallet');
    sessionStorage.removeItem('agentCreatedAt');
    agentKey = null;
  }
  let agentWallet;
  if (agentKey) {
    agentWallet = new ethers.Wallet(agentKey);
    // console.log('🔑 Loaded agent wallet from sessionStorage:', agentWallet.address);
  } else {
    agentWallet = ethers.Wallet.createRandom();
    sessionStorage.setItem('hl_agent_wallet', agentWallet.privateKey);
    sessionStorage.setItem('agentCreatedAt', Date.now().toString());
    console.log('🔑 Generated and saved new agent wallet:', agentWallet.address);
  }
  return agentWallet;
}

/**
 * Check if the agent wallet is already approved for the main wallet
 * @param {ethers.Signer} mainSigner
 * @param {ethers.Wallet} agentWallet
 * @param {boolean} isMainnet
 * @returns {Promise<boolean>}
 */
export async function isAgentWalletApproved(mainSigner, agentWallet, isMainnet = true) {
  const agents = await getAgentWallets(mainSigner, isMainnet);
  if (agents && agents.length > 0) {
    const agent = agents.find(a => a.address?.toLowerCase() === agentWallet.address.toLowerCase() && a.validUntil > Date.now());
    if (agent) {
      console.log('✅ Agent wallet already approved:', agentWallet.address);
      return true;
    }
  }
  return false;
}

/**
 * Approve the agent wallet if not already approved
 * @param {ethers.Signer} mainSigner
 * @param {ethers.Wallet} agentWallet
 * @param {boolean} isMainnet
 * @param {string} [agentName]
 * @returns {Promise<void>}
 */
export async function ensureAgentWalletApproved(mainSigner, agentWallet, isMainnet = true, agentName = undefined) {
  const approved = await isAgentWalletApproved(mainSigner, agentWallet, isMainnet);
  if (approved) {
    console.log('✅ Agent wallet already approved:', agentWallet.address);
    return;
  }
  await approveAgentWallet(mainSigner, agentWallet.address, isMainnet, agentName);
  console.log('✅ Agent wallet approved:', agentWallet.address);
}

/**
 * Place an order using the agent wallet (API wallet)
 *
 * @param {ethers.Wallet} agentWallet - The agent wallet (must be approved)
 * @param {object} orderParams - The order parameters (same as before)
 * @param {boolean} isMainnet - Whether to use mainnet or testnet
 * @returns {Promise<any>} The result of the order
 */
export async function placeOrderWithAgentWallet(orderParams, isMainnet = true) {
  const agentWallet = getOrCreateSessionAgentWallet();
  console.log(agentWallet.privateKey, 'agentWallet -----')
  console.log(agentWallet.address, 'agentWallet address -----')
  console.log('🚀 Starting Agent Wallet order placement...');
  console.log('📋 Order params:', orderParams);
  
  const transport = new hl.HttpTransport({ isTestnet: !isMainnet });
  const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
  
  // const assetId = getAssetId(orderParams.symbol);
  
  // Match HyperLiquid app format exactly
  const orderRequest = {
    orders: [{
      a: orderParams.cloid,
      b: orderParams.isBuy,
      p: orderParams.price.toString(),
      s: orderParams.size.toString(),
      r: false,
      t: {
        limit: {
          tif: orderParams.orderType === 'market' ? 'FrontendMarket' : 'Gtc', // Use FrontendMarket for market orders
        },
      },
    }],
    grouping: 'na',
    builder: {
      b: '0xD4418418F6673B48E1828F539bED0340F78114E1',
      f: 100
    }
  };
  
  console.log('📋 Order request (HyperLiquid format):', JSON.stringify(orderRequest, null, 2));
  
  try {
    const result = await exchClient.order(orderRequest);
    console.log('✅ Order placed with agent wallet:', result);
    return result;
  } catch (error) {
    console.error('❌ Error placing order:', error);
    throw error;
  }
}

/**
 * Get existing agent wallets for a user
 */
export async function getAgentWallets(signer, isMainnet = true) {
  try {
    const address = await signer.getAddress();
    const infoClient = initializeInfoClient(isMainnet);

    const extraAgents = await infoClient.extraAgents({ user: address });
    return extraAgents;
  } catch (error) {
    console.error('❌ Error getting agent wallets:', error);
    throw error;
  }
}

/**
 * Convert asset symbol to asset ID
 */
export function getAssetId(symbol) {
  // Asset mappings based on HyperLiquid API
  const assetMap = {
    'BTC': 0,
    'ETH': 1,
    'SOL': 2,
    'WIF': 3,
    'PEPE': 4,
    'ORDI': 5,
    'SATS': 6,
    'TIA': 7,
    'SEI': 8,
    'JUP': 9,
    'STRK': 10,
    'PYTH': 11,
    'INJ': 12,
    'STX': 13,
    'MATIC': 14,
    'ATOM': 15,
    'ARB': 16,
    'OP': 17,
    'AVAX': 18,
    'NEAR': 19,
    'DYDX': 20,
    'GMX': 21,
    'LINK': 22,
    'UNI': 23,
    'ADA': 24,
    'DOGE': 25,
    'SHIB': 26,
    'TRX': 27,
    'ETC': 28,
    'XLM': 29,
    'LTC': 30,
    'BCH': 31,
    'XRP': 32,
    'DOT': 33,
    'FIL': 34,
    'AAVE': 35,
    'MKR': 36,
    'CRV': 37,
    'LDO': 38,
    'BLUR': 39,
    'SUI': 40,
    'APT': 41,
    'FTM': 42,
    'MANA': 43,
    'SAND': 44,
    'AXS': 45,
    'ICP': 46,
    'IMX': 47,
    'ENS': 48,
    'OP': 49,
    'RUNE': 50,
    'BONK': 51,
    'WLD': 52,
    'ARKM': 53,
    'MEME': 54,
    'JTO': 55,
    'DYM': 56,
    'PENDLE': 57,
    'ALT': 58,
    'TNSR': 59,
    'W': 60,
    'ENA': 61,
    'ETHFI': 62,
    'REZ': 63,
    'BB': 64,
    'LISTA': 65,
    'ZRO': 66,
    'IO': 67,
    'NOT': 68,
    'DOGS': 69,
    'TON': 70,
    'CATI': 71,
    'HMSTR': 72,
    'NEIRO': 73,
    'TURBO': 74,
    'EIGEN': 75,
    'GOAT': 76,
    'GRASS': 77,
    'PNUT': 78,
    'CHILLGUY': 79,
    'VIRTUAL': 80,
    'ACT': 81,
    'PUFFER': 82,
    'AI16Z': 83,
    'ZEREBRO': 84,
    'USUAL': 85,
    'MOVE': 86,
    'ONDO': 87,
    'PENGU': 88,
    'HYPE': 89,
    'ME': 90,
    'VANA': 91,
    'VELO': 92,
    'VELODROME': 93,
    'AERO': 94,
    'HIGHER': 95,
    'SPX': 96,
    'FARTCOIN': 97,
    'BAN': 98,
    'LUCE': 99,
    'CHILLGUY': 100,
    'POL': 142, // Polygon (MATIC rebrand)
    // Add more as needed
  };
  
  const assetId = assetMap[symbol];
  if (assetId === undefined) {
    throw new Error(`Unknown asset symbol: ${symbol}. Available symbols: ${Object.keys(assetMap).join(', ')}`);
  }
  
  return assetId;
}

/**
 * Get user account state using SDK
 */
export async function getUserAccountStateSDK(signer, address, isMainnet = true) {
  try {
    console.log('📊 Getting user account state via SDK...', { address });
    
    // Use InfoClient for read-only operations (no signer needed for this)
    const infoClient = initializeInfoClient(isMainnet);
    
    // Get account state using the correct method
    const accountState = await infoClient.clearinghouseState({ user: address });
    
    console.log('✅ SDK Account state:', accountState);
    return accountState;
    
  } catch (error) {
    console.error('❌ Error getting account state via SDK:', error);
    throw error;
  }
}

/**
 * Get market data using SDK
 */
export async function getMarketDataSDK(isMainnet = true) {
  try {
    console.log('📈 Getting market data via SDK...');
    
    // Use InfoClient for read-only operations
    const infoClient = initializeInfoClient(isMainnet);
    
    // Get market data using the correct method
    const marketData = await infoClient.l2Book({ coin: "BTC" });
    
    console.log('✅ SDK Market data received');
    return marketData;
    
  } catch (error) {
    console.error('❌ Error getting market data via SDK:', error);
    throw error;
  }
}

/**
 * Cancel order using SDK
 */
export async function cancelOrderSDK(orderId, signer, isMainnet = true) {
  try {
    console.log('❌ Canceling order via SDK...', orderId);
    
    // Initialize SDK
    const sdk = await initializeHyperliquidSDK(signer, isMainnet);
    
    // Cancel the order using the correct method
    const response = await sdk.cancel({ cancels: [{ a: 0, o: orderId }] });
    
    console.log('✅ SDK Cancel order response:', response);
    return response;
    
  } catch (error) {
    console.error('❌ Error canceling order via SDK:', error);
    throw error;
  }
}

/**
 * Get open orders using SDK
 */
export async function getOpenOrdersSDK(signer, address, isMainnet = true) {
  try {
    console.log('📋 Getting open orders via SDK...', { address });
    
    // Use InfoClient for read-only operations (no signer needed for this)
    const infoClient = initializeInfoClient(isMainnet);
    
    // Get open orders using the correct method
    const openOrders = await infoClient.openOrders({ user: address });
    
    console.log('✅ SDK Open orders:', openOrders);
    return openOrders;
    
  } catch (error) {
    console.error('❌ Error getting open orders via SDK:', error);
    throw error;
  }
}

/**
 * Update leverage using the nktkas/hyperliquid SDK
 * @param {number} assetIndex - The asset index (0 for BTC, 1 for ETH, etc.)
 * @param {number} leverage - The leverage value (1-50)
 * @param {boolean} isCross - Whether to use cross margin (true) or isolated (false)
 * @param {ethers.Signer} signer - The wallet signer
 * @param {boolean} isMainnet - Whether to use mainnet or testnet
 * @returns {Promise<any>} The result of the leverage update
 */
export async function updateLeverageSDK(assetIndex, leverage, isCross, signer, isMainnet = true) {
  try {
    const agentWallet = getOrCreateSessionAgentWallet();
    const transport = new hl.HttpTransport({ isTestnet: !isMainnet });
    const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
    const leverageParams = {
      asset: assetIndex,
      isCross: isCross,
      leverage: leverage
    };
    const response = await exchClient.updateLeverage(leverageParams);
    return response;
  } catch (error) {
    console.error('❌ Error updating leverage:', error);
    throw error;
  }
}

/**
 * Get asset index by symbol for leverage updates (uses same mapping as getAssetId)
 */
export function getAssetIndexBySymbol(symbol) {
  // Use the same mapping as getAssetId for consistency
  return getAssetId(symbol);
}

// Note: Individual TP/SL order functions removed - now using single request with normalTpsl grouping

/**
 * Enhanced order placement with TP/SL support (matches HyperLiquid app format)
 * @param {object} orderParams - Main order parameters
 * @param {object} tpSlParams - TP/SL parameters
 * @param {boolean} isMainnet - Whether to use mainnet
 * @param {object} assetInfo - Asset information for proper price formatting
 * @returns {Promise<any>} Results of all placed orders
 */
export async function placeOrderWithTPSL(orderParams, tpSlParams, isMainnet = true, assetInfo = null) {
  try {
    console.log('🚀 Placing order with TP/SL (HyperLiquid format)...', { orderParams, tpSlParams });
    
    const agentWallet = getOrCreateSessionAgentWallet();
    const transport = new hl.HttpTransport({ isTestnet: !isMainnet });
    const exchClient = new hl.ExchangeClient({ wallet: agentWallet, transport });
    
    const isLongPosition = orderParams.isBuy;
    
    // Build orders array starting with main order
    const orders = [];
    
    // Main order (matches HyperLiquid app format)
    const mainOrder = {
      a: orderParams.cloid,
      b: orderParams.isBuy,
      p: orderParams.price.toString(),
      r: false,
      s: orderParams.size.toString(),
      t: {
        limit: {
          tif: orderParams.orderType === 'market' ? 'FrontendMarket' : 'Gtc'
        }
      },
      builder: {
        b: '0xD4418418F6673B48E1828F539bED0340F78114E1',
        f: 100
      }
    };
    orders.push(mainOrder);
    
    // Add TP/SL orders if enabled
    if (tpSlParams.enabled) {
      // Stop Loss order (opposite direction, reduce-only)
      if (tpSlParams.stopLossPrice && tpSlParams.stopLossPrice > 0) {
        // Format the SL price using the same logic as main order
        const formattedSLPrice = assetInfo 
          ? formatPriceToMaxDecimals(tpSlParams.stopLossPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot)
          : tpSlParams.stopLossPrice.toString();
        
        const slOrder = {
          a: orderParams.cloid,
          b: !isLongPosition, // Opposite of main order
          p: formattedSLPrice,
          r: true, // reduce_only
          s: orderParams.size.toString(),
          t: {
            trigger: {
              isMarket: true,
              tpsl: 'sl',
              triggerPx: formattedSLPrice
            }
          },
          builder: {
            b: '0xD4418418F6673B48E1828F539bED0340F78114E1',
            f: 100
          }
        };
        orders.push(slOrder);
        
        console.log('🛡️ Stop Loss order formatted:', {
          originalPrice: tpSlParams.stopLossPrice,
          formattedPrice: formattedSLPrice,
          order: slOrder
        });
      }
      
      // Take Profit order (opposite direction, reduce-only)
      if (tpSlParams.takeProfitPrice && tpSlParams.takeProfitPrice > 0) {
        // Format the TP price using the same logic as main order
        const formattedTPPrice = assetInfo 
          ? formatPriceToMaxDecimals(tpSlParams.takeProfitPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot)
          : tpSlParams.takeProfitPrice.toString();
        
        const tpOrder = {
          a: orderParams.cloid,
          b: !isLongPosition, // Opposite of main order
          p: formattedTPPrice,
          r: true, // reduce_only
          s: orderParams.size.toString(),
          t: {
            trigger: {
              isMarket: true,
              tpsl: 'tp',
              triggerPx: formattedTPPrice
            }
          },
          builder: {
            b: '0xD4418418F6673B48E1828F539bED0340F78114E1',
            f: 100
          }
        };
        orders.push(tpOrder);
        
        console.log('🎯 Take Profit order formatted:', {
          originalPrice: tpSlParams.takeProfitPrice,
          formattedPrice: formattedTPPrice,
          order: tpOrder
        });
      }
    }
    
    // Create order request in HyperLiquid app format
    const orderRequest = {
      action: {
        type: 'order',
        orders: orders,
        grouping: tpSlParams.enabled ? 'normalTpsl' : 'na' // Use normalTpsl when TP/SL is enabled
      },
      isFrontend: true, // Match HyperLiquid app
      nonce: Date.now(),
      vaultAddress: null
    };
    
    console.log('📋 TP/SL Order request (HyperLiquid format):', JSON.stringify(orderRequest, null, 2));
    
    // Use the lower-level API call to match exact format
    const result = await exchClient.order({
      orders: orders,
      grouping: tpSlParams.enabled ? 'normalTpsl' : 'na'
    });
    
    console.log('✅ TP/SL orders placed (HyperLiquid format):', result);
    
    // Format response to match expected structure
    return {
      mainOrder: result,
      takeProfitOrder: tpSlParams.enabled && tpSlParams.takeProfitPrice ? result : null,
      stopLossOrder: tpSlParams.enabled && tpSlParams.stopLossPrice ? result : null,
      errors: []
    };
    
  } catch (error) {
    console.error('❌ Error in placeOrderWithTPSL:', error);
    throw error;
  }
}

// Utility function to count significant figures
function countSignificantFigures(value) {
  const cleanValue = parseFloat(value).toString();
  const scientificMatch = cleanValue.match(/^(\d+\.?\d*)e/);
  
  if (scientificMatch) {
    // Handle scientific notation
    const mantissa = scientificMatch[1].replace('.', '');
    return mantissa.length;
  }
  
  // Remove leading zeros and decimal point
  const withoutLeadingZeros = cleanValue.replace(/^0+/, '').replace('.', '');
  return withoutLeadingZeros.length;
}

/**
 * Calculate HyperLiquid-compatible tick size based on price level and szDecimals
 * This ensures prices follow HyperLiquid's actual tick size rules
 */
function getHyperLiquidTickSize(price, szDecimals) {
  const p = Math.abs(price);
  
  // HyperLiquid uses a combination of price level and szDecimals for tick sizes
  // The tick size is generally 1 unit at the allowed decimal precision
  
  // Calculate max allowed decimal places for prices
  const MAX_DECIMALS = 6; // For perpetuals (spot uses 8)
  const maxPriceDecimals = MAX_DECIMALS - szDecimals;
  
  // Tick size is 1 unit at the max allowed decimal place
  const tickSize = Math.pow(10, -maxPriceDecimals);
  
  return tickSize;
}

/**
 * Round price to HyperLiquid tick size
 */
function roundToHyperLiquidTick(price, szDecimals) {
  const tickSize = getHyperLiquidTickSize(price, szDecimals);
  const rounded = Math.round(price / tickSize) * tickSize;
  
  // Ensure we don't have floating point precision issues
  const maxPriceDecimals = 6 - szDecimals;
  return parseFloat(rounded.toFixed(maxPriceDecimals));
}

// Utility function to format prices for HyperLiquid
function formatPriceToMaxDecimals(value, szDecimals, isSpot = false) {
  if (!value || value === '') return value;
  
  let num = parseFloat(value);
  if (isNaN(num)) return value;
  
  const valueStr = value.toString();
  
  // Check significant figures limit (max 5)
  const sigFigs = countSignificantFigures(valueStr);
  if (sigFigs > 5) {
    // Truncate to 5 significant figures - no recursion!
    num = parseFloat(num.toPrecision(5));
  }
  
  // Apply HyperLiquid tick size rounding
  const tickRounded = roundToHyperLiquidTick(num, szDecimals);

  return tickRounded.toString();
}

/**
 * Calculate TP/SL prices based on percentage
 * @param {number} entryPrice - Entry price
 * @param {number} tpPercentage - Take profit percentage
 * @param {number} slPercentage - Stop loss percentage  
 * @param {boolean} isLong - Whether it's a long position
 * @param {object} assetInfo - Asset information for proper price formatting
 * @returns {object} Calculated TP/SL prices
 */
export function calculateTPSLPrices(entryPrice, tpPercentage, slPercentage, isLong, assetInfo = null) {
  let takeProfitPrice = null;
  let stopLossPrice = null;
  
  if (tpPercentage && tpPercentage > 0) {
    if (isLong) {
      takeProfitPrice = entryPrice * (1 + tpPercentage / 100);
    } else {
      takeProfitPrice = entryPrice * (1 - tpPercentage / 100);
    }
  }
  
  if (slPercentage && slPercentage > 0) {
    if (isLong) {
      stopLossPrice = entryPrice * (1 - slPercentage / 100);
    } else {
      stopLossPrice = entryPrice * (1 + slPercentage / 100);
    }
  }
  
  // Apply proper price formatting if assetInfo is available
  if (assetInfo) {
    if (takeProfitPrice !== null) {
      takeProfitPrice = parseFloat(formatPriceToMaxDecimals(takeProfitPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot));
    }
    if (stopLossPrice !== null) {
      stopLossPrice = parseFloat(formatPriceToMaxDecimals(stopLossPrice.toString(), assetInfo.szDecimals, assetInfo.isSpot));
    }
  } else {
    // Fallback to toFixed(6) if no assetInfo available
    if (takeProfitPrice !== null) {
      takeProfitPrice = parseFloat(takeProfitPrice.toFixed(6));
    }
    if (stopLossPrice !== null) {
      stopLossPrice = parseFloat(stopLossPrice.toFixed(6));
    }
  }
  
  return {
    takeProfitPrice,
    stopLossPrice
  };
}

/**
 * Get the maximum builder fee for a user
 * @param {ethers.Signer} signer - The ethers.js signer
 * @param {boolean} isMainnet - Whether to use mainnet
 * @param {string} builderAddress - Optional builder address to check (defaults to user's own address)
 * @returns {Promise<number>} The maximum builder fee
 */
export async function getMaxBuilderFee(signer, isMainnet = true, builderAddress = null) {
  try {
    if (!signer) {
      throw new Error('Signer is required');
    }

    const userAddress = await signer.getAddress();
    const builder = builderAddress || userAddress; // Use user's own address as default builder

    const transport = new HttpTransport({ isTestnet: !isMainnet });
    const infoClient = new InfoClient({ transport });
    
    try {
      const maxFee = await infoClient.maxBuilderFee({ 
        user: userAddress,
        builder: builder
      });
      return maxFee;
    } catch (error) {
      // If there's no approval for this builder or user hasn't deposited, return 0
      console.log('No builder fee approval found or user needs to deposit funds first, returning 0');
      console.log('Error details:', error.message);
      return 0;
    }
  } catch (error) {
    console.error('❌ Error getting max builder fee:', error);
    throw error;
  }
}

/**
 * Approve builder fee using the same pattern as approveAgentWallet
 * @param {ethers.Signer} signer - The ethers.js signer
 * @param {string} maxFeeRate - The maximum fee rate to approve as percentage string (e.g., "1%" for 1%)
 * @param {boolean} isMainnet - Whether to use mainnet
 * @param {string} builderAddress - Optional builder address to approve (defaults to user's own address)
 * @returns {Promise<any>} The approval result
 */
export async function approveBuilderFee(signer, maxFeeRate, isMainnet = true, builderAddress = null) {
  try {
    console.log('🔧 Approving builder fee:', maxFeeRate);

    const nonce = Date.now();
    const userAddress = await signer.getAddress();
    console.log('🔍 User address:', userAddress);

    // Use user's own address as builder if not specified
    const builder = builderAddress || userAddress;
    console.log('🔍 Builder address:', builder);

    // Create the action in exactly the same format as approveAgentWallet
    const action = {
      type: "approveBuilderFee",
      signatureChainId: "0xa4b1", // Arbitrum mainnet
      hyperliquidChain: isMainnet ? "Mainnet" : "Testnet", 
      maxFeeRate: maxFeeRate,
      builder: builder,
      nonce,
    };
    
    console.log('🔐 Action to be signed:', action);
    const chainId = parseInt(action.signatureChainId, 16); // 42161
    
    // Try multiple approaches to get the right signing working
    let signature;
    let signatureError = null;
    
    try {
      // First, try with approveBuilderFee types if they exist
      console.log('🔐 Attempting to sign with approveBuilderFee types...');
      signature = await signUserSignedAction({
        wallet: signer,
        action,
        types: userSignedActionEip712Types.approveBuilderFee,
        chainId,
      });
      console.log('✅ Successfully signed with approveBuilderFee types');
    } catch (error) {
      signatureError = error;
      console.log('⚠️ approveBuilderFee types failed:', error.message);
      
      try {
        // Fallback: try with approveAgent types (they might be similar enough)
        console.log('🔐 Attempting to sign with approveAgent types as fallback...');
        signature = await signUserSignedAction({
          wallet: signer,
          action,
          types: userSignedActionEip712Types.approveAgent,
          chainId,
        });
        console.log('✅ Successfully signed with approveAgent types');
      } catch (error2) {
        console.log('❌ Both signing methods failed:', error2.message);
        
        // If both approaches fail, try creating our own simple EIP-712 signing without SDK dependencies
        console.log('🔐 Attempting direct EIP-712 signing as last resort...');
        
        const domain = {
          name: "HyperliquidSignTransaction",
          version: "1", 
          chainId: 42161,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        };
        
        const types = {
          "HyperliquidTransaction:ApproveBuilderFee": [
            { name: "hyperliquidChain", type: "string" },
            { name: "signatureChainId", type: "string" },
            { name: "maxFeeRate", type: "string" },
            { name: "builder", type: "string" },
            { name: "nonce", type: "uint64" },
          ],
        };
        
        const message = {
          hyperliquidChain: action.hyperliquidChain,
          signatureChainId: action.signatureChainId,
          maxFeeRate: action.maxFeeRate,
          builder: action.builder,
          nonce: BigInt(action.nonce),
        };
        
        const rawSignature = await signer.signTypedData(domain, types, message);
        
        // Convert to the format SDK expects
        const r = rawSignature.slice(0, 66);
        const s = '0x' + rawSignature.slice(66, 130);
        const v = parseInt(rawSignature.slice(130, 132), 16);
        
        signature = { r, s, v };
      }
    }
    
    if (!signature) {
      throw new Error('Failed to generate signature with any method');
    }
    
    console.log('🔐 Final signature:', signature);

    // Prepare the request body exactly like approveAgentWallet
    const requestBody = { action, signature, nonce };
    
    console.log('📤 Sending request:', JSON.stringify(requestBody, null, 2));

    // Send to Hyperliquid API
    const exchangeApiUrl = isMainnet 
      ? 'https://api.hyperliquid.xyz/exchange'
      : 'https://api.hyperliquid-testnet.xyz/exchange';
    
    const resp = await fetch(exchangeApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    const responseBodyText = await resp.text();
    console.log('📥 Response status:', resp.status);
    console.log('📥 Response body:', responseBodyText);
    
    if (!resp.ok) {
      throw new Error(`Builder fee approval failed: ${resp.status} - ${responseBodyText}`);
    }

    const result = JSON.parse(responseBodyText);
    
    // Check if the JSON response contains an error status
    if (result.status === 'err') {
      throw new Error(`Builder fee approval failed: ${result.response || 'Unknown error'}`);
    }
    
    console.log('✅ Builder fee approved:', result);
    return result;
  } catch (error) {
    console.error('❌ Error approving builder fee:', error);
    throw error;
  }
}