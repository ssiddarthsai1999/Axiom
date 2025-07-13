// utils/atomTrading.js - Fixed version with proper cross-chain signing
import { Hyperliquid } from '@nomeida/hyperliquid-sdk-js';
import { ethers } from 'ethers';

// Constants
const MAINNET = true;
const CHAIN_ID_MAINNET = 42161; // Arbitrum One
const PHANTOM_CHAIN_ID = 1337; // Hyperliquid's phantom domain for L1 actions

/**
 * Creates a custom signer that can handle cross-chain signing
 * This wrapper intercepts signTypedData calls and modifies the domain
 * to use chainId 1337 when needed for Hyperliquid L1 actions
 */
class HyperliquidSigner {
  constructor(signer) {
    this.signer = signer;
    this.address = signer.address;
    
    // Bind all signer methods
    const signerMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(signer))
      .filter(name => typeof signer[name] === 'function' && name !== 'constructor');
    
    signerMethods.forEach(method => {
      if (method !== 'signTypedData' && method !== '_signTypedData') {
        this[method] = signer[method].bind(signer);
      }
    });
  }

  async getAddress() {
    return this.address;
  }

  /**
   * Custom signTypedData that handles Hyperliquid's phantom domain
   */
  async signTypedData(domain, types, value) {
    console.log('🔐 Intercepted signTypedData call');
    console.log('Original domain:', domain);
    
    // Check if this is a Hyperliquid L1 action (phantom domain)
    if (domain.name === 'Exchange' && domain.version === '1') {
      console.log('📝 Detected Hyperliquid L1 action, using phantom domain');
      
      // Create the phantom domain with chainId 1337
      const phantomDomain = {
        name: 'Exchange',
        version: '1',
        chainId: PHANTOM_CHAIN_ID,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      };
      
      console.log('Modified domain:', phantomDomain);
      
      // Sign with the phantom domain
      try {
        // For ethers v6
        if (this.signer.signTypedData) {
          return await this.signer.signTypedData(phantomDomain, types, value);
        }
        // For ethers v5
        else if (this.signer._signTypedData) {
          return await this.signer._signTypedData(phantomDomain, types, value);
        }
      } catch (error) {
        console.error('❌ Signing failed:', error);
        throw new Error(`Cross-chain signing failed: ${error.message}`);
      }
    }
    
    // For non-L1 actions, use the original domain
    if (this.signer.signTypedData) {
      return await this.signer.signTypedData(domain, types, value);
    } else if (this.signer._signTypedData) {
      return await this.signer._signTypedData(domain, types, value);
    }
    
    throw new Error('signTypedData method not found on signer');
  }

  // Ethers v5 compatibility
  async _signTypedData(domain, types, value) {
    return this.signTypedData(domain, types, value);
  }
}

/**
 * Initialize Hyperliquid SDK with custom signer
 */
async function initializeHyperliquid(signer) {
  console.log('🚀 Initializing Hyperliquid SDK...');
  
  // Wrap the signer with our custom implementation
  const hyperliquidSigner = new HyperliquidSigner(signer);
  
  // Get the wallet address
  const address = await hyperliquidSigner.getAddress();
  console.log('💳 Wallet address:', address);
  
  // Initialize the SDK with the custom signer
  const sdk = new Hyperliquid({
    privateKey: null, // We're using a custom wallet
    testnet: !MAINNET,
    walletAddress: address,
    vaultAddress: null,
    customWallet: hyperliquidSigner // Pass our wrapped signer
  });
  
  await sdk.initialize();
  console.log('✅ Hyperliquid SDK initialized');
  
  return sdk;
}

/**
 * Buy ATOM tokens at market price
 */
export async function buyAtomMarket(amount, signer, isMainnet = true) {
  try {
    console.log(`\n🎯 Starting ATOM market buy for ${amount} tokens...`);
    
    // Initialize SDK with custom signer
    const sdk = await initializeHyperliquid(signer);
    
    // Create market order using Immediate-or-Cancel (IOC) for market-like execution
    const orderRequest = {
      coin: "ATOM-PERP",
      is_buy: true,
      sz: amount,
      limit_px: 1000000, // High price to ensure market execution
      order_type: { 
        limit: { 
          tif: "Ioc" // Immediate-or-Cancel acts like market order
        } 
      },
      reduce_only: false
    };
    
    console.log('📋 Order details:', {
      symbol: orderRequest.coin,
      side: 'BUY',
      size: orderRequest.sz,
      type: 'Market (IOC)'
    });
    
    // Place the order
    console.log('📤 Submitting order to Hyperliquid...');
    const response = await sdk.exchange.placeOrder(orderRequest);
    
    console.log('✅ Order response:', response);
    
    return response;
    
  } catch (error) {
    console.error('❌ Error in buyAtomMarket:', error);
    
    // Provide helpful error messages
    if (error.message?.includes('chainId')) {
      throw new Error(
        'Cross-chain signing failed. Your wallet may not support signing with different chain IDs. ' +
        'Try using MetaMask with developer mode enabled, or use a different wallet like Rainbow or Frame.'
      );
    } else if (error.message?.includes('does not exist')) {
      throw new Error(
        'Your wallet is not onboarded to Hyperliquid. ' +
        'Please visit app.hyperliquid.xyz to deposit USDC first.'
      );
    } else if (error.message?.includes('Insufficient margin')) {
      throw new Error(
        'Insufficient margin for this trade. ' +
        'Please ensure you have enough USDC deposited in Hyperliquid.'
      );
    }
    
    throw error;
  }
}

/**
 * Get account state from Hyperliquid
 */
export async function getAccountState(address, isMainnet = true) {
  try {
    console.log('📊 Fetching account state for:', address);
    
    // Create a temporary SDK instance just for reading (no signer needed)
    const sdk = new Hyperliquid({
      privateKey: null,
      testnet: !isMainnet,
      walletAddress: address,
      vaultAddress: null
    });
    
    const state = await sdk.info.perpetuals.getClearinghouseState(address);
    console.log('✅ Account state fetched');
    
    return state;
    
  } catch (error) {
    console.error('❌ Error fetching account state:', error);
    throw error;
  }
}

/**
 * Alternative approach using direct API calls if SDK fails
 */
export async function buyAtomMarketDirect(amount, signer, isMainnet = true) {
  try {
    console.log(`\n🎯 Using direct API approach for ATOM buy...`);
    
    const address = await signer.getAddress();
    const nonce = Date.now();
    
    // Create the order action
    const action = {
      type: "order",
      orders: [{
        a: 15, // ATOM-PERP asset ID (you may need to verify this)
        b: true, // is_buy
        p: "1000000", // High price for market execution
        s: amount.toString(),
        r: false, // reduce_only
        t: { limit: { tif: "Ioc" } }
      }],
      grouping: "na"
    };
    
    // Import the signing functions from your SDK
    const { signL1Action } = await import('@nomeida/hyperliquid-sdk-js/dist/utils/signing');
    
    // Create custom signer wrapper for the signing function
    const hyperliquidSigner = new HyperliquidSigner(signer);
    
    // Sign the action
    const signature = await signL1Action(
      hyperliquidSigner,
      action,
      null, // activePool
      nonce,
      isMainnet
    );
    
    // Send to API
    const apiUrl = isMainnet 
      ? 'https://api.hyperliquid.xyz/exchange'
      : 'https://api.hyperliquid-testnet.xyz/exchange';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        signature,
        nonce
      })
    });
    
    const result = await response.json();
    console.log('✅ Direct API response:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error in direct API approach:', error);
    throw error;
  }
}

/**
 * Helper to check if wallet supports cross-chain signing
 */
export function checkWalletCompatibility(walletName) {
  const compatibleWallets = [
    'MetaMask', // With developer mode enabled
    'Rainbow',
    'Frame',
    'Coinbase Wallet',
    'Trust Wallet'
  ];
  
  const problematicWallets = [
    'Ledger', // Hardware wallets often reject cross-chain signing
    'Trezor'
  ];
  
  if (problematicWallets.some(w => walletName?.includes(w))) {
    console.warn('⚠️ Hardware wallets may have issues with cross-chain signing');
    return false;
  }
  
  return true;
}

// Export all functions
export default {
  buyAtomMarket,
  buyAtomMarketDirect,
  getAccountState,
  checkWalletCompatibility,
  HyperliquidSigner
};