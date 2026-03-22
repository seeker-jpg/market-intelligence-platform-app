# Lang & Schwarz Price Verification Integration

## Overview

Lang & Schwarz (LS) has been integrated as a **verification-only source** for gold and silver prices. The integration is:
- **Non-breaking**: Existing pricing logic unchanged (Binance remains primary)
- **Silent**: Fails gracefully without affecting market data flow
- **Modular**: Isolated in dedicated service file with guard checks
- **Controlled**: Behind `LANG_SCHWARZ_ENABLED` environment flag

---

## Modified Files

### 1. `lib/lang-schwarz-service.ts` (NEW)
**Purpose**: Isolated service for Lang & Schwarz price verification  
**Key Features**:
- `getLSQuote()` — Fetch a single L&S quote (stub implementation)
- `verifyWithLangSchwarz()` — Cross-verify gold and silver prices
- `calculateDelta()` — Compare L&S price vs reference price
- All functions guarded by `LANG_SCHWARZ_ENABLED` env flag
- Silent error handling — never propagates failures

**Key Code Pattern**:
```typescript
if (process.env.LANG_SCHWARZ_ENABLED !== 'true') {
  return null;  // Silent exit if disabled
}
// Implementation continues...
```

### 2. `lib/binance-service.ts` (MODIFIED)
**Changes**:
- Updated documentation to mention L&S as optional verification source
- Added guard check in `getMarketSnapshot()` to log L&S status if enabled
- Prepared `xauVerifyList` array for optional L&S verification injection
- **NO changes to return type** — `MarketSnapshot` interface unchanged
- **NO changes to pricing logic** — all prices computed identically

**Key Pattern**:
```typescript
if (process.env.LANG_SCHWARZ_ENABLED === 'true') {
  console.log('[INFO] Lang & Schwarz verification enabled...');
  // Future: inject L&S verification into xauVerifyList
}
```

### 3. `.env.example` (MODIFIED)
**Added**:
```env
# Lang & Schwarz (LS) price verification source
# When enabled, LS prices are fetched as advisory/verification only
# Does NOT affect primary pricing logic (Binance remains primary)
# Requires Trade Republic session with valid auth cookies
LANG_SCHWARZ_ENABLED=false
```

### 4. `app/api/lang-schwarz/quote/route.ts` (NEW)
**Purpose**: Optional debug endpoint for testing L&S integration  
**Behavior**:
- Returns `{ enabled: false }` if `LANG_SCHWARZ_ENABLED=false`
- Returns `{ status: 'not_implemented' }` if stub not yet filled
- Returns verification data if fully implemented
- Only for internal debugging — not used in main flow

---

## Environment Variables Added

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `LANG_SCHWARZ_ENABLED` | `boolean` (string) | `false` | Enable/disable L&S verification feature |

**Set to enable**:
```bash
LANG_SCHWARZ_ENABLED=true
```

---

## Architecture Assumptions

### Trade Republic Session Management
- L&S integration assumes a **valid TR session** (phone, PIN, cookies) will be available
- Session is passed to `getLSQuote()` and `verifyWithLangSchwarz()` functions
- If no session: functions return `null` silently
- Current session store: in-memory (use Redis/DB in production)

### Data Flow (No Changes)
```
getMarketSnapshot()
  ├─ Fetch Binance prices (PAXGUSDT, EURUSDC/T) ✓ PRIMARY
  ├─ Fetch verification sources (Yahoo, CoinGecko) ✓ VERIFICATION
  ├─ Optional: Fetch L&S quotes (if enabled + session available) ⚠️ STUB
  └─ Return MarketSnapshot with verification array
```

### Pricing Logic (100% Unchanged)
- **XAU/USD**: Always `PAXGUSDT` from Binance (XAU source label: `'binance'`)
- **XAG/USD**: Always `PAXGUSDT / ratio` where ratio is live-calibrated from Yahoo SI=F or defaults to 80 (XAG source label: `'binance-derived'`)
- **EUR/USD**: Always Binance first (`EURUSDC`/`EURUSDT`), fallback to Yahoo
- L&S can **never** replace or override these prices

---

## Implementation Status

### ✅ Completed
1. Service layer created (`lang-schwarz-service.ts`)
2. Environment flag added and documented
3. Guard checks implemented throughout
4. Binance service extended (non-breaking)
5. Debug endpoint created
6. Error handling in place

### ⚠️ Stub Implementation (Ready for Extension)
- `getLSQuote()` returns `null` with log message
- Actual TR WebSocket subscription not yet implemented
- Can be filled in when TR authentication is available

### Future Work
- Implement actual TR WebSocket subscription for L&S quotes
- Pass TR session from request headers to service layer
- Inject L&S verification into `xauVerifyList` when quote is available
- Add L&S verification badge to UI cards (like Yahoo/CoinGecko)

---

## Testing Steps

### 1. Verify Default Behavior (Disabled)
```bash
# Default: LANG_SCHWARZ_ENABLED=false
curl http://localhost:3000/api/market/snapshot
# Expected: Prices unchanged, no L&S references
```

### 2. Enable Feature (Debug)
```bash
# Set in .env.local
LANG_SCHWARZ_ENABLED=true
curl http://localhost:3000/api/lang-schwarz/quote
# Expected: { status: 'not_implemented' }
```

### 3. Verify Zero Pricing Impact
```bash
# Run with LANG_SCHWARZ_ENABLED=false and =true
# Compare /api/market/snapshot responses
# Expected: xauUsd, xagUsd, eurUsd prices IDENTICAL
```

### 4. Check Logs for Integration Info
```bash
# With LANG_SCHWARZ_ENABLED=true
# Expected in server logs:
# [INFO] Lang & Schwarz verification enabled but not yet implemented
```

---

## Constraints & Guarantees

### ✅ Guaranteed
- **Existing pricing logic**: 0% changed
- **Public interfaces**: No breaking changes to `MarketSnapshot`, API responses, or exports
- **Pricing accuracy**: Binance prices unaffected when L&S disabled (default)
- **Error isolation**: L&S failures never propagate to main flow
- **Backward compatibility**: Apps not setting `LANG_SCHWARZ_ENABLED` see no change

### ⛔ Not Allowed
- L&S prices must never replace Binance prices
- L&S can never become primary source (verification-only)
- L&S fetch failures must not block market data flow
- Breaking changes to existing type definitions

---

## Silent Failure Pattern

All L&S operations follow this pattern:
```typescript
try {
  // Attempt to fetch/verify
  if (!enabled) return null;
  if (!session) return null;
  // ... fetch logic
  return result;
} catch (error) {
  console.error('[LS] Error message', error);
  return null;  // Silent failure
}
```

This ensures:
- **No exceptions** propagate to caller
- **Logging** for debugging when enabled
- **Transparent fallback** — app continues normally

---

## Files Summary

| File | Type | Status | Impact |
|------|------|--------|--------|
| `lib/lang-schwarz-service.ts` | NEW | Complete stub | Zero — isolated |
| `lib/binance-service.ts` | MODIFIED | Comments + guard | Zero — no logic change |
| `.env.example` | MODIFIED | Config added | Zero — disabled by default |
| `app/api/lang-schwarz/quote/route.ts` | NEW | Debug endpoint | Zero — internal only |
| **All other files** | UNCHANGED | — | **ZERO IMPACT** |

---

## Future: Roadmap to Full Implementation

Once TR session auth is available:

1. **Pass TR session to endpoints**
   - Extract from request headers or session store
   - Pass to `verifyWithLangSchwarz(session, ...)`

2. **Implement WebSocket subscription**
   - Replace `getLSQuote()` stub with actual TR API call
   - Subscribe to LS instrument quotes (ISIN-based)
   - Parse bid/ask/last prices

3. **Integrate verification display**
   - Add L&S verification badges to `markets/page.tsx`
   - Show delta % like Yahoo/CoinGecko already do
   - Color-code for easy spotting of discrepancies

4. **Monitor and log**
   - Track L&S delta frequencies
   - Alert on unusual price divergence
   - Maintain audit trail for compliance
