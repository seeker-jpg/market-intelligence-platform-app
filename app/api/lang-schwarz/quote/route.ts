/**
 * Lang & Schwarz Quote Debug Endpoint (Internal Use Only)
 *
 * Purpose: Test and verify L&S integration with Trade Republic
 * Used for: Development, testing, and internal verification
 * Security: None — internal debug endpoint only
 *
 * Response:
 * - If LANG_SCHWARZ_ENABLED=false: { enabled: false }
 * - If L&S integration not yet implemented: { status: 'not_implemented' }
 * - If successful: { goldQuote, silverQuote, timestamp }
 * - If error: { error: message }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWithLangSchwarz } from '@/lib/lang-schwarz-service';

export async function GET(req: NextRequest) {
  // Guard: check if L&S is enabled
  if (process.env.LANG_SCHWARZ_ENABLED !== 'true') {
    return NextResponse.json(
      { enabled: false, message: 'Lang & Schwarz verification is disabled (LANG_SCHWARZ_ENABLED=false)' },
      { status: 200 }
    );
  }

  try {
    // TODO: Extract TR session from request headers or session store
    // For now, just indicate the endpoint exists
    const result = await verifyWithLangSchwarz(
      null, // no session available yet
      'DE000A0S9GB0', // example gold ISIN
      'Xetra-Gold',
      'DE000A0N62F2', // example silver ISIN
      'WisdomTree Physical Silver'
    );

    if (!result) {
      return NextResponse.json(
        { status: 'not_implemented', message: 'L&S quote fetch not yet implemented' },
        { status: 200 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[LS] Quote endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch L&S quotes',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
