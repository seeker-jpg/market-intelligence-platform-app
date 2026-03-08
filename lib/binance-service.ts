/**
 * Market Data Service
 * Sources:
 *   - XAU/USD : Binance PAXGUSDT (PAXG = 1 troy oz gold)
 *   - XAG/USD : Yahoo Finance SI=F (silver futures, best free source)
 *   - EUR/USD  : Binance EURUSDC › EURUSDT › Yahoo Finance EURUSD=X
 *
 * CoinGecko was tested for verification but is NOT used in production
 * because it lacks a reliable "silver" spot price endpoint on the free tier.
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
  source: 'binance' | 'yahoo' | 'derived';
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

const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

// ---------------------------------------------------------------------------
// Binance helpers
// ---------------------------------------------------------------------------

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_API_BASE}/ticker/price?symbol=${symbol}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: BinancePrice = await res.json();
    const price = parseFloat(data.price);
    return isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchBinancePrices(symbols: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  try {
    const symbolsParam = JSON.stringify(symbols);
    const res = await fetch(
      `${BINANCE_API_BASE}/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`Binance batch ${res.status}`);
    const data: BinancePrice[] = await res.json();
    for (const item of data) {
      const p = parseFloat(item.price);
      if (isFinite(p) && p > 0) priceMap.set(item.symbol, p);
    }
  } catch {
    // Fallback: individual requests in parallel
    const results = await Promise.all(
      symbols.map(async (s) => ({ symbol: s, price: await fetchBinancePrice(s) }))
    );
    for (const { symbol, price } of results) {
      if (price !== null) priceMap.set(symbol, price);
    }
  }
  return priceMap;
}

// ---------------------------------------------------------------------------
// Yahoo Finance helper — used for XAG/USD and EUR/USD fallback
// Free, no API key, reliable for spot/futures prices
// ---------------------------------------------------------------------------

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    // Using the v8 chart endpoint — lightweight, just the latest close
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    // The regularMarketPrice is the most current price
    const price: number | undefined =
      json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main snapshot
// ---------------------------------------------------------------------------

/**
 * Get complete market snapshot: XAU, XAG, EUR pairs.
 *
 * Gold  : Binance PAXGUSDT  (1 PAXG = 1 troy oz gold, priced in USDT ≈ USD)
 * Silver: Yahoo Finance SI=F (continuous silver futures, closest to spot)
 * EUR   : Binance EURUSDC › EURUSDT › Yahoo EURUSD=X
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const now = Date.now();
  const timestamp = new Date().toISOString();

  // Run all fetches in parallel
  const [binancePrices, silverYahoo, eurYahoo] = await Promise.all([
    fetchBinancePrices(['PAXGUSDT', 'EURUSDC', 'EURUSDT']),
    fetchYahooPrice('SI=F'),
    fetchYahooPrice('EURUSD=X'),
  ]);

  // --- XAU/USD ---
  const paxgPrice = binancePrices.get('PAXGUSDT') ?? null;
  const goldSource: 'binance' | 'yahoo' | 'derived' =
    paxgPrice != null ? 'binance' : 'derived';

  // --- EUR/USD ---
  const eurUsdcBinance = binancePrices.get('EURUSDC') ?? null;
  const eurUsdtBinance = binancePrices.get('EURUSDT') ?? null;
  const binanceEur = eurUsdcBinance ?? eurUsdtBinance;
  const eurUsdPrice = binanceEur ?? eurYahoo;
  const eurUsdSource: 'binance' | 'yahoo' | 'derived' =
    binanceEur != null ? 'binance' : eurYahoo != null ? 'yahoo' : 'derived';

  // --- XAG/USD ---
  // Primary: Yahoo Finance SI=F (silver futures, continuously traded)
  // Fallback: gold / ratio 80 (conservative estimate)
  const silverPrice = silverYahoo ?? (paxgPrice != null ? paxgPrice / 80 : null);
  const silverSource: 'binance' | 'yahoo' | 'derived' =
    silverYahoo != null ? 'yahoo' : 'derived';

  // --- Cross rates (derived) ---
  const xauEurPrice =
    paxgPrice != null && eurUsdPrice != null ? paxgPrice / eurUsdPrice : null;
  const xagEurPrice =
    silverPrice != null && eurUsdPrice != null ? silverPrice / eurUsdPrice : null;

  const sourceLabel = [
    paxgPrice ? 'Binance(PAXG)' : 'N/A(or)',
    silverYahoo ? 'Yahoo(XAG)' : 'ratio(XAG)',
    binanceEur
      ? `Binance(EUR/${eurUsdcBinance ? 'USDC' : 'USDT'})`
      : eurYahoo
      ? 'Yahoo(EUR)'
      : 'N/A(EUR)',
  ].join(' + ');

  return {
    xauUsd: {
      pair: 'XAU/USD',
      binanceSymbol: 'PAXGUSDT',
      price: paxgPrice,
      currency: 'USD',
      lastUpdate: timestamp,
      source: goldSource,
    },
    xagUsd: {
      pair: 'XAG/USD',
      binanceSymbol: 'SI=F',
      price: silverPrice,
      currency: 'USD',
      lastUpdate: timestamp,
      source: silverSource,
    },
    eurUsd: {
      pair: 'EUR/USD',
      binanceSymbol: eurUsdcBinance ? 'EURUSDC' : 'EURUSDT',
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
    source: sourceLabel,
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
