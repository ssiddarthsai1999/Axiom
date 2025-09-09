// utils/hyperLiquidTrading.js - Updated to use new signing service
import { placeOrder } from "./hyperLiquidSigning"

const HYPERLIQUID_MAINNET_URL = 'https://api.hyperliquid.xyz';
const HYPERLIQUID_TESTNET_URL = 'https://api.hyperliquid-testnet.xyz';

class HyperliquidUtils {
  constructor() {
    this.assetCache = new Map();
    this.metaCache = null;
    this.spotMetaCache = null;
  }

  getApiUrl(isMainnet = true) {
    return isMainnet ? HYPERLIQUID_MAINNET_URL : HYPERLIQUID_TESTNET_URL;
  }

  // Fetch meta information
  async getMeta(isMainnet = true) {
    if (this.metaCache) {
      return this.metaCache;
    }

    try {
      const response = await fetch(`${this.getApiUrl(isMainnet)}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });

      if (!response.ok) {
        throw new Error(`Meta fetch failed: ${response.status}`);
      }

      const meta = await response.json();
      this.metaCache = meta;
      return meta;
    } catch (error) {
      console.error('Error fetching meta:', error);
      throw error;
    }
  }

  // Fetch spot meta information
  async getSpotMeta(isMainnet = true) {
    if (this.spotMetaCache) {
      return this.spotMetaCache;
    }

    try {
      const response = await fetch(`${this.getApiUrl(isMainnet)}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spotMeta' }),
      });

      if (!response.ok) {
        throw new Error(`Spot meta fetch failed: ${response.status}`);
      }

      const spotMeta = await response.json();
      this.spotMetaCache = spotMeta;
      return spotMeta;
    } catch (error) {
      console.error('Error fetching spot meta:', error);
      throw error;
    }
  }

  // Get asset information by symbol
  async getAssetInfo(symbol, isMainnet = true) {
    const cacheKey = `${symbol}-${isMainnet}`;
    
    if (this.assetCache.has(cacheKey)) {
      return this.assetCache.get(cacheKey);
    }

    try {
      
      // First try perpetuals
      const meta = await this.getMeta(isMainnet);
      
      if (meta?.universe) {
        const perpAsset = meta.universe.find(asset => asset.name === symbol);
        if (perpAsset) {
          const assetInfo = {
            index: perpAsset.index || meta.universe.indexOf(perpAsset),
            name: perpAsset.name,
            szDecimals: perpAsset.szDecimals !== undefined ? perpAsset.szDecimals : 3,
            isSpot: false,
            maxLeverage: perpAsset.maxLeverage,
          };
          
          this.assetCache.set(cacheKey, assetInfo);
          return assetInfo;
        }
      }

      // Try spot assets
      const spotMeta = await this.getSpotMeta(isMainnet);
      
      if (spotMeta?.universe) {
        const spotAsset = spotMeta.universe.find(asset => {
          // Handle both direct name match and token array format
          if (typeof asset === 'object' && asset.tokens) {
            // Find the token in the tokens array that matches our symbol
            return asset.tokens.some(token => token.name === symbol);
          }
          return asset.name === symbol;
        });

        if (spotAsset) {
          const spotIndex = spotMeta.universe.indexOf(spotAsset);
          const assetInfo = {
            index: 10000 + spotIndex, // Spot assets use 10000 + index
            name: symbol,
            szDecimals: spotAsset.szDecimals !== undefined ? spotAsset.szDecimals : 6,
            isSpot: true,
          };
          
          this.assetCache.set(cacheKey, assetInfo);
          return assetInfo;
        }
      }

      // Asset not found, return fallback
      const fallbackInfo = {
        index: 0,
        name: symbol,
        szDecimals: 3,
        isSpot: false,
      };
      
      this.assetCache.set(cacheKey, fallbackInfo);
      return fallbackInfo;

    } catch (error) {
      console.error(`Error fetching asset info for ${symbol}:`, error);
      
      // Return fallback on error
      const fallbackInfo = {
        index: 0,
        name: symbol,
        szDecimals: 3,
        isSpot: false,
      };
      
      this.assetCache.set(cacheKey, fallbackInfo);
      return fallbackInfo;
    }
  }

  // Get user account state
  async getUserAccountState(address, isMainnet = true) {
    try {
      
      const response = await fetch(`${this.getApiUrl(isMainnet)}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: address,
        }),
      });

      if (!response.ok) {
        throw new Error(`User state fetch failed: ${response.status}`);
      }

      const result = await response.json();
      return result;
      
    } catch (error) {
      console.error('Error fetching user account state:', error);
      throw error;
    }
  }

  // Place order using new signing service
  async placeOrder(orderParams, signer, isMainnet = true, vaultAddress = null) {
    try {
      
      // Validate required parameters
      if (!orderParams.assetIndex && orderParams.assetIndex !== 0) {
        throw new Error('Asset index is required');
      }
      
      if (!orderParams.size || orderParams.size <= 0) {
        throw new Error('Valid size is required');
      }

      // For market orders, set price to 0 and use trigger type
      let finalOrderParams = { ...orderParams };
      
      if (orderParams.orderType === 'market') {
        finalOrderParams.price = 0;
        finalOrderParams.orderType = 'trigger';
        finalOrderParams.triggerType = {
          isMarket: true,
          triggerPx: '0',
          tpsl: 'tp'
        };
      } else {
        // Limit order
        if (!orderParams.price || orderParams.price <= 0) {
          throw new Error('Valid price is required for limit orders');
        }
        finalOrderParams.orderType = 'limit';
        finalOrderParams.timeInForce = orderParams.timeInForce || 'Gtc';
      }

      // Use the new signing service
      const result = await placeOrder(finalOrderParams, signer, isMainnet, vaultAddress);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error placing order:', error);
      throw error;
    }
  }

  // Cancel order using new signing service
  async cancelOrder(assetIndex, orderId, signer, isMainnet = true, vaultAddress = null) {
    try {
      const cancelParams = {
        assetIndex: assetIndex,
        oid: orderId,
      };

      const result = await cancelOrder(cancelParams, signer, isMainnet, vaultAddress);
      return result;
      
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      throw error;
    }
  }

  // Update leverage using new signing service
  async updateLeverage(assetIndex, leverage, isCross, signer, isMainnet = true, vaultAddress = null) {
    try {
      const result = await updateLeverage(assetIndex, leverage, isCross, signer, isMainnet, vaultAddress);
      return result;
      
    } catch (error) {
      console.error('❌ Error updating leverage:', error);
      throw error;
    }
  }

  // Get market data
  async getMarketData(symbol, isMainnet = true) {
    try {
      const response = await fetch(`${this.getApiUrl(isMainnet)}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'allMids',
        }),
      });

      if (!response.ok) {
        throw new Error(`Market data fetch failed: ${response.status}`);
      }

      const allMids = await response.json();
      
      // Find the symbol in the response
      const marketData = allMids.find(mid => mid.coin === symbol);
      
      if (marketData) {
        return {
          symbol: symbol,
          price: parseFloat(marketData.px),
          timestamp: Date.now(),
        };
      }

      throw new Error(`Market data not found for ${symbol}`);
      
    } catch (error) {
      console.error(`Error fetching market data for ${symbol}:`, error);
      throw error;
    }
  }

  // Parse error messages
  parseErrorMessage(result) {
    if (result?.status === 'err') {
      return result.response || 'Unknown error occurred';
    }
    
    if (result?.response?.type === 'error') {
      return result.response.data || 'API error occurred';
    }
    
    if (typeof result === 'string') {
      return result;
    }
    
    return 'Unknown error occurred';
  }

  // Clear caches
  clearCache() {
    this.assetCache.clear();
    this.metaCache = null;
    this.spotMetaCache = null;
  }
}

// Export singleton instance
const hyperliquidUtils = new HyperliquidUtils();
export default hyperliquidUtils;