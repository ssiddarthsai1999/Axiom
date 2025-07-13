// utils/debugHyperliquidSigning.js - Debug version to find signature issues
import { encode } from '@msgpack/msgpack';
import { ethers, getBytes, keccak256 } from 'ethers';

// EXACT domains from Python SDK
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

/**
 * DEBUG: Action hash with extensive logging
 */
function actionHash(action, vaultAddress, nonce, expiresAfter = null) {
  console.log('🔍 === ACTION HASH DEBUG START ===');
  console.log('📋 Input action:', JSON.stringify(action, null, 2));
  console.log('🏦 Vault address:', vaultAddress);
  console.log('⏰ Nonce:', nonce);
  console.log('⏱️ Expires after:', expiresAfter);
  
  // Step 1: Deep clone and normalize
  const normalizedAction = JSON.parse(JSON.stringify(action));
  console.log('📦 After JSON clone:', JSON.stringify(normalizedAction, null, 2));
  
  // Step 2: Normalize trailing zeros and addresses
  const finalAction = normalizeForMsgpack(normalizedAction);
  console.log('📦 After normalization:', JSON.stringify(finalAction, null, 2));
  
  // Step 3: msgpack encode
  const msgPackBytes = encode(finalAction);
  console.log('📦 Msgpack bytes length:', msgPackBytes.length);
  console.log('📦 Msgpack hex (first 50 bytes):', 
    Array.from(msgPackBytes.slice(0, 50))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
  );
  
  // Step 4: Calculate additional bytes
  let additionalBytesLength = 9; // 8 bytes nonce + 1 byte vault flag
  if (vaultAddress !== null) {
    additionalBytesLength += 20;
  }
  if (expiresAfter !== null) {
    additionalBytesLength += 8;
  }
  
  console.log('📏 Additional bytes length:', additionalBytesLength);
  
  // Step 5: Create final data array
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  
  const view = new DataView(data.buffer);
  let offset = msgPackBytes.length;
  
  // Add nonce (8 bytes, big endian)
  view.setBigUint64(offset, BigInt(nonce), false);
  console.log('⏰ Nonce bytes at offset', offset, ':', 
    Array.from(data.slice(offset, offset + 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
  offset += 8;
  
  // Add vault flag
  if (vaultAddress === null) {
    view.setUint8(offset, 0);
    console.log('🏦 Vault flag: 0 (no vault)');
    offset += 1;
  } else {
    view.setUint8(offset, 1);
    offset += 1;
    const cleanAddress = vaultAddress.toLowerCase().replace('0x', '');
    const addressBytes = getBytes('0x' + cleanAddress);
    data.set(addressBytes, offset);
    console.log('🏦 Vault flag: 1, address:', cleanAddress);
    offset += 20;
  }
  
  // Add expires after
  if (expiresAfter !== null) {
    view.setBigUint64(offset, BigInt(expiresAfter), false);
    console.log('⏱️ Expires after bytes:', 
      Array.from(data.slice(offset, offset + 8))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  
  // Final data for hashing
  console.log('📏 Total data length:', data.length);
  console.log('📦 Final data (first 100 bytes):', 
    Array.from(data.slice(0, 100))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
  );
  
  const hash = keccak256(data);
  console.log('🔒 Final action hash:', hash);
  console.log('🔍 === ACTION HASH DEBUG END ===');
  
  return hash;
}

/**
 * DEBUG: Normalize with detailed logging
 */
function normalizeForMsgpack(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => normalizeForMsgpack(item));
  }

  const result = {};
  
  // Process in alphabetical order for consistency
  const sortedKeys = Object.keys(obj).sort();
  console.log('🔤 Processing keys in order:', sortedKeys);
  
  for (const key of sortedKeys) {
    const value = obj[key];
    console.log(`🔑 Processing key "${key}":`, value, typeof value);
    
    if (value && typeof value === 'object') {
      result[key] = normalizeForMsgpack(value);
    } else if ((key === 'p' || key === 's') && typeof value === 'string') {
      const normalized = removeTrailingZeros(value);
      console.log(`💰 Normalized ${key}: "${value}" → "${normalized}"`);
      result[key] = normalized;
    } else if (typeof value === 'string' && value.startsWith('0x')) {
      const lowercased = value.toLowerCase();
      console.log(`🏠 Lowercased address ${key}: "${value}" → "${lowercased}"`);
      result[key] = lowercased;
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * DEBUG: Remove trailing zeros with logging
 */
function removeTrailingZeros(value) {
  if (typeof value !== 'string' || !value.includes('.')) {
    console.log(`🔢 No trailing zeros to remove from: "${value}"`);
    return value;
  }
  
  let normalized = value.replace(/\.?0+$/, '');
  if (normalized === '-0') normalized = '0';
  if (normalized === '') normalized = '0';
  
  console.log(`✂️ Removed trailing zeros: "${value}" → "${normalized}"`);
  return normalized;
}

/**
 * DEBUG: Float to wire with logging
 */
export function floatToWire(x) {
  console.log(`🔢 Converting float to wire: ${x}`);
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error(`floatToWire causes rounding: ${x}`);
  }
  const result = removeTrailingZeros(rounded);
  console.log(`🔢 Float to wire result: ${x} → "${result}"`);
  return result;
}

/**
 * DEBUG: Phantom agent construction
 */
function constructPhantomAgent(hash, isMainnet) {
  const agent = {
    source: isMainnet ? 'a' : 'b',
    connectionId: hash,
  };
  console.log('👻 Phantom agent created:', agent);
  return agent;
}

/**
 * DEBUG: Enhanced signing with signature verification
 */
export async function signL1Action(wallet, action, vaultAddress, nonce, expiresAfter, isMainnet) {
  console.log('🔐 === SIGNING DEBUG START ===');
  console.log('👤 Wallet address:', await wallet.getAddress());
  
  try {
    // Create action hash
    const hash = actionHash(action, vaultAddress, nonce, expiresAfter);
    
    // Create phantom agent
    const phantomAgent = constructPhantomAgent(hash, isMainnet);
    
    // Create typed data
    const typedData = {
      domain: PHANTOM_DOMAIN,
      types: AGENT_TYPES,
      primaryType: 'Agent',
      message: phantomAgent,
    };
    
    console.log('📝 Typed data for signing:', JSON.stringify(typedData, null, 2));
    
    // Create manual EIP-712 hash for verification
    const domainSeparator = ethers.TypedDataEncoder.hashDomain(typedData.domain);
    const structHash = ethers.TypedDataEncoder.hashStruct(
      typedData.primaryType,
      typedData.types,
      typedData.message
    );
    const digest = ethers.keccak256(ethers.concat(['0x1901', domainSeparator, structHash]));
    
    console.log('🔒 Domain separator:', domainSeparator);
    console.log('🔒 Struct hash:', structHash);
    console.log('🔒 Final digest:', digest);
    
    // Try signing methods
    let signature;
    let signingMethod = 'unknown';
    
    try {
      // Method 1: Normal signing
      signature = await wallet.signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );
      signingMethod = 'normal';
      console.log('✅ Normal signing succeeded');
    } catch (error) {
      console.log('⚠️ Normal signing failed:', error.message);
      
      if (error.message?.includes('chainId')) {
        try {
          // Method 2: Get private key and create standalone wallet
          let privateKey;
          
          if (wallet.privateKey) {
            privateKey = wallet.privateKey;
          } else if (wallet._signingKey?.privateKey) {
            privateKey = wallet._signingKey.privateKey;
          } else {
            throw new Error('Cannot access private key');
          }
          
          const standAloneWallet = new ethers.Wallet(privateKey);
          signature = await standAloneWallet.signTypedData(
            typedData.domain,
            typedData.types,
            typedData.message
          );
          signingMethod = 'standalone';
          console.log('✅ Standalone wallet signing succeeded');
        } catch (standaloneError) {
          console.log('⚠️ Standalone signing failed:', standaloneError.message);
          
          // Method 3: Manual digest signing
          signature = await wallet.signMessage(ethers.getBytes(digest));
          signingMethod = 'manual_digest';
          console.log('✅ Manual digest signing succeeded');
        }
      } else {
        throw error;
      }
    }
    
    console.log(`✍️ Signature (${signingMethod}):`, signature);
    
    // Verify signature recovery
    const { r, s, v } = ethers.Signature.from(signature);
    const splitSig = { r, s, v };
    
    console.log('🔓 Split signature:', splitSig);
    
    // Test signature recovery
    try {
      let recoveredAddress;
      
      if (signingMethod === 'manual_digest') {
        // For manual digest, recover from message
        recoveredAddress = ethers.verifyMessage(ethers.getBytes(digest), signature);
      } else {
        // For typed data, recover using TypedDataEncoder
        recoveredAddress = ethers.verifyTypedData(
          typedData.domain,
          typedData.types,
          typedData.message,
          signature
        );
      }
      
      const expectedAddress = await wallet.getAddress();
      console.log('🔍 Expected address:', expectedAddress.toLowerCase());
      console.log('🔍 Recovered address:', recoveredAddress.toLowerCase());
      console.log('✅ Address match:', expectedAddress.toLowerCase() === recoveredAddress.toLowerCase());
      
      if (expectedAddress.toLowerCase() !== recoveredAddress.toLowerCase()) {
        console.error('❌ SIGNATURE VERIFICATION FAILED!');
        console.error('This signature will be rejected by Hyperliquid');
        throw new Error(`Signature verification failed: expected ${expectedAddress}, got ${recoveredAddress}`);
      }
      
    } catch (verifyError) {
      console.error('❌ Signature verification error:', verifyError);
      throw verifyError;
    }
    
    console.log('🔐 === SIGNING DEBUG END ===');
    return splitSig;
    
  } catch (error) {
    console.error('❌ Signing error:', error);
    throw error;
  }
}

/**
 * DEBUG: Order to wire with validation
 */
export function orderToWire(orderParams, assetIndex) {
  console.log('🔄 === ORDER TO WIRE DEBUG START ===');
  console.log('📋 Input order params:', JSON.stringify(orderParams, null, 2));
  console.log('🎯 Asset index:', assetIndex);
  
  const orderWire = {
    a: assetIndex,
    b: orderParams.isBuy,
    p: typeof orderParams.limitPx === 'string' 
      ? removeTrailingZeros(orderParams.limitPx)
      : floatToWire(orderParams.limitPx),
    s: typeof orderParams.sz === 'string'
      ? removeTrailingZeros(orderParams.sz)
      : floatToWire(orderParams.sz),
    r: orderParams.reduceOnly || false,
    t: orderTypeToWire(orderParams.orderType),
  };

  if (orderParams.cloid !== undefined && orderParams.cloid !== null) {
    orderWire.c = orderParams.cloid;
  }

  console.log('📦 Final order wire:', JSON.stringify(orderWire, null, 2));
  console.log('🔄 === ORDER TO WIRE DEBUG END ===');
  return orderWire;
}

/**
 * DEBUG: Order type conversion
 */
function orderTypeToWire(orderType) {
  console.log('🔄 Converting order type:', orderType);
  
  if (typeof orderType === 'string') {
    if (orderType === 'limit') {
      const result = { limit: { tif: 'Gtc' } };
      console.log('📝 Limit order type:', result);
      return result;
    } else if (orderType === 'market') {
      const result = { trigger: { isMarket: true, triggerPx: '0', tpsl: 'tp' } };
      console.log('📝 Market order type:', result);
      return result;
    }
  }
  
  if (orderType && orderType.limit) {
    console.log('📝 Object limit order type:', orderType);
    return { limit: orderType.limit };
  } else if (orderType && orderType.trigger) {
    const result = {
      trigger: {
        isMarket: orderType.trigger.isMarket,
        triggerPx: floatToWire(Number(orderType.trigger.triggerPx)),
        tpsl: orderType.trigger.tpsl,
      },
    };
    console.log('📝 Object trigger order type:', result);
    return result;
  }
  
  throw new Error('Invalid order type: ' + JSON.stringify(orderType));
}

/**
 * DEBUG: Order wires to action
 */
export function orderWiresToAction(orderWires, grouping = 'na', builder = null) {
  console.log('🔄 === ORDER WIRES TO ACTION DEBUG START ===');
  console.log('📦 Order wires:', JSON.stringify(orderWires, null, 2));
  console.log('👥 Grouping:', grouping);
  console.log('🏗️ Builder:', builder);
  
  const action = {
    type: 'order',
    orders: orderWires,
    grouping: grouping,
  };

  if (builder) {
    action.builder = {
      b: builder.address.toLowerCase(),
      f: builder.fee,
    };
  }

  console.log('📋 Final action:', JSON.stringify(action, null, 2));
  console.log('🔄 === ORDER WIRES TO ACTION DEBUG END ===');
  return action;
}

/**
 * DEBUG: Main place order function
 */
export async function placeOrder(orderParams, signer, isMainnet = true, vaultAddress = null, expiresAfter = null) {
  console.log('🚀 === PLACE ORDER DEBUG START ===');
  console.log('📋 Order params:', JSON.stringify(orderParams, null, 2));
  console.log('🌐 Is mainnet:', isMainnet);
  console.log('🏦 Vault address:', vaultAddress);
  console.log('⏱️ Expires after:', expiresAfter);
  
  try {
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
    
    // Prepare final order params
    let finalOrderParams = { ...orderParams };
    
    if (orderParams.orderType === 'market') {
      finalOrderParams.limitPx = 0;
      finalOrderParams.sz = orderParams.size;
      finalOrderParams.orderType = 'market';
    } else {
      if (!orderParams.price || orderParams.price <= 0) {
        throw new Error('Valid price is required for limit orders');
      }
      finalOrderParams.limitPx = orderParams.price;
      finalOrderParams.sz = orderParams.size;
      finalOrderParams.orderType = 'limit';
    }
    
    console.log('📋 Final order params:', JSON.stringify(finalOrderParams, null, 2));
    
    // Create order wire
    const orderWire = orderToWire(finalOrderParams, orderParams.assetIndex);
    
    // Create action
    const action = orderWiresToAction([orderWire], 'na', orderParams.builder);
    
    // Get timestamp
    const nonce = Date.now();
    console.log('⏰ Using nonce:', nonce);
    
    // Sign the action
    const signature = await signL1Action(
      signer,
      action,
      vaultAddress,
      nonce,
      expiresAfter,
      isMainnet
    );
    
    // Prepare request body
    const requestBody = {
      action,
      nonce,
      signature,
    };
    
    if (vaultAddress) {
      requestBody.vaultAddress = vaultAddress.toLowerCase();
    }
    
    if (expiresAfter) {
      requestBody.expiresAfter = expiresAfter;
    }
    
    console.log('📤 Final request body:', JSON.stringify(requestBody, null, 2));
    
    // Make API call
    const apiUrl = isMainnet 
      ? 'https://api.hyperliquid.xyz/exchange'
      : 'https://api.hyperliquid-testnet.xyz/exchange';
      
    console.log('🌐 Making request to:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const result = await response.json();
    console.log('📥 API Response:', JSON.stringify(result, null, 2));
    console.log('🚀 === PLACE ORDER DEBUG END ===');
    
    return result;
    
  } catch (error) {
    console.error('❌ Place order error:', error);
    console.log('🚀 === PLACE ORDER DEBUG END (ERROR) ===');
    throw error;
  }
}