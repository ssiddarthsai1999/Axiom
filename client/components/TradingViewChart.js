// components/TradingViewWidget.js
import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidget({ symbol = 'BTCUSD' }) {
  const container = useRef();

  useEffect(() => {
    // Clear previous widget when symbol changes
    if (container.current) {
      container.current.innerHTML = '';
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      allow_symbol_change: false,  // Disable symbol change in chart
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
      symbol: symbol, // Use the passed symbol
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
    });

    if (container.current) {
      container.current.appendChild(script);
    }

    // Cleanup function
    return () => {
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol]); // Re-run when symbol changes

  return (
    <div className="tradingview-widget-container  h-[900px] bg-[#0d0c0e] ">
      <div 
        ref={container}
        className="tradingview-widget-container__widget h-full w-full bg-[#0d0c0e] "
      />
    </div>
  );
}

// Only re-render when symbol actually changes
const areEqual = (prevProps, nextProps) => {
  return prevProps.symbol === nextProps.symbol;
};

export default memo(TradingViewWidget, areEqual);