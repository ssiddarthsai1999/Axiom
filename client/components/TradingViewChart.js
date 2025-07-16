// components/TradingViewWidget.js
import React, { useEffect, useRef, memo, useState } from 'react';

function TradingViewWidget({ symbol = 'BTCUSD' }) {
  const container = useRef();
  const [isMobile, setIsMobile] = useState(false);

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
    // Clear previous widget when symbol changes
    if (container.current) {
      container.current.innerHTML = '';
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    // Desktop configuration (lg and above) - keep exactly as original
    const desktopConfig = {
      allow_symbol_change: false,
      calendar: false,
      details: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      interval: "5",
      locale: "en",
      save_image: true,
      style: "1",
      symbol: symbol,
      theme: "dark",
      timezone: "Etc/UTC",
      backgroundColor: "#0d0c0e",
      gridColor: "#181a20",
      watchlist: [],
      withdateranges: false,
      compareSymbols: [],
      studies: [
        "Volume@tv-basicstudies-1"
      ],
      autosize: true,
      overrides: {
        "paneProperties.background": "#0d0c0e",
        "paneProperties.backgroundType": "solid",
        "paneProperties.backgroundGradientStartColor": "#0d0c0e",
        "paneProperties.backgroundGradientEndColor": "#0d0c0e",
        "scalesProperties.backgroundColor": "#0d0c0e",
        "paneProperties.horzGridProperties.color": "#2a2a2a",
        "paneProperties.crossHairProperties.color": "#666666",
        "scalesProperties.textColor": "#b3b3b3",
        "scalesProperties.backgroundColor": "#000000",
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
      allow_symbol_change: false,
      calendar: false,
      details: false,
      hide_side_toolbar: true, // Hide side toolbar on mobile
      hide_top_toolbar: false,
      hide_legend: true, // Hide legend on mobile
      hide_volume: true, // Hide volume on mobile
      hotlist: false,
      interval: "5",
      locale: "en",
      save_image: false, // Disable save image on mobile
      style: "1",
      symbol: symbol,
      theme: "dark",
      timezone: "Etc/UTC",
      backgroundColor: "#0d0c0e",
      gridColor: "#181a20",
      watchlist: [],
      withdateranges: false,
      compareSymbols: [],
      studies: [], // No studies on mobile
      autosize: true,
      height: "400", // Fixed height for mobile
      disabled_features: [
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
        "paneProperties.background": "#0d0c0e",
        "paneProperties.backgroundType": "solid",
        "paneProperties.backgroundGradientStartColor": "#0d0c0e",
        "paneProperties.backgroundGradientEndColor": "#0d0c0e",
        "scalesProperties.backgroundColor": "#0d0c0e",
        "paneProperties.horzGridProperties.color": "#2a2a2a",
        "paneProperties.crossHairProperties.color": "#666666",
        "scalesProperties.textColor": "#b3b3b3",
        "scalesProperties.backgroundColor": "#000000",
        "mainSeriesProperties.candleStyle.upColor": "#00ff88",
        "mainSeriesProperties.candleStyle.downColor": "#ff4757",
        "mainSeriesProperties.candleStyle.drawWick": true,
        "mainSeriesProperties.candleStyle.drawBorder": true,
        "mainSeriesProperties.candleStyle.borderColor": "#000000",
        "mainSeriesProperties.candleStyle.borderUpColor": "#00ff88",
        "mainSeriesProperties.candleStyle.borderDownColor": "#ff4757",
        "mainSeriesProperties.candleStyle.wickUpColor": "#00ff88",
        "mainSeriesProperties.candleStyle.wickDownColor": "#ff4757",
        "volumePaneSize": "tiny",
        // Mobile-specific overrides
        "mainSeriesProperties.priceAxisProperties.lockScale": true,
        "scalesProperties.showLeftScale": false,
        "scalesProperties.showRightScale": true,
        "paneProperties.topMargin": 5,
        "paneProperties.bottomMargin": 5,
        "paneProperties.leftAxisProperties.percentage": 10,
        "paneProperties.rightAxisProperties.percentage": 15
      }
    };

    // Use mobile config for mobile, desktop config for lg and above
    const config = isMobile ? mobileConfig : desktopConfig;
    
    script.innerHTML = JSON.stringify(config);

    if (container.current) {
      container.current.appendChild(script);
    }

    // Cleanup function
    return () => {
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol, isMobile]); // Re-run when symbol or mobile state changes

  return (
    <div className="tradingview-widget-container w-full bg-[#0d0c0e]">
      <div
        ref={container}
        className={`tradingview-widget-container__widget w-full bg-[#0d0c0e] ${
          isMobile 
            ? 'h-[400px] min-h-[350px]' // Mobile height
            : 'h-full' // Desktop height (original)
        }`}
      />
    </div>
  );
}

// Only re-render when symbol actually changes
const areEqual = (prevProps, nextProps) => {
  return prevProps.symbol === nextProps.symbol;
};

export default memo(TradingViewWidget, areEqual);