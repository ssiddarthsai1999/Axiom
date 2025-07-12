// utils/hyperliquidSigning.js - EXACT COPY FROM OFFICIAL SDK
import { encode } from '@msgpack/msgpack';
import { ethers } from 'ethers';

const phantomDomain = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const agentTypes = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

export function orderTypeToWire(orderType) {
  if (orderType.limit) {
    return { limit: orderType.limit };
  } else if (orderType.trigger) {
    return {
      trigger: {
        isMarket: orderType.trigger.isMarket,
        triggerPx: floatToWire(Number(orderType.trigger.triggerPx)),
        tpsl: orderType.trigger.tpsl,
      },
    };
  }
  throw new Error('Invalid order type');
}

function addressToBytes(address) {
  return ethers.getBytes(address);
}

function actionHash(action, vaultAddress, nonce) {
  // Normalize the action to remove trailing zeros from price and size fields
  const normalizedAction = normalizeTrailingZeros(action);

  const msgPackBytes = encode(normalizedAction);
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(addressToBytes(vaultAddress), msgPackBytes.length + 9);
  }
  return ethers.keccak256(data);
}

function constructPhantomAgent(hash, isMainnet) {
  return { source: isMainnet ? 'a' : 'b', connectionId: hash };
}

export async function signL1Action(
  wallet,
  action,
  activePool,
  nonce,
  isMainnet
) {
  // actionHash already normalizes the action
  const hash = actionHash(action, activePool, nonce);
  const phantomAgent = constructPhantomAgent(hash, isMainnet);
  const data = {
    domain: phantomDomain,
    types: agentTypes,
    primaryType: 'Agent',
    message: phantomAgent,
  };
  return signInner(wallet, data);
}

export async function signUserSignedAction(
  wallet,
  action,
  payloadTypes,
  primaryType,
  isMainnet
) {
  const data = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: isMainnet ? 42161 : 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      [primaryType]: payloadTypes, // Do not add user field here
    },
    primaryType: primaryType,
    message: action,
  };

  return signInner(wallet, data);
}

export async function signUsdTransferAction(
  wallet,
  action,
  isMainnet
) {
  return signUserSignedAction(
    wallet,
    action,
    [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'destination', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'time', type: 'uint64' },
    ],
    'HyperliquidTransaction:UsdSend',
    isMainnet
  );
}

export async function signWithdrawFromBridgeAction(
  wallet,
  action,
  isMainnet
) {
  return signUserSignedAction(
    wallet,
    action,
    [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'destination', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'time', type: 'uint64' },
    ],
    'HyperliquidTransaction:Withdraw',
    isMainnet
  );
}

export async function signAgent(
  wallet,
  action,
  isMainnet
) {
  return signUserSignedAction(
    wallet,
    action,
    [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'agentAddress', type: 'address' },
      { name: 'agentName', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
    'HyperliquidTransaction:ApproveAgent',
    isMainnet
  );
}

async function signInner(wallet, data) {
  try {
    const signature = await wallet.signTypedData(data.domain, data.types, data.message);
    return splitSig(signature);
  } catch (error) {
    console.warn('⚠️ Primary signing method failed, trying alternatives...', error.message);
    
    // Try alternative signing methods for MetaMask compatibility
    try {
      // Method 1: Try with provider.send directly
      if (wallet.provider && wallet.provider.send) {
        console.log('🔄 Trying provider.send method...');
        const accounts = await wallet.provider.send('eth_accounts', []);
        const result = await wallet.provider.send('eth_signTypedData_v4', [
          accounts[0],
          JSON.stringify({
            types: data.types,
            domain: data.domain,
            primaryType: data.primaryType,
            message: data.message
          })
        ]);
        return splitSig(result);
      }
    } catch (providerError) {
      console.warn('⚠️ Provider.send method failed:', providerError.message);
    }

    try {
      // Method 2: Try legacy _signTypedData
      console.log('🔄 Trying legacy _signTypedData method...');
      const signature = await wallet._signTypedData(data.domain, data.types, data.message);
      return splitSig(signature);
    } catch (legacyError) {
      console.warn('⚠️ Legacy signing failed:', legacyError.message);
    }

    // If all methods fail, throw a helpful error
    throw new Error(
      'MetaMask signing failed. Please try:\n' +
      '1. Update MetaMask to the latest version\n' +
      '2. Refresh the page and try again\n' +
      '3. Use Coinbase Wallet or another wallet\n' +
      '4. Create an API agent on Hyperliquid for trading'
    );
  }
}

function splitSig(sig) {
  const { r, s, v } = ethers.Signature.from(sig);
  return { r, s, v };
}

export function floatToWire(x) {
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error(`floatToWire causes rounding: ${x}`);
  }
  let normalized = rounded.replace(/\.?0+$/, '');
  if (normalized === '-0') normalized = '0';
  return normalized;
}

/**
 * Removes trailing zeros from a string representation of a number.
 * This is useful when working with price and size fields directly.
 *
 * Hyperliquid API requires that price ('p') and size ('s') fields do not contain trailing zeros.
 * For example, "12345.0" should be "12345" and "0.123450" should be "0.12345".
 * This function ensures that all numeric string values are properly formatted.
 *
 * @param {string} value - The string value to normalize
 * @returns {string} The normalized string without trailing zeros
 */
export function removeTrailingZeros(value) {
  if (!value.includes('.')) return value;

  const normalized = value.replace(/\.?0+$/, '');
  if (normalized === '-0') return '0';
  return normalized;
}

export function floatToIntForHashing(x) {
  return floatToInt(x, 8);
}

export function floatToUsdInt(x) {
  return floatToInt(x, 6);
}

function floatToInt(x, power) {
  const withDecimals = x * Math.pow(10, power);
  if (Math.abs(Math.round(withDecimals) - withDecimals) >= 1e-3) {
    throw new Error(`floatToInt causes rounding: ${x}`);
  }
  return Math.round(withDecimals);
}

export function getTimestampMs() {
  return Date.now();
}

export function orderToWire(order, asset) {
  const orderWire = {
    a: asset,
    b: order.is_buy,
    p:
      typeof order.limit_px === 'string'
        ? removeTrailingZeros(order.limit_px)
        : floatToWire(order.limit_px),
    s: typeof order.sz === 'string' ? removeTrailingZeros(order.sz) : floatToWire(order.sz),
    r: order.reduce_only,
    t: orderTypeToWire(order.order_type),
  };
  if (order.cloid !== undefined) {
    orderWire.c = order.cloid;
  }
  return orderWire;
}

export function orderWireToAction(
  orders,
  grouping = 'na',
  builder
) {
  return {
    type: 'order',
    orders: orders,
    grouping: grouping,
    ...(builder !== undefined
      ? {
          builder: {
            b: builder.address.toLowerCase(),
            f: builder.fee,
          },
        }
      : {}),
  };
}

/**
 * Normalizes an object by removing trailing zeros from price ('p') and size ('s') fields.
 * This is useful when working with actions that contain these fields.
 *
 * Hyperliquid API requires that price ('p') and size ('s') fields do not contain trailing zeros.
 * This function recursively processes an object and its nested properties to ensure all
 * price and size fields are properly formatted according to API requirements.
 *
 * This helps prevent the "L1 error: User or API Wallet 0x... does not exist" error
 * that can occur when trailing zeros are present in these fields.
 *
 * @param {any} obj - The object to normalize
 * @returns {any} A new object with normalized price and size fields
 */
export function normalizeTrailingZeros(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeTrailingZeros(item));
  }

  // Process object properties
  const result = { ...obj };

  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const value = result[key];

      // Recursively process nested objects
      if (value && typeof value === 'object') {
        result[key] = normalizeTrailingZeros(value);
      }
      // Handle price and size fields
      else if ((key === 'p' || key === 's') && typeof value === 'string') {
        result[key] = removeTrailingZeros(value);
      }
    }
  }

  return result;
}

export function cancelOrderToAction(cancelRequest) {
  return {
    type: 'cancel',
    cancels: [cancelRequest],
  };
}