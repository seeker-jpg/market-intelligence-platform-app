/**
 * Data Integrity Module
 * 
 * Enforces strict rules:
 * - NEVER return hardcoded/simulated/mocked prices
 * - EVERY price must be traceable to a real live data source
 * - If source fails → return null or error, NEVER fake/fallback value
 * - ALL prices must be validated before display
 */

export interface PriceDataAudit {
  pair: string;
  source: string;
  timestamp: string;
  value: number | null;
  isReal: boolean;
  isVerified: boolean;
  violations: string[];
  rawResponse?: unknown;
}

export interface DataIntegrityReport {
  timestamp: string;
  allPricesReal: boolean;
  violations: PriceDataAudit[];
  summary: {
    totalChecks: number;
    realDataCount: number;
    failedCount: number;
    fakeDataDetected: string[];
  };
}

const REAL_DATA_SOURCES = [
  'binance',
  'binance-derived', // derived from Binance real data only
  'yahoo',
  'coingecko',
  'lang-schwarz',
] as const;

const MOCK_DATA_SOURCES = [
  'mock',
  'hardcoded',
  'simulated',
  'estimated',
  'fabricated',
] as const;

/**
 * Check if a price value came from a real data source
 */
export function isRealDataSource(source: string): boolean {
  return REAL_DATA_SOURCES.includes(source as any);
}

/**
 * Check if a price is valid (not null, not zero, not NaN, not Infinity)
 */
export function isValidPrice(price: number | null): boolean {
  if (price === null || price === undefined) return false;
  if (!isFinite(price)) return false;
  if (price <= 0) return false;
  return true;
}

/**
 * Strict price validator — returns price or throws error if invalid/fake
 * 
 * Usage:
 *   const price = validatePrice(snapshot.xauUsd.price, 'XAU/USD', 'binance');
 *   // If price is null or from fake source, throws immediately
 *   // If price is valid, returns it
 */
export function validatePrice(
  price: number | null,
  pair: string,
  source: string,
  options: { allowNull?: boolean; minValue?: number; maxValue?: number } = {}
): number {
  const { allowNull = false, minValue = 0.01, maxValue = 1000000 } = options;

  const violations: string[] = [];

  // Check source legitimacy
  if (!isRealDataSource(source)) {
    violations.push(`SOURCE_NOT_REAL: '${source}' is not a recognized live data source`);
  }

  // Check if price is provided
  if (price === null || price === undefined) {
    if (allowNull) {
      console.warn(`[DATA_INTEGRITY] ${pair} returned null from ${source}`);
      return null as any;
    }
    violations.push(`MISSING_PRICE: ${pair} price is null from ${source}`);
  }

  // Check if price is valid
  if (price !== null && !isValidPrice(price)) {
    violations.push(
      `INVALID_PRICE: ${pair} = ${price} (not finite or <= 0) from ${source}`
    );
  }

  // Check bounds
  if (price !== null) {
    if (price < minValue) {
      violations.push(`BOUNDS_VIOLATION: ${pair} = ${price} below minimum ${minValue}`);
    }
    if (price > maxValue) {
      violations.push(`BOUNDS_VIOLATION: ${pair} = ${price} exceeds maximum ${maxValue}`);
    }
  }

  // Throw if violations found
  if (violations.length > 0) {
    const msg = `[DATA_INTEGRITY_VIOLATION] ${pair}:\n${violations.join('\n')}`;
    console.error(msg);
    throw new Error(msg);
  }

  return price as number;
}

/**
 * Create audit entry for a price
 */
export function auditPrice(
  pair: string,
  source: string,
  value: number | null,
  rawResponse?: unknown
): PriceDataAudit {
  const violations: string[] = [];

  if (!isRealDataSource(source)) {
    violations.push(`Non-real source: ${source}`);
  }

  if (!isValidPrice(value)) {
    violations.push(`Invalid price value: ${value}`);
  }

  return {
    pair,
    source,
    timestamp: new Date().toISOString(),
    value,
    isReal: isRealDataSource(source),
    isVerified: violations.length === 0,
    violations,
    rawResponse,
  };
}

/**
 * Generate data integrity report
 */
export function createIntegrityReport(audits: PriceDataAudit[]): DataIntegrityReport {
  const realCount = audits.filter((a) => a.isReal && a.isVerified).length;
  const failedCount = audits.filter((a) => !a.isVerified).length;
  const fakeDataDetected = audits
    .filter((a) => !a.isReal)
    .map((a) => `${a.pair} from ${a.source}`);

  return {
    timestamp: new Date().toISOString(),
    allPricesReal: audits.every((a) => a.isReal),
    violations: audits.filter((a) => a.violations.length > 0),
    summary: {
      totalChecks: audits.length,
      realDataCount: realCount,
      failedCount,
      fakeDataDetected,
    },
  };
}

/**
 * Log data integrity report to console + error tracking
 */
export function logIntegrityReport(report: DataIntegrityReport): void {
  const emoji = report.allPricesReal ? '✅' : '❌';
  console.log(`[DATA_INTEGRITY_REPORT] ${emoji}`, report);

  if (report.violations.length > 0) {
    console.error('[DATA_INTEGRITY_VIOLATIONS]', report.violations);
  }

  if (report.summary.fakeDataDetected.length > 0) {
    console.error('[FAKE_DATA_DETECTED]', report.summary.fakeDataDetected);
  }
}

/**
 * Prevent undefined → default numeric fallback pattern
 * 
 * Usage:
 *   const price = snapshot.xauUsd.price;
 *   assertNotUndefinedNumber(price, 'XAU/USD');
 *   // Throws if price is undefined/null/NaN/not finite
 */
export function assertNotUndefinedNumber(
  value: unknown,
  label: string
): number {
  if (typeof value !== 'number') {
    throw new Error(
      `[DATA_INTEGRITY] ${label}: expected number, got ${typeof value} (${value})`
    );
  }

  if (!isFinite(value)) {
    throw new Error(
      `[DATA_INTEGRITY] ${label}: value ${value} is not finite (NaN, Infinity, etc.)`
    );
  }

  if (value <= 0) {
    throw new Error(
      `[DATA_INTEGRITY] ${label}: value ${value} must be > 0`
    );
  }

  return value;
}
