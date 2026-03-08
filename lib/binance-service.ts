/**
 * Market Data Service
 * Fetches real-time prices for XAU/USD, XAG/USD, EUR/USD
 * Sources: Binance (primary) + CoinGecko (secondary for XAG, fallback)
 */

export interface BinancePrice {
  symbol: string;
  price: string;
  timestamp: number;
}

export interface MarketPair {
  pair: string;
  binanceSymbol: string;
  price: number | null;
  currency: string;
  lastUpdate: string;
  source: 'binance' | 'coingecko' | 'derived';
}

export interface MarketSnapshot {
  xauUsd: MarketPair;
  xagUsd: MarketPair;
  eurUsd: MarketPair;
  xauEur: MarketPair;
  xagEur: MarketPair;
  timestamp: number;
  source: string;
}

// Binance API endpoints
const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

// CoinGecko API (free tier, no key required for basic endpoints)
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Fetch single ticker price from Binance
 */
async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(`${BINANCE_API_BASE}/ticker/price?symbol=${symbol}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data: BinancePrice = await response.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

/**
 * Fetch multiple ticker prices from Binance
 */
async function fetchBinancePrices(symbols: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  try {
    const symbolsParam = JSON.stringify(symbols);
    const response = await fetch(
      `${BINANCE_API_BASE}/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      // Fallback to individual requests
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const price = await fetchBinancePrice(symbol);
          return { symbol, price };
        })
      );
      results.forEach(({ symbol, price }) => {
        if (price !== null) priceMap.set(symbol, price);
      });
      return priceMap;
    }

    const data: BinancePrice[] = await response.json();
    data.forEach((item) => {
      priceMap.set(item.symbol, parseFloat(item.price));
    });
  } catch {
    // Fallback to individual requests
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const price = await fetchBinancePrice(symbol);
        return { symbol, price };
      })
    );
    results.forEach(({ symbol, price }) => {
      if (price !== null) priceMap.set(symbol, price);
    });
  }

  return priceMap;
}

/**
 * Fetch gold and silver prices from CoinGecko
 * Returns prices in USD
 * Uses: pax-gold (PAXG) for gold, silver for silver
 */
async function fetchCoinGeckoPrices(): Promise<{
  gold: number | null;
  silver: number | null;
  eurUsd: number | null;
}> {
  try {
    // CoinGecko has a "silver" coin (real silver price index) and pax-gold for PAXG
    // For EUR/USD we can use vs_currencies parameter
    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/price?ids=pax-gold,silver&vs_currencies=usd,eur`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return { gold: null, silver: null, eurUsd: null };
    }

    const data = await response.json();

    const goldUsd: number | null = data['pax-gold']?.usd ?? null;
    const silverUsd: number | null = data['silver']?.usd ?? null;

    // Derive EUR/USD from gold prices: gold_usd / gold_eur
    let eurUsd: number | null = null;
    if (data['pax-gold']?.usd && data['pax-gold']?.eur) {
      eurUsd = data['pax-gold'].usd / data['pax-gold'].eur;
    }

    return { gold: goldUsd, silver: silverUsd, eurUsd };
  } catch {
    return { gold: null, silver: null, eurUsd: null };
  }
}

/**
 * Get complete market snapshot with XAU, XAG, EUR pairs
 * Primary source: Binance for PAXG/USDT and EUR/USDT
 * Secondary source: CoinGecko for silver (XAG) and as fallback
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const now = Date.now();
  const timestamp = new Date().toISOString();

  // Fetch from Binance and CoinGecko in parallel
  const [binancePrices, coinGeckoPrices] = await Promise.all([
    fetchBinancePrices(['PAXGUSDT', 'EURUSDT', 'EURUSDC']),
    fetchCoinGeckoPrices(),
  ]);

  // --- XAU/USD ---
  // Binance PAXG/USDT is the primary source for gold price
  const paxgUsdtPrice = binancePrices.get('PAXGUSDT') ?? null;
  const goldPrice = paxgUsdtPrice ?? coinGeckoPrices.gold;
  const goldSource: 'binance' | 'coingecko' | 'derived' =
    paxgUsdtPrice != null ? 'binance' : coinGeckoPrices.gold != null ? 'coingecko' : 'derived';

  // --- EUR/USD ---
  // Binance EURUSDC preferred, then EURUSDT, then CoinGecko derived
  const eurUsdcPrice = binancePrices.get('EURUSDC') ?? null;
  const eurUsdtPrice = binancePrices.get('EURUSDT') ?? null;
  const binanceEurUsd = eurUsdcPrice ?? eurUsdtPrice;
  const eurUsdPrice = binanceEurUsd ?? coinGeckoPrices.eurUsd;
  const eurUsdSource: 'binance' | 'coingecko' | 'derived' =
    binanceEurUsd != null ? 'binance' : coinGeckoPrices.eurUsd != null ? 'coingecko' : 'derived';

  // --- XAG/USD ---
  // Binance does NOT have a direct XAG pair.
  // CoinGecko "silver" provides the real spot silver price in USD.
  const silverPrice = coinGeckoPrices.silver;
  const silverSource: 'binance' | 'coingecko' | 'derived' =
    silverPrice != null ? 'coingecko' : 'derived';
  // Fallback: use gold/silver ratio if CoinGecko is unavailable
  const silverPriceFinal =
    silverPrice ?? (goldPrice != null ? goldPrice / 80 : null);
  const silverSourceFinal: 'binance' | 'coingecko' | 'derived' =
    silverPrice != null ? 'coingecko' : 'derived';

  // --- XAU/EUR and XAG/EUR (derived) ---
  const xauEurPrice =
    goldPrice != null && eurUsdPrice != null ? goldPrice / eurUsdPrice : null;
  const xagEurPrice =
    silverPriceFinal != null && eurUsdPrice != null
      ? silverPriceFinal / eurUsdPrice
      : null;

  const sourceLabel = [
    paxgUsdtPrice ? 'Binance(PAXG)' : coinGeckoPrices.gold ? 'CoinGecko(or)' : '',
    silverPrice ? 'CoinGecko(argent)' : '',
    binanceEurUsd ? `Binance(EUR/${eurUsdcPrice ? 'USDC' : 'USDT'})` : coinGeckoPrices.eurUsd ? 'CoinGecko(EUR)' : '',
  ]
    .filter(Boolean)
    .join(' + ');

  return {
    xauUsd: {
      pair: 'XAU/USD',
      binanceSymbol: 'PAXGUSDT',
      price: goldPrice,
      currency: 'USD',
      lastUpdate: timestamp,
      source: goldSource,
    },
    xagUsd: {
      pair: 'XAG/USD',
      binanceSymbol: 'coingecko:silver',
      price: silverPriceFinal,
      currency: 'USD',
      lastUpdate: timestamp,
      source: silverSourceFinal,
    },
    eurUsd: {
      pair: 'EUR/USD',
      binanceSymbol: eurUsdcPrice ? 'EURUSDC' : 'EURUSDT',
      price: eurUsdPrice,
      currency: 'USD',
      lastUpdate: timestamp,
      source: eurUsdSource,
    },
    xauEur: {
      pair: 'XAU/EUR',
      binanceSymbol: 'derived',
      price: xauEurPrice,
      currency: 'EUR',
      lastUpdate: timestamp,
      source: 'derived',
    },
    xagEur: {
      pair: 'XAG/EUR',
      binanceSymbol: 'derived',
      price: xagEurPrice,
      currency: 'EUR',
      lastUpdate: timestamp,
      source: 'derived',
    },
    timestamp: now,
    source: sourceLabel || 'binance+coingecko',
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null, decimals = 2): string {
  if (price === null) return '---';
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace('T', ' ').substring(0, 23);
}
