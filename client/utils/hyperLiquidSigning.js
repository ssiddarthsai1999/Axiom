// utils/exactPythonSigning.js - Exact Python SDK Implementation with Cross-Chain Bypass
import { encode } from '@msgpack/msgpack';
import { ethers, getBytes, keccak256 } from 'ethers';

const PHANTOM_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

// Track if user has already given permission to avoid repeated prompts
// Removed - no longer needed since we're bypassing wallet restrictions directly

function actionHash(action, vaultAddress, nonce, expiresAfter = null) {
  console.log('🔍 Action hash input:', JSON.stringify(action, null, 2));
  
  // Step 1: msgpack.packb(action) - NO NORMALIZATION, pack as-is
  const msgPackBytes = encode(action);
  console.log('📦 Msgpack bytes length:', msgPackBytes.length);
  
  // Step 2: Create data array starting with msgpack bytes
  let totalLength = msgPackBytes.length + 8 + 1; // msgpack + nonce + vault flag
  
  if (vaultAddress !== null) {
    totalLength += 20; // vault address
  }
  if (expiresAfter !== null) {
    totalLength += 1 + 8; // expires flag + timestamp
  }
  
  const data = new Uint8Array(totalLength);
  let offset = 0;
  
  // Copy msgpack bytes
  data.set(msgPackBytes, offset);
  offset += msgPackBytes.length;
  
  // Add nonce (8 bytes, big endian) - Python: nonce.to_bytes(8, "big")
  const view = new DataView(data.buffer);
  view.setBigUint64(offset, BigInt(nonce), false); // false = big endian
  offset += 8;
  
  // Add vault flag and address - Python: if vault_address is None: data += b"\x00"
  if (vaultAddress === null) {
    data[offset] = 0x00;
    offset += 1;
  } else {
    data[offset] = 0x01;
    offset += 1;
    // Python: address_to_bytes(vault_address) 
    // IMPORTANT: Lowercase the address as per Hyperliquid docs
    const addressBytes = getBytes(vaultAddress.toLowerCase());
    data.set(addressBytes, offset);
    offset += 20;
  }
  
  // Add expires after if present
  if (expiresAfter !== null) {
    data[offset] = 0x00; // expires flag
    offset += 1;
    view.setBigUint64(offset, BigInt(expiresAfter), false);
    offset += 8;
  }
  
  const hash = keccak256(data);
  console.log('🔒 Action hash:', hash);
  return hash;
}

/**
 * EXACT Python SDK construct_phantom_agent
 * Python: {"source": "a" if is_mainnet else "b", "connectionId": hash}
 */
function constructPhantomAgent(hash, isMainnet) {
  return {
    source: isMainnet ? 'a' : 'b',
    connectionId: hash,
  };
}

/**
 * EXACT Python SDK l1_payload
 */
function l1Payload(phantomAgent, isMainnet = true) {
  // Use the correct chainId based on the network
  // For mainnet, use the actual chainId where the user is onboarded
  // For testnet, use 1337
  const chainId = isMainnet ? 42161 : 1337; // Arbitrum One for mainnet
  
  return {
    domain: {
      chainId: chainId,
      name: 'Exchange',
      verifyingContract: '0x0000000000000000000000000000000000000000',
      version: '1',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: phantomAgent,
  };
}

/**
 * Force cross-chain signing by trying multiple bypass methods
 */
async function forceSignWithChainBypass(wallet, data) {
  console.log('🚀 Attempting to force cross-chain signature...');
  
  // Handle both signer and wallet objects
  let address;
  let walletObject;
  
  if (wallet.getAddress) {
    // It's a signer object
    address = await wallet.getAddress();
    walletObject = wallet;
    console.log('🔍 Using signer object with address:', address);
  } else if (wallet.address) {
    // It's a wallet object with address property
    address = wallet.address;
    walletObject = wallet;
    console.log('🔍 Using wallet object with address:', address);
  } else {
    throw new Error('Invalid wallet object - must have getAddress() method or address property');
  }
  
  // IMPORTANT: Lowercase the address as per Hyperliquid docs
  address = address.toLowerCase();
  
  console.log('🔍 Wallet address for signing:', address);
  console.log('🔍 Wallet object type:', typeof wallet);
  console.log('🔍 Wallet object keys:', Object.keys(wallet));
  
  const typedDataString = JSON.stringify(data);
  
  // Method 1: Try direct wallet signing first (most reliable)
  try {
    console.log('🔧 Method 1: Direct wallet signing...');
    
    // Use the signer from the wallet object if available
    const signer = walletObject.signer || walletObject;
    
    // Verify the signer's address matches before signing
    const signerAddress = await signer.getAddress();
    console.log('🔍 Signer address before signing:', signerAddress);
    console.log('🔍 Expected address:', address);
    
    // IMPORTANT: Use lowercase comparison as per Hyperliquid docs
    if (signerAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Signer address mismatch: expected ${address}, got ${signerAddress}`);
    }
    
    const signature = await signer.signTypedData(
      data.domain,
      data.types,
      data.message
    );
    
    console.log('✅ Direct wallet signing successful:', signature);
    return signature;
    
  } catch (error) {
    console.warn('⚠️ Direct wallet signing failed:', error.message);
  }
  
  // Method 2: Try standard EIP-712 signing with ethereum provider directly
  try {
    console.log('🔧 Method 2: Standard EIP-712 signing...');
    
    if (window.ethereum && window.ethereum.request) {
      // Get the current accounts to ensure we're using the right one
      const accounts = await window.ethereum.request({
        method: 'eth_accounts'
      });
      console.log('🔍 Current ethereum accounts:', accounts);
      console.log('🔍 Using account for signing:', address.toLowerCase());
      
      // Ensure the account we want to sign with is the first one
      if (accounts.length > 0 && accounts[0].toLowerCase() !== address.toLowerCase()) {
        console.warn('⚠️ Account mismatch! Requesting account switch...');
        
        // Try to switch to the correct account
        try {
          await window.ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
          });
          
          // Get accounts again after permission request
          const newAccounts = await window.ethereum.request({
            method: 'eth_accounts'
          });
          console.log('🔍 New ethereum accounts after permission request:', newAccounts);
          
          if (newAccounts.length > 0 && newAccounts[0].toLowerCase() !== address.toLowerCase()) {
            throw new Error(`Account mismatch: expected ${address}, got ${newAccounts[0]}`);
          }
        } catch (switchError) {
          console.warn('⚠️ Failed to switch accounts:', switchError.message);
          throw new Error(`Please ensure your wallet is connected to account ${address}`);
        }
      }
      
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address.toLowerCase(), typedDataString],
      });
      
      console.log('✅ Standard EIP-712 signing successful:', signature);
      return signature;
    }
  } catch (error) {
    console.warn('⚠️ Standard EIP-712 failed:', error.message);
  }
  
  // Method 3: Try personal_sign as fallback
  try {
    console.log('🔧 Method 3: Personal sign fallback...');
    
    // Create the EIP-712 hash
    const eip712Hash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.message);
    console.log('🔍 EIP-712 hash for personal sign:', eip712Hash);
    
    const personalSignature = await window.ethereum.request({
      method: 'personal_sign',
      params: [eip712Hash, address.toLowerCase()],
    });
    
    console.log('✅ Personal sign successful:', personalSignature);
    return personalSignature;
    
  } catch (error) {
    console.warn('⚠️ Personal sign failed:', error.message);
  }
  
  throw new Error('All cross-chain signing methods failed. Your wallet does not support cross-chain signatures.');
}

/**
 * EXACT Python SDK sign_inner implementation with aggressive cross-chain bypass
 */
async function signInner(wallet, data) {
  console.log('🔐 Sign inner with data:', JSON.stringify(data, null, 2));
  
  try {
    console.log('🚀 Starting aggressive cross-chain signature bypass...');
    
    const signature = await forceSignWithChainBypass(wallet, data);
    
    // Handle both signer and wallet objects
    let address;
    if (wallet.getAddress) {
      address = await wallet.getAddress();
    } else if (wallet.address) {
      address = wallet.address;
    } else {
      throw new Error('Invalid wallet object - must have getAddress() method or address property');
    }
    
    // IMPORTANT: Lowercase the address as per Hyperliquid docs
    address = address.toLowerCase();
    
    console.log('🔍 Final wallet address:', address);
    console.log('🔍 Signature received:', signature);
    
    // Check if this is a personal signature (starts with 0x and is 132 chars)
    // EIP-712 signatures are also 132 chars, so we need a different way to detect
    // For now, let's assume all signatures are EIP-712 unless we know otherwise
    const isPersonalSignature = false; // We'll handle this differently
    
    // Try to verify as EIP-712 signature first
    try {
      console.log('🔍 Verifying as EIP-712 signature...');
      
      // Verify EIP-712 signature
      const recoveredAddress = ethers.verifyTypedData(
        data.domain,
        data.types,
        data.message,
        signature
      );
      
      console.log('🔍 EIP-712 verification - Expected:', address);
      console.log('🔍 EIP-712 verification - Recovered:', recoveredAddress);
      console.log('🔍 EIP-712 verification - Match:', recoveredAddress.toLowerCase() === address.toLowerCase());
      
      if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
        console.log('✅ EIP-712 signature verification passed');
        
        // Return in Python SDK format: {"r": ..., "s": ..., "v": ...}
        const { r, s, v } = ethers.Signature.from(signature);
        return { r, s, v };
      }
    } catch (error) {
      console.warn('⚠️ EIP-712 verification error:', error.message);
    }
    
    // If EIP-712 verification failed, try as personal signature
    try {
      console.log('🔍 Verifying as personal signature...');
      
      const eip712Hash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.message);
      const recoveredAddress = ethers.recoverAddress(eip712Hash, signature);
      
      console.log('🔍 Personal signature verification - Expected:', address.toLowerCase());
      console.log('🔍 Personal signature verification - Recovered:', recoveredAddress.toLowerCase());
      console.log('🔍 Personal signature verification - Match:', address.toLowerCase() === recoveredAddress.toLowerCase());
      
      if (address.toLowerCase() === recoveredAddress.toLowerCase()) {
        console.log('✅ Personal signature verification passed');
        
        // Return in Python SDK format: {"r": ..., "s": ..., "v": ...}
        const { r, s, v } = ethers.Signature.from(signature);
        return { r, s, v };
      } else {
        throw new Error(`Personal signature verification failed: expected ${address}, got ${recoveredAddress}`);
      }
    } catch (error) {
      console.error('❌ Both EIP-712 and personal signature verification failed');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Sign inner error:', error);
    
    // Provide helpful error message
    if (error.message?.includes('User rejected') || 
        error.message?.includes('denied') ||
        error.code === 4001) {
      throw new Error('User rejected the signature request');
    }
    
    if (error.message?.includes('chainId') || 
        error.message?.includes('chain') ||
        error.message?.includes('network')) {
      throw new Error(
        'Cross-chain signing failed. Your wallet is blocking signatures with chainId 1337 while connected to Arbitrum. ' +
        'Please try:\n' +
        '1. Using MetaMask with developer mode enabled\n' +
        '2. Switching to a different wallet\n' +
        '3. Using WalletConnect instead of browser extension'
      );
    }
    
    throw error;
  }
}

/**
 * EXACT Python SDK sign_l1_action implementation
 */
export async function signL1Action(wallet, action, vaultAddress, nonce, expiresAfter, isMainnet) {
  console.log('🔐 Starting EXACT Python SDK signing...');
  
  try {
    // Python: hash = action_hash(action, active_pool, nonce, expires_after)
    const hash = actionHash(action, vaultAddress, nonce, expiresAfter);
    
    // Python: phantom_agent = construct_phantom_agent(hash, is_mainnet)
    const phantomAgent = constructPhantomAgent(hash, isMainnet);
    console.log('👻 Phantom agent:', phantomAgent);
    
    // Python: data = l1_payload(phantom_agent)
    const data = l1Payload(phantomAgent, isMainnet);
    console.log('📝 L1 payload:', JSON.stringify(data, null, 2));
    
    // Python: return sign_inner(wallet, data)
    return await signInner(wallet, data);
    
  } catch (error) {
    console.error('❌ L1 action signing error:', error);
    throw error;
  }
}

/**
 * EXACT Python SDK float_to_wire implementation
 * Python: rounded = f"{x:.8f}"
 *         normalized = Decimal(rounded).normalize()
 *         return f"{normalized:f}"
 */
export function floatToWire(x) {
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error(`floatToWire causes rounding: ${x}`);
  }
  
  // Remove trailing zeros exactly like Python's Decimal.normalize()
  let normalized = rounded.replace(/\.?0+$/, '');
  if (normalized === '-0') normalized = '0';
  if (normalized === '') normalized = '0';
  
  return normalized;
}

/**
 * EXACT Python SDK order_type_to_wire
 */
function orderTypeToWire(orderType) {
  if (orderType.limit) {
    return { limit: orderType.limit };
  } else if (orderType.trigger) {
    return {
      trigger: {
        isMarket: orderType.trigger.isMarket,
        triggerPx: floatToWire(orderType.trigger.triggerPx),
        tpsl: orderType.trigger.tpsl,
      },
    };
  }
  throw new Error('Invalid order type: ' + JSON.stringify(orderType));
}

/**
 * EXACT Python SDK order_request_to_order_wire
 */
export function orderToWire(orderParams, assetIndex) {
  const orderWire = {
    a: assetIndex,                           // asset
    b: orderParams.isBuy,                   // is_buy
    p: floatToWire(orderParams.limitPx),    // limit_px
    s: floatToWire(orderParams.sz),         // sz
    r: orderParams.reduceOnly,              // reduce_only
    t: orderTypeToWire(orderParams.orderType), // order_type
  };

  // Only add cloid if present
  if (orderParams.cloid !== undefined && orderParams.cloid !== null) {
    orderWire.c = orderParams.cloid;
  }

  return orderWire;
}

/**
 * EXACT Python SDK order_wires_to_order_action
 */
export function orderWiresToAction(orderWires, grouping = 'na', builder = null) {
  const action = {
    type: 'order',
    orders: orderWires,
    grouping: grouping,
  };

  if (builder) {
    action.builder = builder;
  }

  return action;
}

/**
 * Removed - no longer needed since we bypass wallet restrictions directly
 */
export function resetCrossChainPermission() {
  console.log('🔄 Cross-chain permission system removed - using direct bypass');
}

/**
 * Main place order function using EXACT Python SDK flow
 */
export async function placeOrder(orderParams, signer, isMainnet = true, vaultAddress = null, expiresAfter = null) {
  try {
    console.log('🚀 Starting EXACT Python SDK order placement...');
    
    // Validate parameters
    if (!orderParams.assetIndex && orderParams.assetIndex !== 0) {
      throw new Error('Asset index is required');
    }
    
    if (!orderParams.size || orderParams.size <= 0) {
      throw new Error('Valid size is required');
    }
    
    if (!orderParams.hasOwnProperty('isBuy')) {
      throw new Error('isBuy flag is required');
    }
    
    // Create order request in Python SDK format
    const orderRequest = {
      isBuy: orderParams.isBuy,
      limitPx: orderParams.orderType === 'market' ? 0 : orderParams.price,
      sz: orderParams.size,
      reduceOnly: orderParams.reduceOnly || false,
      orderType: orderParams.orderType === 'market' 
        ? { trigger: { isMarket: true, triggerPx: 0, tpsl: 'tp' } }
        : { limit: { tif: orderParams.timeInForce || 'Gtc' } },
      cloid: orderParams.cloid,
    };
    
    console.log('📋 Order request:', JSON.stringify(orderRequest, null, 2));
    
    // Python: order_wire = order_request_to_order_wire(order, asset)
    const orderWire = orderToWire(orderRequest, orderParams.assetIndex);
    console.log('📦 Order wire:', JSON.stringify(orderWire, null, 2));
    
    // Python: action = order_wires_to_order_action([order_wire], builder)
    const action = orderWiresToAction([orderWire], 'na', orderParams.builder);
    console.log('📋 Action:', JSON.stringify(action, null, 2));
    
    // Python: timestamp = get_timestamp_ms()
    const nonce = Date.now();
    console.log('⏰ Nonce:', nonce);
    
    // Python: signature = sign_l1_action(wallet, action, None, timestamp, expires_after, is_mainnet)
    const signature = await signL1Action(
      signer,
      action,
      vaultAddress,
      nonce,
      expiresAfter,
      isMainnet
    );
    
    console.log('✍️ Final signature:', signature);
    
    // Determine API URL
    const apiUrl = isMainnet 
      ? 'https://api.hyperliquid.xyz/exchange'
      : 'https://api.hyperliquid-testnet.xyz/exchange';
    
    // Prepare request body according to Hyperliquid API documentation
    const requestBody = {
      action,
      nonce,
      signature,
    };
    
    // Add optional fields according to API docs
    if (vaultAddress) {
      requestBody.vaultAddress = vaultAddress.toLowerCase();
    }
    
    if (expiresAfter) {
      requestBody.expiresAfter = expiresAfter;
    }
    
    console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
    console.log('📤 Request URL:', apiUrl);
    console.log('📤 Request method: POST');
    console.log('📤 Request headers:', {
      'Content-Type': 'application/json',
    });
    
    // Make API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
    
    let result;
    const responseText = await response.text();
    console.log('📥 Raw response text:', responseText);
    
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON:', parseError);
      throw new Error(`API returned invalid JSON: ${responseText}`);
    }
    
    console.log('📥 Parsed API Response:', JSON.stringify(result, null, 2));
    
    if (result.status === 'err') {
      throw new Error(result.response || 'API returned error status');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Place order error:', error);
    throw error;
  }
}