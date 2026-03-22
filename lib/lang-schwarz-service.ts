/**
 * Lang & Schwarz (LS) Price Verification Service
 * 
 * Integration Purpose: Cross-verify gold/silver prices from Trade Republic
 * against Lang & Schwarz quotes. Serves as advisory/verification only.
 * 
 * IMPORTANT: This service is verification-only and non-blocking.
 * All errors are logged silently. Primary pricing logic is unchanged.
 * 
 * Requirements:
 * - LANG_SCHWARZ_ENABLED env flag must be true
 * - Trade Republic session with valid cookies
 * - LS instruments ISINs registered in lib/config/instruments.ts
 */

import { TRSession } from './trade-republic-api';

export interface LSQuote {
  isin: string;
  symbol: string;
  name: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: string;
  currency: 'EUR' | 'USD';
  percentChange?: number;
}

export interface LSVerification {
  goldQuote: LSQuote | null;
  silverQuote: LSQuote | null;
  timestamp: string;
  error?: string;
}

/**
 * Fetch a Lang & Schwarz quote via Trade Republic WebSocket
 * Returns null if fetch fails or LS_ENABLED is false
 */
export async function getLSQuote(
  session: TRSession | null,
  isin: string,
  symbol: string,
  assetName: string
): Promise<LSQuote | null> {
  // Guard: env flag must be enabled
  if (process.env.LANG_SCHWARZ_ENABLED !== 'true') {
    return null;
  }

  // Guard: require valid session
  if (!session) {
    console.log('[LS] Skipping L&S quote fetch: no TR session available');
    return null;
  }

  try {
    // TODO: Implement actual TR WebSocket subscription for LS quotes
    // For now, return null to indicate verification not yet available
    // This keeps the integration safe and non-blocking
    console.log(`[LS] Quote fetch not yet implemented for ${symbol} (${isin})`);
    return null;
  } catch (error) {
    // Silent failure - log but don't propagate
    console.error(`[LS] Failed to fetch quote for ${symbol}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Verify gold and silver prices against Lang & Schwarz
 * Returns null if verification is disabled or fails
 */
export async function verifyWithLangSchwarz(
  session: TRSession | null,
  goldISIN: string,
  goldSymbol: string,
  silverISIN: string,
  silverSymbol: string
): Promise<LSVerification | null> {
  // Guard: env flag must be enabled
  if (process.env.LANG_SCHWARZ_ENABLED !== 'true') {
    return null;
  }

  try {
    const goldQuote = await getLSQuote(session, goldISIN, goldSymbol, 'Gold');
    const silverQuote = await getLSQuote(session, silverISIN, silverSymbol, 'Silver');

    return {
      goldQuote,
      silverQuote,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Silent failure - don't let L&S verification break the app
    console.error(
      '[LS] Verification failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Calculate delta percentage between L&S and a reference price
 * Used for verification badge display
 */
export function calculateDelta(lsPrice: number, referencePrice: number): number {
  if (referencePrice === 0) return 0;
  return ((lsPrice - referencePrice) / referencePrice) * 100;
}
