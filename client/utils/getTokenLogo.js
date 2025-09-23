export const getTokenLogo = (symbol) => {
  // Convert symbol to uppercase to ensure consistency
  let upperSymbol = symbol.toUpperCase();
  if (upperSymbol.startsWith('K') && (upperSymbol !== 'KAS' && upperSymbol !== 'KAITO')) {
    upperSymbol = upperSymbol.slice(1);
  }
  // Return Hyperliquid SVG URL directly using the symbol
  return `https://app.hyperliquid.xyz/coins/${upperSymbol}.svg`;
};

/**
 * Get multiple token logos at once
 */
export const getTokenLogos = (symbols) => {
  return symbols.reduce((acc, symbol) => {
    acc[symbol] = getTokenLogo(symbol);
    return acc;
  }, {});
};