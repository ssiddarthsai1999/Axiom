// components/TradingViewChartHyperLiquid.js - Custom HyperLiquid datafeed implementation
import React, { useEffect, useRef, useState, useCallback } from 'react';
import hyperliquidDatafeed from '../datafeeds/hyperliquid-datafeed.js';
import WebSocketService from '../hooks/WebsocketService.js';
import numeral from "numeral";

function formatPrice(num) {
  const number = Number(num);
  if (isNaN(number)) return "";
  if (Number.isInteger(number)) {
    return numeral(number).format("0,0");
  }

  const parts = num.toString().split(".");
  const decimalPlaces = parts[1]?.length || 0;

  return numeral(number).format(`0,0.${"0".repeat(decimalPlaces)}`);
}


function TradingViewChartHyperLiquid({ symbol = 'BTC' }) {
  // console.log('TradingViewChartHyperLiquid ++++++++++++++++++++++++++++++++++++', symbol);
  const container = useRef();
  const tvWidget = useRef();
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [error, setError] = useState(null);
  const [containerElement, setContainerElement] = useState(null);



  // Callback ref to capture the container element
  const containerRef = useCallback((element) => {
    if (element !== container.current) {
      container.current = element;
      setContainerElement(element);
    }
  }, []);

  // Check if device is mobile (below lg breakpoint)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint is 1024px
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    
    // Only proceed if we have a container element
    if (!containerElement) {
      return;
    }


    // Clear previous widget when symbol changes
    if (container.current) {
      container.current.innerHTML = '';
    }
    
    // Clean up previous widget if it exists
    if (tvWidget.current) {
      // Manually unsubscribe from all active subscriptions before removing the widget
      // This ensures proper cleanup of WebSocket subscriptions
      if (hyperliquidDatafeed && hyperliquidDatafeed.unsubscribeBars) {
        // Get all active subscriptions and unsubscribe from them
        const activeSubscriptions = Array.from(hyperliquidDatafeed.activeSubscriptions?.keys() || []);
        activeSubscriptions.forEach(subscriberUID => {
          const subscription = hyperliquidDatafeed.activeSubscriptions.get(subscriberUID);
          if (subscription) {
            const { symbol, interval } = subscription;
            // Use force unsubscribe to ensure WebSocket cleanup
            const wsService = WebSocketService.getInstance();
            wsService.forceUnsubscribeFromCandle(symbol, interval);
          }
          hyperliquidDatafeed.unsubscribeBars(subscriberUID);
        });
      }
      
      tvWidget.current.remove();
      tvWidget.current = null;
    }

    setIsLoading(true);
    setError(null);

    // Load TradingView library dynamically
    const loadTradingViewWidget = async () => {
      try {
        // Check if TradingView is already loaded
        if (window.TradingView && window.TradingView.widget) {
          createWidget();
          return;
        }

        // Load the TradingView library script
        const script = document.createElement('script');
        script.src = '/charting_library-master/charting_library/charting_library.js';
        script.async = true;
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        // Wait for the widget to be available
        await new Promise((resolve) => {
          const checkWidget = () => {
            if (window.TradingView && window.TradingView.widget) {
              resolve();
            } else {
              setTimeout(checkWidget, 100);
            }
          };
          checkWidget();
        });

        // Add a small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if datafeed is properly loaded
        if (!hyperliquidDatafeed) {
          setError('HyperLiquid datafeed not loaded. Please try again.');
          setIsLoading(false);
          return;
        }

        createWidget();

      } catch (error) {
        console.error('Error loading TradingView widget:', error);
        setError('Failed to load TradingView chart. Please try again.');
        setIsLoading(false);
      }
    };

    const createWidget = () => {
      try {
        // Check if container element exists
        if (!container.current) {
          console.error('Container element not found');
          setError('Container element not found. Please try again.');
          setIsLoading(false);
          return;
        }


        // Desktop configuration (lg and above)
        const desktopConfig = {
          symbol: symbol,
          datafeed: hyperliquidDatafeed,
          interval: "240",
          container: container.current,
          library_path: "/charting_library-master/charting_library/",
          locale: "en",
          theme: "dark",
          allow_symbol_change: false,
          gridColor: "rgba(242, 242, 242, 0.06)",
          backgroundColor: "#0F0F0F",
          disabled_features: [
            "use_localstorage_for_settings",
            "volume_force_overlay",
            "create_volume_indicator_by_default",
            "header_symbol_search",
            "header_compare",
            "search_symbol_enabled",
          ],
          enabled_features: [
            "side_toolbar_in_fullscreen_mode",
            "header_in_fullscreen_mode"
          ],
          custom_formatters: {
            priceFormatter: formatPrice,   // for y-axis + tooltips
          },
          charts_storage_url: "https://saveload.tradingview.com",
          charts_storage_api_version: "1.1",
          client_id: "tradingview.com",
          user_id: "public_user_id",
          fullscreen: false,
          autosize: true,
          studies_overrides: {
            "volume.volume.color.0": "#00ff88",
            "volume.volume.color.1": "#ff4757",
            "volume.volume.transparency": 70,
            // "volume.pma.color": "#2196F3",
            // "volume.pma.transparency": 30,
            // "volume.pma.linewidth": 1,
            // "volume.sma.color": "#FF6D00",
            // "volume.sma.transparency": 30,
            // "volume.sma.linewidth": 1,
            // "volume.ema.color": "#9C27B0",
            // "volume.ema.transparency": 30,
            // "volume.ema.linewidth": 1,
            // "volume.wma.color": "#E91E63",
            // "volume.wma.transparency": 30,
            // "volume.wma.linewidth": 1,
            // "volume.volume ma.color": "#673AB7",
            // "volume.volume ma.transparency": 30,
            // "volume.volume ma.linewidth": 1
          },
          studies: ["Volume"],
          overrides: {
            "paneProperties.background": "#0d0c0e",
            "paneProperties.backgroundType": "solid",
            "paneProperties.backgroundGradientStartColor": "#0d0c0e",
            "paneProperties.backgroundGradientEndColor": "#0d0c0e",
            // "scalesProperties.backgroundColor": "#0d0c0e",
            "paneProperties.horzGridProperties.color": "#2a2a2a",
            "paneProperties.crossHairProperties.color": "#666666",
            "scalesProperties.textColor": "#b3b3b3",
            // "scalesProperties.backgroundColor": "#000000",
            "mainSeriesProperties.candleStyle.upColor": "#00ff88",
            "mainSeriesProperties.candleStyle.downColor": "#ff4757",
            "mainSeriesProperties.candleStyle.drawWick": true,
            "mainSeriesProperties.candleStyle.drawBorder": true,
            "mainSeriesProperties.candleStyle.borderColor": "#000000",
            "mainSeriesProperties.candleStyle.borderUpColor": "#00ff88",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ff4757",
            "mainSeriesProperties.candleStyle.wickUpColor": "#00ff88",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ff4757",
            "volumePaneSize": "medium"
          }
        };

        // Mobile configuration (below lg) - optimized for mobile
        const mobileConfig = {
          ...desktopConfig,
          disabled_features: [
            ...desktopConfig.disabled_features,
            "header_symbol_search",
            "header_screenshot",
            "header_chart_type",
            "header_compare",
            "header_undo_redo",
            "header_fullscreen_button",
            "context_menus",
            "left_toolbar",
            "control_bar",
            "timeframes_toolbar"
          ],
          overrides: {
            ...desktopConfig.overrides,
            "mainSeriesProperties.priceAxisProperties.lockScale": true,
            "scalesProperties.showLeftScale": false,
            "scalesProperties.showRightScale": true,
            "paneProperties.topMargin": 5,
            "paneProperties.bottomMargin": 5,
            "paneProperties.leftAxisProperties.percentage": 10,
            "paneProperties.rightAxisProperties.percentage": 15,
            "volumePaneSize": "tiny"
          }
        };

        // Use mobile config for mobile, desktop config for lg and above
        const config = isMobile ? mobileConfig : desktopConfig;
        
        
        // Create TradingView widget
        tvWidget.current = new window.TradingView.widget(config);
        
        // Set up ready callback
        tvWidget.current.onChartReady(() => {
          setIsLoading(false);
            // Add volume study
          tvWidget.current.chart().createStudy('Volume', false, false, []);
        });

      } catch (error) {
        console.error('Error creating TradingView widget:', error);
        setError('Failed to create TradingView chart. Please try again.');
        setIsLoading(false);
      }
    };

    loadTradingViewWidget();

    // Cleanup function
    return () => {
      if (tvWidget.current) {
        tvWidget.current.remove();
        tvWidget.current = null;
      }
      // WebSocket connections are now managed by WebSocketService
    };
  }, [symbol, isMobile, containerElement]); // Re-run when symbol, mobile state, or container element changes

  if (error) {
    console.log('❌ Rendering error state:', error);
    return (
      <div className="tradingview-widget-container w-full bg-[#0d0c0e] flex items-center justify-center h-[515px]">
        <div className="text-center text-red-400">
          <p className="text-lg font-semibold mb-2">Chart Error</p>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="tradingview-widget-container w-full bg-[#0d0c0e] relative">
      <div
        ref={containerRef}
        className={`tradingview-widget-container__widget w-full bg-[#0d0c0e] ${
          isMobile 
            ? 'h-[400px] min-h-[350px]' // Mobile height
            : 'h-[515px]' // Desktop height (original)
        }`}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-[#0d0c0e] flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
            {/* <p className="text-lg font-semibold">Loading HyperLiquid Chart...</p> */}
            <p className="text-sm">
              {/* {!containerElement ? 'Initializing container...' : 'Connecting to real-time data'} */}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Temporarily remove memoization to debug the issue
export default TradingViewChartHyperLiquid;
