// HyperLiquid Datafeed Implementation for TradingView
// Based on TradingView's UDF-compatible datafeed structure

import WebSocketService from '../hooks/WebsocketService.js';
// import { globalCleanup } from './hyperliquid-cleanup.js';

// Configuration for HyperLiquid datafeed
const configurationData = {
    exchanges: [
        {
            value: 'HyperLiquid',
            name: 'HyperLiquid',
            desc: 'HyperLiquid Perpetuals Exchange'
        }
    ],
    supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    supports_search: true,
    supports_group_request: false
};

// Cache for last bars to enable real-time updates
const lastBarsCache = new Map();

// Track active subscriptions for proper cleanup
const activeSubscriptions = new Map(); // Map<subscriberUID, {symbol, interval, callback}>

// Get WebSocket service instance
const wsService = WebSocketService.getInstance();

/**
 * Convert TradingView resolution to HyperLiquid interval
 * @param {string} resolution - TradingView resolution (1, 5, 15, etc.)
 * @returns {string} HyperLiquid interval
 */
function resolutionToInterval(resolution) {
    const intervalMap = {
        '1': '1m',
        '5': '5m', 
        '15': '15m',
        '30': '30m',
        '60': '1h',
        '240': '4h',
        '1D': '1d',
        '1W': '1w',
        '1M': '1M'
    };
    return intervalMap[resolution] || '1m';
}

function getPriceScaleFromPrice(price) {
    const str = price.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1].length;
      return Math.pow(10, decimals);
    }
    return 1; // no decimals
  }

/**
 * Fetch historical candle data from HyperLiquid API
 * @param {string} coin - Coin symbol
 * @param {string} interval - Time interval
 * @param {number} startTime - Start timestamp (seconds)
 * @param {number} endTime - End timestamp (seconds)
 * @returns {Promise<Array>} Array of candle data
 */
async function fetchHistoricalData(coin, interval, startTime, endTime) {
    try {

        const response = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'candleSnapshot',
                req: {
                    coin: coin,
                    interval: interval,
                    startTime: startTime * 1000, // Convert to milliseconds
                    endTime: endTime * 1000     // Convert to milliseconds
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        return data || [];
    } catch (error) {
        console.error('Error fetching historical data:', error);
        throw error;
    }
}

// /**
//  * Get available symbols from HyperLiquid
//  * @returns {Promise<Array>} Array of available symbols
//  */
// async function getAvailableSymbols() {
//     try {
//         const response = await fetch('https://api.hyperliquid.xyz/info', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 type: 'metaAndAssetCtxs'
//             })
//         });

//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }

//         const [meta] = await response.json();
//         return meta.universe.map(asset => ({
//             symbol: asset.name,
//             full_name: asset.name,
//             description: `${asset.name} Perpetual`,
//             exchange: 'HyperLiquid',
//             type: 'crypto',
//             session: '24x7',
//             timezone: 'Etc/UTC',
//             minmov: 1,
//             pricescale: 100,
//             has_intraday: true,
//             has_no_volume: false,
//             has_weekly_and_monthly: true,
//             supported_resolutions: configurationData.supported_resolutions,
//             volume_precision: 2,
//             data_status: 'streaming'
//         }));
//     } catch (error) {
//         console.error('Error fetching available symbols:', error);
//         return [];
//     }
// }

// Main datafeed object
const datafeed = {
  // Expose activeSubscriptions for manual cleanup
  activeSubscriptions: activeSubscriptions,
  onReady: (callback) => {
    setTimeout(() => callback(configurationData), 0);
  },

    // searchSymbols: async (userInput, exchange, symbolType, onResult) => {

    //     try {
    //         const symbols = await getAvailableSymbols();
    //         const filteredSymbols = symbols.filter(symbol => 
    //             symbol.symbol.toLowerCase().includes(userInput.toLowerCase())
    //         );
            
    //         onResult(filteredSymbols.slice(0, 30)); // Limit to 30 results
    //     } catch (error) {
    //         console.error('[searchSymbols]: Error', error);
    //         onResult([]);
    //     }
    // },

  resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
        // Get a sample price to determine the correct pricescale
        let pricescale = 100; // default
        try {
            // Fetch a small amount of historical data to get a sample price
            const sampleData = await fetchHistoricalData(symbolName, '1m', Math.floor(Date.now() / 1000) - 3600, Math.floor(Date.now() / 1000));
            if (sampleData && sampleData.length > 0) {
                const samplePrice = parseFloat(sampleData[0].c);
                pricescale = getPriceScaleFromPrice(samplePrice);
            }
        } catch (error) {
            console.log('Could not fetch sample data for pricescale, using default:', error);
        }

        const symbolInfo = {
            ticker: symbolName,
            name: symbolName,
            description: `${symbolName} on medusa.trade`,
            type: 'crypto',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: 'medusa.trade',
            minmov: 1,
            pricescale: pricescale,
            has_intraday: true,
            has_no_volume: false,
            has_weekly_and_monthly: true,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming'
        };

        setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
    },

  getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
    const { from, to, firstDataRequest } = periodParams;
        const interval = resolutionToInterval(resolution);
        try {
            const data = await fetchHistoricalData(symbolInfo.name, interval, from, to);

            if (!data || data.length === 0) {
                onHistoryCallback([], { noData: true });
                return;
            }
            let bars = [];
            data.forEach((bar, index) => {
                // Map HyperLiquid field names to TradingView format
                const mappedBar = {
                    time: bar.t,           // t -> time (already in milliseconds)
                    open: parseFloat(bar.o), // o -> open
                    high: parseFloat(bar.h), // h -> high
                    low: parseFloat(bar.l),  // l -> low
                    close: parseFloat(bar.c), // c -> close
                    volume: parseFloat(bar.v) || 0 // v -> volume
                };

                // Convert from/to to milliseconds for comparison
                if (mappedBar.time >= from * 1000 && mappedBar.time < to * 1000) {
                    bars.push(mappedBar);
                }
            });

            // Cache the last bar for real-time updates
            if (firstDataRequest && bars.length > 0) {
                lastBarsCache.set(symbolInfo.full_name || symbolInfo.name, {
                    ...bars[bars.length - 1]
                });
            }

            onHistoryCallback(bars, { noData: false });
        } catch (error) {
            console.log('[getBars]: Get error', error);
            onErrorCallback(error);
        }
    },

  subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) => {
        const interval = resolutionToInterval(resolution);

        // Create callback wrapper for cleanup
        const callbackWrapper = (bar) => {
            // Update the last bar cache
            lastBarsCache.set(symbolInfo.full_name || symbolInfo.name, bar);
            // Call the real-time callback
            onRealtimeCallback(bar);
        };

        // Subscribe to candle data using WebSocketService
        const success = wsService.subscribeToCandle(symbolInfo.name, interval, callbackWrapper);

        if (success) {
            // Track this subscription for proper cleanup
            activeSubscriptions.set(subscriberUID, {
                symbol: symbolInfo.name,
                interval: interval,
                callback: callbackWrapper
            });
        } else {
            console.error('[subscribeBars]: Failed to subscribe to candle data');
        }
    },

    unsubscribeBars: (subscriberUID) => {
        
        // Get subscription info from our tracking
        const subscription = activeSubscriptions.get(subscriberUID);
        if (subscription) {
            const { symbol, interval, callback } = subscription;
            
            // Unsubscribe from WebSocket service
            const success = wsService.unsubscribeFromCandle(symbol, interval, callback);

            // Remove from our tracking
            activeSubscriptions.delete(subscriberUID);
        } else {
            console.warn(`📡 [unsubscribeBars]: No active subscription found for UID: ${subscriberUID}`);
        }
    },

    getServerTime: (callback) => {
        // Return current time in seconds
        callback(Math.floor(Date.now() / 1000));
    }
};

export default datafeed;
