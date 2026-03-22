/**
 * Trade Republic Real Price Fetching Service
 * 
 * Fetches LIVE prices from Trade Republic WebSocket API
 * via authenticated Trade Republic session.
 * 
 * CRITICAL: This is the ONLY source of truth for TR prices.
 * All mock data (lib/mock/tr-prices.ts) is deprecated and must NOT be used
 * in any price calculations or displays.
 */

import { TRSession, getTRQuotes, getTRInstrumentDetails } from './trade-republic-api';
import type { TRInstrument } from './types/arbitrage';

export interface RealTRPrice {
  isin: string;
  symbol: string;
  name: string;
  price: number;
  bid: number;
  ask: number;
  currency: string;
  timestamp: string;
  isLive: boolean;
  source: 'trade-republic-live';
}

/**
 * Fetch REAL Trade Republic price for a single instrument
 * Returns null if price unavailable or fetch fails
 * 
 * @param session - Trade Republic authenticated session
 * @param isin - Instrument ISIN code
 * @returns Real TR price or null if unavailable
 */
export async function getRealTRPrice(
  session: TRSession | null,
  isin: string
): Promise<RealTRPrice | null> {
  // Guard: must have valid session
  if (!session || !session.trSessionToken) {
    console.error(
      `[TR_PRICES] Cannot fetch real price for ${isin}: no valid TR session`
    );
    return null;
  }

  try {
    // Fetch real quotes from TR WebSocket
    const quotes = await getTRQuotes(session, [isin]);
    
    if (!quotes || quotes.length === 0) {
      console.warn(`[TR_PRICES] No quotes received for ${isin}`);
      return null;
    }

    const quote = quotes[0];
    
    if (!quote.lastPrice || !quote.bid || !quote.ask) {
      console.warn(`[TR_PRICES] Incomplete quote for ${isin}:`, quote);
      return null;
    }

    return {
      isin,
      symbol: quote.instrumentId || isin,
      name: quote.instrumentName || 'Unknown',
      price: quote.lastPrice,
      bid: quote.bid,
      ask: quote.ask,
      currency: quote.currency || 'EUR',
      timestamp: new Date().toISOString(),
      isLive: true,
      source: 'trade-republic-live',
    };
  } catch (error) {
    console.error(
      `[TR_PRICES] Failed to fetch real price for ${isin}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Fetch REAL Trade Republic prices for multiple instruments
 * 
 * @param session - Trade Republic authenticated session
 * @param isins - Array of ISIN codes
 * @returns Map of ISIN -> RealTRPrice (only successful fetches included)
 */
export async function getRealTRPrices(
  session: TRSession | null,
  isins: string[]
): Promise<Map<string, RealTRPrice>> {
  const results = new Map<string, RealTRPrice>();

  if (!session || !session.trSessionToken) {
    console.error('[TR_PRICES] Cannot fetch real prices: no valid TR session');
    return results;
  }

  try {
    // Fetch all quotes in parallel
    const quotes = await getTRQuotes(session, isins);
    
    if (!quotes) {
      console.warn('[TR_PRICES] No quotes received from TR');
      return results;
    }

    for (const quote of quotes) {
      if (quote.instrumentId && quote.lastPrice && quote.bid && quote.ask) {
        results.set(quote.instrumentId, {
          isin: quote.instrumentId,
          symbol: quote.instrumentId,
          name: quote.instrumentName || 'Unknown',
          price: quote.lastPrice,
          bid: quote.bid,
          ask: quote.ask,
          currency: quote.currency || 'EUR',
          timestamp: new Date().toISOString(),
          isLive: true,
          source: 'trade-republic-live',
        });
      }
    }

    console.log(
      `[TR_PRICES] Successfully fetched ${results.size}/${isins.length} real prices`
    );
    return results;
  } catch (error) {
    console.error(
      '[TR_PRICES] Failed to fetch real prices:',
      error instanceof Error ? error.message : String(error)
    );
    return results;
  }
}

/**
 * CRITICAL VALIDATION: Ensure price is from real TR, not mock
 * Throws error if price is missing or clearly fake
 * 
 * @param isin - Instrument ISIN
 * @param price - Price to validate
 * @throws Error if price is invalid
 */
export function validateRealTRPrice(isin: string, price: RealTRPrice | null): void {
  if (!price) {
    throw new Error(
      `[TR_PRICES] CRITICAL: No real TR price available for ${isin}. ` +
      'Cannot display price without real market data. ' +
      'Check if Trade Republic session is valid and authenticated.'
    );
  }

  if (!price.isLive) {
    throw new Error(
      `[TR_PRICES] CRITICAL: Price for ${isin} is not live. ` +
      'Stale or mock data is not permitted.'
    );
  }

  if (price.source !== 'trade-republic-live') {
    throw new Error(
      `[TR_PRICES] CRITICAL: Price source for ${isin} is not Trade Republic live data. ` +
      `Got source: ${price.source}`
    );
  }

  if (price.price <= 0) {
    throw new Error(
      `[TR_PRICES] CRITICAL: Invalid price for ${isin}: ${price.price}. ` +
      'Prices must be positive.'
    );
  }
}

/**
 * Log warning when mock data is used instead of real TR prices
 * This should only happen during development/testing
 */
export function logMockDataWarning(isin: string, context: string): void {
  console.warn(
    `[TR_PRICES] ⚠️  MOCK DATA ALERT: Using simulated price for ${isin} in ${context}. ` +
    `This is TEST DATA ONLY and must NOT be used for production trading. ` +
    `Real Trade Republic prices are not available.`
  );
}
