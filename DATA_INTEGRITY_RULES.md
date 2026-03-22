# Data Integrity Rules - Non-Negotiable

## Core Principle
**ALL displayed prices must be REAL, VERIFIED, and TRACEABLE to a live data source.**

---

## The Rules

### Rule 1: NO Fake, Simulated, or Mocked Prices
- ❌ **NEVER** use hardcoded prices like `2650` or `1.08`
- ❌ **NEVER** use `MOCK_TR_PRICES` in production code
- ❌ **NEVER** use simulated/estimated values as fallbacks
- ✅ **ALWAYS** fetch from real APIs: Binance, Yahoo Finance, CoinGecko, Lang & Schwarz

### Rule 2: Every Price Must Have a Traceable Source
Each price in `MarketSnapshot` must carry:
- `source`: One of `'binance'`, `'yahoo'`, `'coingecko'`, `'lang-schwarz'`, `'binance-derived'` (derived from real Binance data only)
- `timestamp`: ISO string showing when the price was fetched
- Optional `rawResponse`: Raw API response when needed for audit trail

**Invalid sources (FORBIDDEN):**
- `'mock'`, `'hardcoded'`, `'simulated'`, `'estimated'`, `'fabricated'`, `'test'`

### Rule 3: If a Source Fails → Return NULL or Error, NOT Fake Data
```typescript
// ❌ WRONG - fallback to fake value:
const price = snapshot.xauUsd.price || 2650;

// ✅ CORRECT - return null if unavailable:
const price = snapshot.xauUsd.price; // could be null
if (price === null) {
  return showUnavailable(); // UI displays "N/A"
}
```

### Rule 4: NO Undefined → Default Numeric Fallback
```typescript
// ❌ WRONG - undefined silently becomes 0:
const price: number = marketData.price || 0;
calculateArbitrage(price); // could be 0!

// ✅ CORRECT - throw if undefined:
const price = assertNotUndefinedNumber(marketData.price, 'XAU/USD');
calculateArbitrage(price); // guaranteed > 0 or throws
```

### Rule 5: UI Must Never Display a Price Unless 100% Real
```typescript
// ❌ WRONG - displays even if null:
<span>${snapshot.xauUsd.price || '--'}</span>

// ✅ CORRECT - explicit null check:
{snapshot.xauUsd.price !== null ? (
  <span>${snapshot.xauUsd.price.toFixed(2)}</span>
) : (
  <span className="text-muted-foreground">N/A</span>
)}
```

### Rule 6: All Mock Data Must Be Clearly Labeled
Files using mock/test data:
- `lib/mock/tr-prices.ts` — Hardcoded TR prices (SIMULATION ONLY)
- `lib/etf-data.ts` — Hardcoded ETF prices (SIMULATION ONLY)

**Usage requirements:**
1. Call `useMockTRData(context)` at usage point to log warning
2. Add comment: `// MOCK DATA - Replace with real TR API`
3. Never use in production without explicit test/demo mode check

### Rule 7: Validation Happens at API Boundaries
```typescript
// In /api/market/snapshot
const snapshot = await getMarketSnapshot();
// <- this must return 100% real data or null values
// <- getMarketSnapshot NEVER returns fake fallback values
```

### Rule 8: Verification Sources Don't Override Primary Data
- Binance = primary for XAU, XAG (via ratio), EUR
- Yahoo/CoinGecko = verification only (appear in `verification[]` array)
- Lang & Schwarz = verification only (never overrides Binance)

**Rule: Verification sources never become primary if primary fails.**

---

## Implementation Patterns

### Strict Price Validation
```typescript
import { validatePrice, assertNotUndefinedNumber } from '@/lib/data-integrity';

// Pattern 1: Require price or throw
const xauPrice = validatePrice(
  snapshot.xauUsd.price,
  'XAU/USD',
  'binance',
  { minValue: 100, maxValue: 10000 }
); // throws if null or invalid source

// Pattern 2: Verify variable is number
const eurPrice = assertNotUndefinedNumber(
  snapshot.eurUsd.price,
  'EUR/USD'
); // throws if not a finite positive number
```

### Data Integrity Auditing
```typescript
import { auditPrice, createIntegrityReport, logIntegrityReport } from '@/lib/data-integrity';

const audits = [
  auditPrice('XAU/USD', snapshot.xauUsd.source, snapshot.xauUsd.price),
  auditPrice('XAG/USD', snapshot.xagUsd.source, snapshot.xagUsd.price),
  auditPrice('EUR/USD', snapshot.eurUsd.source, snapshot.eurUsd.price),
];

const report = createIntegrityReport(audits);
logIntegrityReport(report);

if (!report.allPricesReal) {
  throw new Error('Data integrity violation detected');
}
```

---

## Current Status

### ✅ Compliant Files
- `lib/binance-service.ts` — Fetches from real APIs only, no fallbacks to hardcoded values
- `lib/live-market-data.ts` — Bridges Binance data without introducing mocks
- `lib/lang-schwarz-service.ts` — Verification only, guarded by env flag

### ⚠️ Needs Attention
- `lib/mock/tr-prices.ts` — **MOCK DATA** - Used in dashboard/arbitrage
  - Labels added, but still hardcoded
  - Must be replaced with real TR API when available
  
- `lib/etf-data.ts` — **MOCK DATA** - Returns hardcoded prices
  - Labels added
  - Must be replaced with real TR API when available

- `app/dashboard/page.tsx` — Previously used hardcoded fallbacks (FIXED)
  - Now returns null if prices unavailable
  - Displays "N/A" instead of fake data

### ❌ Production Blockers
1. **Trade Republic API Integration** — Currently all ETF/TR prices are mocked
   - Need real TR API authentication and WebSocket subscription
   - Once available, replace `MOCK_TR_PRICES` with live API calls
   - Remove hardcoded data from `etf-data.ts`

2. **Lang & Schwarz Integration** — Stub only, not implemented
   - Requires TR session for WebSocket auth
   - Once TR API available, can fetch L&S quotes

---

## Deployment Checklist

Before deploying to production:

- [ ] All prices come from `getMarketSnapshot()` (100% real data)
- [ ] No hardcoded price fallbacks (remove `|| 2650`, `|| 1.08`, etc.)
- [ ] No mock data in production flows (only in demo/test mode)
- [ ] All `null` prices handled properly (display "N/A", don't silently default to 0)
- [ ] Data integrity module imported and used
- [ ] Every price returned can be traced to source (Binance/Yahoo/CoinGecko/L&S)
- [ ] Trade Republic API integration complete (replacing MOCK_TR_PRICES)
- [ ] All mock warnings logged when using test data

---

## Testing Data Integrity

```bash
# 1. Check for hardcoded fallback patterns
grep -r "|| [0-9]" app/ lib/ --include="*.ts" --include="*.tsx"
# Result: Should be empty or only in MOCK_* and test files

# 2. Check for undefined → default patterns
grep -r "?? 0\|?? null\||| 0" app/ lib/ --include="*.ts" --include="*.tsx"
# Result: Should be empty in production code

# 3. Verify all prices come from real sources
# In getMarketSnapshot(), all prices should:
# - Come from actual API calls (Binance, Yahoo, CoinGecko)
# - Have source field set to real source name
# - Return null if source fails (never fallback to fake value)

# 4. Run integration test
npm test -- data-integrity.test.ts
```

---

## Questions?

Refer to `lib/data-integrity.ts` for validation utilities and audit functions.
