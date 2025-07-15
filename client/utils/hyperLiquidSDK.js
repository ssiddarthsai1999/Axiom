// utils/hyperLiquidSDK.js - Using @nktkas/hyperliquid SDK
import { ExchangeClient, InfoClient, HttpTransport } from '@nktkas/hyperliquid';
import { ethers } from "ethers";

/**
 * Custom signer wrapper for the @nktkas/hyperliquid SDK
 */
class CustomSigner {
  constructor(signer) {
    this.signer = signer;
    this.address = null;
  }

  async getAddress() {
    if (!this.address) {
      this.address = await this.signer.getAddress();
    }
    return this.address;
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
 * Create an Agent Wallet for Hyperliquid (like the official app)
 */
export async function createAgentWallet(signer, isMainnet = true) {
  try {
    console.log('🤖 Creating Agent Wallet for Hyperliquid...');
    
    // Initialize SDK
    const sdk = await initializeHyperliquidSDK(signer, isMainnet);
    
    // Get user address
    const userAddress = await signer.getAddress();
    
    // Create agent wallet with a unique name
    const timestamp = Date.now();
    const agentName = `Agent-${userAddress.slice(0, 8)}-${timestamp}`;
    
    console.log('📋 Creating agent with name:', agentName);
    
    // Approve agent (this creates the agent wallet)
    const result = await sdk.approveAgent({
      agentAddress: userAddress,
      agentName: agentName,
    });
    
    console.log('✅ Agent wallet created:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error creating agent wallet:', error);
    
    // If the error is about using existing user address, try to get existing agents
    if (error.message?.includes('Cannot use existing user address as agent')) {
      console.log('🔄 User already has agent wallets, checking existing ones...');
      
      try {
        const existingAgents = await getAgentWallets(signer, isMainnet);
        console.log('✅ Found existing agent wallets:', existingAgents);
        return existingAgents;
      } catch (agentError) {
        console.error('❌ Error getting existing agents:', agentError);
        throw new Error('You already have agent wallets. Please try placing an order directly.');
      }
    }
    
    throw error;
  }
}

/**
 * Get existing agent wallets for a user
 */
export async function getAgentWallets(signer, isMainnet = true) {
  try {
    console.log('🔍 Getting agent wallets...');
    
    // Get wallet address
    const customSigner = new CustomSigner(signer);
    const address = await customSigner.getAddress();
    
    // Use InfoClient for read-only operations
    const infoClient = initializeInfoClient(isMainnet);
    
    // Get user details (includes agent information)
    const userDetails = await infoClient.userDetails({ user: address });
    
    console.log('✅ Agent wallets:', userDetails);
    return userDetails;
    
  } catch (error) {
    console.error('❌ Error getting agent wallets:', error);
    throw error;
  }
}

/**
 * Create a completely fresh SDK instance with forced address verification
 */
async function createFreshSDKInstance(signer, isMainnet = true) {
  console.log('🔄 Creating completely fresh SDK instance...');
  
  // Get the user address first
  const userAddress = await signer.getAddress();
  console.log('💳 User address for fresh SDK:', userAddress);
  
  // Clear ALL potential cached data
  if (typeof window !== 'undefined') {
    console.log('🧹 Clearing ALL cached data...');
    
    // Clear localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('hyperliquid') || key.includes('wallet') || key.includes('address') || key.includes('sdk'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      console.log('🗑️ Removing localStorage key:', key);
      localStorage.removeItem(key);
    });
    
    // Clear sessionStorage
    const sessionKeysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.includes('hyperliquid') || key.includes('wallet') || key.includes('address') || key.includes('sdk'))) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach(key => {
      console.log('🗑️ Removing sessionStorage key:', key);
      sessionStorage.removeItem(key);
    });
    
    // Clear global variables
    const globalVars = ['hyperliquidSDK', 'hyperliquidWallet', 'hyperliquidAddress', 'sdkInstance'];
    globalVars.forEach(varName => {
      if (window[varName]) {
        console.log('🗑️ Clearing global variable:', varName);
        delete window[varName];
      }
    });
  }
  
  // Create a completely new custom signer
  const customSigner = new CustomSigner(signer);
  
  // Verify the signer address
  const signerAddress = await customSigner.getAddress();
  if (signerAddress.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error(`Fresh signer address mismatch! Expected ${userAddress} but got ${signerAddress}`);
  }
  
  // Create a new transport instance
  const transport = new HttpTransport({
    isTestnet: !isMainnet,
  });
  
  // Create SDK with explicit configuration
  const sdkConfig = {
    transport,
    wallet: customSigner,
    signatureChainId: "0xa4b1", // Chain ID 42161 in hex (Arbitrum mainnet)
  };
  
  console.log('🔧 Fresh SDK config:', sdkConfig);
  
  const sdk = new ExchangeClient(sdkConfig);
  
  // Immediately verify the SDK address
  const sdkAddress = await sdk.wallet.getAddress();
  console.log('🔍 Fresh SDK address:', sdkAddress);
  
  if (sdkAddress.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error(`Fresh SDK address mismatch! Expected ${userAddress} but got ${sdkAddress}`);
  }
  
  console.log('✅ Fresh SDK instance created successfully');
  return sdk;
}

/**
 * Fallback: Manual API request when SDK fails
 */
async function placeOrderManually(signer, orderParams, isMainnet = true) {
  console.log('🔄 Falling back to manual API request...');

  try {
    const userAddress = await signer.getAddress();
    console.log('👤 Manual order - User address:', userAddress);

    // Get asset ID
    const assetId = getAssetId(orderParams.symbol);
    console.log('🔍 Asset ID for', orderParams.symbol, ':', assetId);

    // --- Fetch actual market price for market orders ---
    let price = orderParams.price;
    if (orderParams.orderType === 'market' && (!price || price === '0' || price === 0 || price === '999999')) {
      try {
        const infoClient = initializeInfoClient(isMainnet);
        const l2 = await infoClient.l2Book({ coin: orderParams.symbol });
        if (orderParams.isBuy) {
          // For buy, use best ask
          price = l2.asks && l2.asks.length > 0 ? l2.asks[0][0] : '1';
        } else {
          // For sell, use best bid
          price = l2.bids && l2.bids.length > 0 ? l2.bids[0][0] : '1';
        }
        console.log('💰 Using market price for market order:', price);
      } catch (e) {
        console.warn('⚠️ Could not fetch market price, using fallback price 1');
        price = '1';
      }
    }

    // --- Use FrontendMarket TIF for market orders ---
    const tif = orderParams.orderType === 'market' ? 'FrontendMarket' : 'Gtc';

    // --- Create the action for signing (match official frontend) ---
    const action = {
      type: 'order',
      orders: [{
        a: assetId, // asset index
        b: orderParams.isBuy, // is buy
        p: price.toString(), // use actual price for all orders
        s: orderParams.size.toString(), // size as string
        r: false, // reduce only
        t: {
          limit: {
            tif: tif
          }
        }
      }],
      grouping: 'na'
    };

    console.log('📋 Manual order action:', JSON.stringify(action, null, 2));

    // Generate nonce
    const nonce = Date.now();

    // Import msgpack for action encoding
    const { encode } = await import('@msgpack/msgpack');

    // Encode the action using msgpack
    const actionBytes = encode(action);
    console.log('📦 Encoded action bytes length:', actionBytes.length);

    // Create the data to sign with proper EIP-712 structure
    const domain = {
      name: 'Exchange',
      version: '1',
      chainId: '0xa4b1', // Chain ID 42161 in hex (Arbitrum mainnet)
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types = {
      Exchange: [
        { name: 'action', type: 'bytes' },
        { name: 'nonce', type: 'uint64' },
        { name: 'signatureChainId', type: 'uint256' }
      ]
    };

    const dataToSign = {
      action: actionBytes, // should be Uint8Array, not hex string
      nonce: BigInt(nonce),
      signatureChainId: BigInt('0xa4b1')
    };

    console.log('🔐 Signing manual order with EIP-712...');
    console.log('📋 Domain:', domain);
    console.log('📋 Types:', types);
    console.log('📋 Data to sign:', {
      action: `0x${Buffer.from(actionBytes).toString('hex')}`,
      nonce: dataToSign.nonce.toString(),
      signatureChainId: dataToSign.signatureChainId.toString()
    });

    const signature = await signer.signTypedData(domain, types, dataToSign);
    console.log('✅ Manual order signed');

    // --- Build request body to match official frontend ---
    const requestBody = {
      action,
      isFrontend: true,
      nonce: nonce, // Send as number, not string (as per API docs)
      signature: {
        v: parseInt(signature.slice(130, 132), 16),
        r: signature.slice(0, 66),
        s: '0x' + signature.slice(66, 130)
      },
      vaultAddress: null
      // Do NOT include signatureChainId at top level
    };

    console.log('📤 Sending manual API request...');
    console.log('📋 Request body:', JSON.stringify(requestBody, null, 2));

    // Make the API request directly
    const apiUrl = isMainnet
      ? 'https://api.hyperliquid.xyz/exchange'
      : 'https://api.testnet.hyperliquid-testnet.xyz/exchange';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Manual API request failed:', response.status, errorText);
      throw new Error(`Manual API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Manual order response:', result);
    return result;

  } catch (error) {
    console.error('❌ Manual order placement failed:', error);
    throw error;
  }
}

/**
 * Place order directly without agent wallet
 */
export async function placeOrderDirect(signer, orderParams, isMainnet = true) {
  try {
    console.log('🚀 Starting direct order placement...');
    console.log('📋 Order params:', orderParams);
    
    // Validate parameters
    if (!orderParams.symbol) {
      throw new Error('Symbol is required');
    }
    
    if (!orderParams.size || orderParams.size <= 0) {
      throw new Error('Valid size is required');
    }
    
    if (!orderParams.hasOwnProperty('isBuy')) {
      throw new Error('isBuy flag is required');
    }
    
    // Get user address first to verify we're using the correct one
    const userAddress = await signer.getAddress();
    console.log('👤 Direct order - User address:', userAddress);
    
    // Clear any global state that might be causing issues
    console.log('🧹 Clearing global state...');
    if (typeof window !== 'undefined') {
      // Clear any global variables that might be cached
      if (window.hyperliquidSDK) {
        console.log('🗑️ Clearing cached SDK instance');
        delete window.hyperliquidSDK;
      }
      if (window.hyperliquidWallet) {
        console.log('🗑️ Clearing cached wallet');
        delete window.hyperliquidWallet;
      }
      
      // Clear any other potential cached data
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
    }
    
    // Try SDK first
    try {
      // Force a completely fresh SDK instance
      console.log('🔄 Creating fresh SDK instance...');
      const sdk = await createFreshSDKInstance(signer, isMainnet);
      
      // Triple-check the SDK is using the correct address
      try {
        const sdkAddress = await sdk.wallet.getAddress();
        console.log('🔍 Final SDK wallet address check:', sdkAddress);
        if (sdkAddress.toLowerCase() !== userAddress.toLowerCase()) {
          throw new Error(
            `SDK initialization failed: Address mismatch. Expected ${userAddress} but SDK returned ${sdkAddress}`
          );
        }
        console.log('✅ SDK address verification passed');
      } catch (addrError) {
        console.log('⚠️ Could not verify final SDK address:', addrError.message);
        throw new Error(`SDK address verification failed: ${addrError.message}`);
      }
      
      // Get asset ID
      const assetId = getAssetId(orderParams.symbol);
      console.log('🔍 Asset ID for', orderParams.symbol, ':', assetId);
      
      // Create the order request
      const orderRequest = {
        orders: [{
          a: assetId, // asset index
          b: orderParams.isBuy, // is buy
          p: orderParams.orderType === 'market' 
            ? (orderParams.isBuy ? "999999" : "0.000001") // Use extreme prices for market orders
            : orderParams.price.toString(), // Use actual price for limit orders
          s: orderParams.size.toString(), // size as string
          r: false, // reduce only
          t: {
            limit: {
              tif: orderParams.orderType === 'market' ? "Ioc" : "Gtc" // IOC for market, GTC for limit
            }
          }
        }],
        grouping: "na"
      };
      
      console.log('📋 Direct Order request:', JSON.stringify(orderRequest, null, 2));
      
      // Place the order directly
      console.log('📤 Submitting order directly...');
      const response = await sdk.order(orderRequest);
      
      console.log('✅ Direct Order response:', response);
      return response;
      
    } catch (sdkError) {
      console.log('❌ SDK order placement failed:', sdkError.message);
      
      // Check if it's an address mismatch error
      if (sdkError.message?.includes('does not exist') || 
          sdkError.message?.includes('User or API Wallet') ||
          sdkError.message?.includes('wrong wallet address') ||
          sdkError.message?.includes('Address mismatch')) {
        
        console.log('🔄 SDK address mismatch detected, trying manual fallback...');
        return await placeOrderManually(signer, orderParams, isMainnet);
      }
      
      // Re-throw other SDK errors
      throw sdkError;
    }
    
  } catch (error) {
    console.error('❌ Direct Place order error:', error);
    
    // Check if the error contains a different wallet address
    if (error.message?.includes('does not exist')) {
      const addressMatch = error.message.match(/0x[a-fA-F0-9]{40}/);
      if (addressMatch) {
        const errorAddress = addressMatch[0];
        const userAddress = await signer.getAddress();
        if (errorAddress.toLowerCase() !== userAddress.toLowerCase()) {
          console.error('🚨 SDK is using wrong address!');
          console.error('Expected:', userAddress);
          console.error('Got:', errorAddress);
          throw new Error(
            `SDK configuration error: Using wrong wallet address. Expected ${userAddress} but got ${errorAddress}. Please refresh the page and try again.`
          );
        }
      }
    }
    
    throw error;
  }
}

/**
 * Place order using Agent Wallet (like Hyperliquid's official app)
 */
export async function placeOrderWithAgent(signer, orderParams, isMainnet = true) {
  try {
    console.log('🚀 Starting Agent Wallet order placement...');
    console.log('📋 Order params:', orderParams);
    
    // Validate parameters
    if (!orderParams.symbol) {
      throw new Error('Symbol is required');
    }
    
    if (!orderParams.size || orderParams.size <= 0) {
      throw new Error('Valid size is required');
    }
    
    if (!orderParams.hasOwnProperty('isBuy')) {
      throw new Error('isBuy flag is required');
    }
    
    // Get user address
    const userAddress = await signer.getAddress();
    console.log('👤 User address:', userAddress);
    
    // Always try direct order placement first (most reliable)
    console.log('📤 Trying direct order placement...');
    try {
      return await placeOrderDirect(signer, orderParams, isMainnet);
    } catch (directError) {
      console.log('❌ Direct order failed:', directError.message);
      
      // If direct order fails with "does not exist", check for agent wallets
      if (directError.message?.includes('does not exist') || directError.message?.includes('User or API Wallet')) {
        console.log('🔍 Checking for existing agent wallets...');
        
        try {
          const existingAgents = await getAgentWallets(signer, isMainnet);
          console.log('✅ Found existing agent wallets:', existingAgents);
          
          // If we have agents, the user might need to use agent wallets
          if (existingAgents && existingAgents.agents && existingAgents.agents.length > 0) {
            console.log('🤖 User has agent wallets but direct order failed. This suggests the user needs to use agent wallets.');
            throw new Error(
              'Your wallet is not directly onboarded to Hyperliquid. ' +
              'Please visit app.hyperliquid.xyz to deposit USDC directly to your wallet first, or use the official app to set up agent wallets properly.'
            );
          }
        } catch (agentError) {
          console.log('ℹ️ No agent wallets found');
        }
        
        // If we get here, the user is not onboarded
        throw new Error(
          'Your wallet is not onboarded to Hyperliquid. ' +
          'Please visit app.hyperliquid.xyz to deposit USDC first.'
        );
      }
      
      // Re-throw other errors
      throw directError;
    }
    
  } catch (error) {
    console.error('❌ Agent Wallet Place order error:', error);
    
    // Provide helpful error messages
    if (error.message?.includes('chainId') || error.message?.includes('1337') || error.message?.includes('42161')) {
      throw new Error(
        'Chain ID mismatch detected. The app is now configured for Arbitrum (42161). Please enable MetaMask Developer Mode if needed.'
      );
    } else if (error.message?.includes('does not exist') || error.message?.includes('User or API Wallet')) {
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
 * Convert asset symbol to asset ID
 */
function getAssetId(symbol) {
  // Common asset mappings - you may need to expand this
  const assetMap = {
    'BTC': 0,
    'ETH': 1,
    'ARB': 11,
    'POL': 142,
    'ATOM': 15,
    'SOL': 16,
    'MATIC': 17,
    'LINK': 18,
    'UNI': 19,
    'AVAX': 20,
    'DOT': 21,
    'LTC': 22,
    'BCH': 23,
    'XRP': 24,
    'ADA': 25,
    'DOGE': 26,
    'SHIB': 27,
    'TRX': 28,
    'ETC': 29,
    'XLM': 30,
    // Add more as needed
  };
  
  const assetId = assetMap[symbol];
  if (assetId === undefined) {
    throw new Error(`Unknown asset symbol: ${symbol}`);
  }
  
  return assetId;
}

/**
 * Get user account state using SDK
 */
export async function getUserAccountStateSDK(signer, isMainnet = true) {
  try {
    console.log('📊 Getting user account state via SDK...');
    
    // Get wallet address
    const customSigner = new CustomSigner(signer);
    const address = await customSigner.getAddress();
    
    // Use InfoClient for read-only operations
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
export async function getOpenOrdersSDK(signer, isMainnet = true) {
  try {
    console.log('📋 Getting open orders via SDK...');
    
    // Get wallet address
    const customSigner = new CustomSigner(signer);
    const address = await customSigner.getAddress();
    
    // Use InfoClient for read-only operations
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