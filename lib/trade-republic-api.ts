/**
 * Trade Republic API Client
 * Based on Trade Republic unofficial APIs
 * 
 * Handles authentication flow:
 * 1. POST /api/v1/auth/web/login with phone + PIN -> returns processId
 * 2. User receives SMS with device PIN (4 digits)
 * 3. POST /api/v1/auth/web/login/{processId}/{devicePin} -> returns session cookies
 * 
 * IMPORTANT: Trade Republic may block requests from certain IPs (data centers, VPNs)
 * The API requires:
 * - Valid phone number format with country code (+49, +33, etc.)
 * - Correct 4-digit PIN
 * - Non-blocked IP address (residential IPs work best)
 */

import { WebSocket } from 'ws';

// Constants
const TR_API_HOST = 'https://api.traderepublic.com';
const TR_WS_HOST = 'wss://api.traderepublic.com';
const WS_CONNECT_VERSION = '31';
const HTTP_TIMEOUT_MS = 30000; // Increased timeout to 30s
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Error codes mapping for better user feedback
const ERROR_MESSAGES: Record<string, string> = {
  'INVALID_CREDENTIALS': 'PIN ou numero de telephone incorrect',
  'INVALID_PHONE_NUMBER': 'Numero de telephone invalide ou non enregistre',
  'RATE_LIMITED': 'Trop de tentatives. Attendez quelques minutes avant de reessayer.',
  'BLOCKED_IP': 'Votre IP est bloquee par Trade Republic. Essayez depuis une autre connexion.',
  'SESSION_EXPIRED': 'Session expiree. Veuillez vous reconnecter.',
  'NETWORK_ERROR': 'Impossible de joindre les serveurs Trade Republic.',
  'UNKNOWN': 'Erreur inconnue. Verifiez vos identifiants et reessayez.',
};

// Types
export interface TRSession {
  phoneNumber: string;
  trSessionToken: string;
  trRefreshToken?: string;
  rawCookies: string[];
  createdAt: number;
  expiresAt: number;
}

export interface TRLoginInitResponse {
  processId?: string;
  countdownInSeconds?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface TRLoginVerifyResponse {
  success: boolean;
  session?: TRSession;
  error?: string;
}

export interface TRSubscription {
  id: number;
  type: string;
  callback: (data: unknown) => void;
}

// In-memory session store (use Redis/DB in production)
const sessionStore = new Map<string, TRSession>();
const pendingLogins = new Map<string, { processId: string; phoneNumber: string; pin: string; expiresAt: number }>();

/**
 * Extract cookie value from raw cookie strings
 */
function extractCookieValue(cookies: string[], name: string): string | undefined {
  const joined = cookies.join('; ');
  const match = joined.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`));
  return match?.[1];
}

/**
 * Make HTTP request to Trade Republic API
 */
async function trRequest(
  path: string,
  payload?: Record<string, unknown>,
  method: string = 'POST',
  cookies?: string[]
): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  if (cookies && cookies.length > 0) {
    headers['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${TR_API_HOST}${path}`, {
      method,
      headers,
      body: method !== 'GET' && payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 1: Initiate login - sends SMS to phone
 * Returns processId needed for step 2
 * 
 * Common issues:
 * - Wrong phone format (must include country code: +49, +33, etc.)
 * - Wrong PIN (4 digits)
 * - IP blocked by Trade Republic (data center/VPN IPs are often blocked)
 * - Rate limited (too many attempts)
 */
export async function initiateLogin(phoneNumber: string, pin: string): Promise<TRLoginInitResponse> {
  const startTime = Date.now();
  
  // Enhanced logging for debugging
  console.log(`[TR API] ========== INITIATE LOGIN ==========`);
  console.log(`[TR API] Phone: ${phoneNumber}`);
  console.log(`[TR API] PIN length: ${pin.length} (expected: 4)`);
  console.log(`[TR API] Timestamp: ${new Date().toISOString()}`);
  console.log(`[TR API] API Host: ${TR_API_HOST}`);

  // Validate inputs before making request
  if (!phoneNumber || phoneNumber.length < 10) {
    console.error(`[TR API] Invalid phone number: too short`);
    return {
      error: 'Numero de telephone invalide (trop court)',
      details: { validation: 'phone_too_short', phone: phoneNumber },
    };
  }

  if (!phoneNumber.startsWith('+')) {
    console.error(`[TR API] Invalid phone number: missing country code`);
    return {
      error: 'Le numero doit commencer par un indicatif pays (+33, +49, etc.)',
      details: { validation: 'missing_country_code', phone: phoneNumber },
    };
  }

  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    console.error(`[TR API] Invalid PIN: must be exactly 4 digits`);
    return {
      error: 'Le PIN doit etre exactement 4 chiffres',
      details: { validation: 'invalid_pin', pinLength: pin?.length },
    };
  }

  try {
    console.log(`[TR API] Making request to: POST ${TR_API_HOST}/api/v1/auth/web/login`);
    console.log(`[TR API] Request body: { phoneNumber: "${phoneNumber}", pin: "****" }`);
    
    const response = await trRequest('/api/v1/auth/web/login', {
      phoneNumber,
      pin,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[TR API] Response received in ${elapsed}ms`);

    // Get raw response text first for debugging
    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(`[TR API] Failed to parse JSON response:`);
      console.error(`[TR API] Raw response: ${responseText.substring(0, 1000)}`);
      data = { rawResponse: responseText.substring(0, 500) };
    }

    // Log full response details
    console.log(`[TR API] ---------- RESPONSE DETAILS ----------`);
    console.log(`[TR API] HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`[TR API] Response Headers:`);
    response.headers.forEach((value, key) => {
      console.log(`[TR API]   ${key}: ${value}`);
    });
    console.log(`[TR API] Response Body:`, JSON.stringify(data, null, 2));
    console.log(`[TR API] ------------------------------------------`);

    if (!response.ok) {
      // Build detailed error message for debugging
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        message: data.message || data.error || data.errorMessage,
        code: data.errorCode || data.code,
        raw: JSON.stringify(data).substring(0, 500),
        timestamp: new Date().toISOString(),
        elapsed: `${elapsed}ms`,
      };
      
      console.error(`[TR API] ========== LOGIN FAILED ==========`);
      console.error(`[TR API] Error details:`, JSON.stringify(errorDetails, null, 2));

      // Map specific error cases to user-friendly messages
      if (response.status === 401) {
        const specificMsg = String(data.message || data.error || '').toLowerCase();
        let userError = ERROR_MESSAGES['INVALID_CREDENTIALS'];
        
        if (specificMsg.includes('phone') || specificMsg.includes('number')) {
          userError = ERROR_MESSAGES['INVALID_PHONE_NUMBER'];
        }
        
        console.error(`[TR API] Auth failed: ${userError}`);
        return { 
          error: `${userError} (Code: 401)`,
          details: errorDetails,
        };
      }
      
      if (response.status === 429) {
        console.error(`[TR API] Rate limited`);
        return { 
          error: ERROR_MESSAGES['RATE_LIMITED'],
          details: errorDetails,
        };
      }
      
      if (response.status === 400) {
        const msg = String(data.message || data.error || 'Bad Request');
        console.error(`[TR API] Bad request: ${msg}`);
        return { 
          error: `Requete invalide: ${msg}. Verifiez le format du numero (+33..., +49...).`,
          details: errorDetails,
        };
      }
      
      if (response.status === 403) {
        console.error(`[TR API] Access forbidden - possibly IP blocked`);
        return { 
          error: `${ERROR_MESSAGES['BLOCKED_IP']} (Code: 403)`,
          details: errorDetails,
        };
      }
      
      if (response.status === 404) {
        console.error(`[TR API] Endpoint not found`);
        return { 
          error: `Endpoint API non trouve. L'API Trade Republic a peut-etre change. (Code: 404)`,
          details: errorDetails,
        };
      }
      
      if (response.status >= 500) {
        console.error(`[TR API] Server error: ${response.status}`);
        return { 
          error: `Erreur serveur Trade Republic (${response.status}). Leurs serveurs sont peut-etre en maintenance.`,
          details: errorDetails,
        };
      }
      
      return { 
        error: `Erreur Trade Republic: ${data.message || data.error || response.statusText || `Code ${response.status}`}`,
        details: errorDetails,
      };
    }

    // Check for processId in response
    if (!data.processId) {
      console.error(`[TR API] ========== UNEXPECTED RESPONSE ==========`);
      console.error(`[TR API] No processId in successful response`);
      console.error(`[TR API] Data received:`, JSON.stringify(data, null, 2));
      
      return { 
        error: `Reponse inattendue de Trade Republic: pas de processId. Verifiez vos identifiants.`,
        details: { 
          unexpectedResponse: true,
          data: JSON.stringify(data).substring(0, 500),
        },
      };
    }

    // Store pending login for verification step
    pendingLogins.set(phoneNumber, {
      processId: data.processId as string,
      phoneNumber,
      pin,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    console.log(`[TR API] ========== LOGIN SUCCESS ==========`);
    console.log(`[TR API] ProcessId: ${data.processId}`);
    console.log(`[TR API] SMS should be sent to: ${phoneNumber}`);
    console.log(`[TR API] Countdown: ${data.countdownInSeconds || 60}s`);
    console.log(`[TR API] Note: Si vous ne recevez pas le SMS:`);
    console.log(`[TR API]   1. Verifiez que le numero est bien celui de votre compte TR`);
    console.log(`[TR API]   2. Verifiez que l'app TR n'est pas ouverte (conflit de session)`);
    console.log(`[TR API]   3. Attendez quelques minutes et reessayez`);

    return {
      processId: data.processId as string,
      countdownInSeconds: (data.countdownInSeconds as number) || 60,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'Unknown';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const elapsed = Date.now() - startTime;
    
    console.error(`[TR API] ========== EXCEPTION ==========`);
    console.error(`[TR API] Error name: ${errorName}`);
    console.error(`[TR API] Error message: ${errorMsg}`);
    console.error(`[TR API] Time elapsed: ${elapsed}ms`);
    if (errorStack) {
      console.error(`[TR API] Stack trace:`);
      console.error(errorStack);
    }
    
    if (errorName === 'AbortError') {
      return { 
        error: `Timeout - Trade Republic ne repond pas apres 30 secondes. Verifiez votre connexion.`,
        details: { timeout: true, elapsed: `${elapsed}ms`, message: errorMsg },
      };
    }
    
    // Check for network errors
    if (errorMsg.includes('fetch') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
      return { 
        error: `${ERROR_MESSAGES['NETWORK_ERROR']} (${errorMsg})`,
        details: { networkError: true, message: errorMsg },
      };
    }
    
    // Check for SSL/TLS errors
    if (errorMsg.includes('SSL') || errorMsg.includes('TLS') || errorMsg.includes('certificate')) {
      return { 
        error: `Erreur de securite SSL. Votre connexion pourrait etre bloquee.`,
        details: { sslError: true, message: errorMsg },
      };
    }
    
    return { 
      error: `Erreur inattendue: ${errorMsg}`,
      details: { message: errorMsg, stack: errorStack },
    };
  }
}

/**
 * Step 2: Verify device PIN (from SMS) and get session
 */
export async function verifyDevicePin(phoneNumber: string, devicePin: string): Promise<TRLoginVerifyResponse> {
  console.log(`[TR API] ========== VERIFY SMS CODE ==========`);
  console.log(`[TR API] Phone: ${phoneNumber}`);
  console.log(`[TR API] Code length: ${devicePin.length} (expected: 4)`);
  console.log(`[TR API] Timestamp: ${new Date().toISOString()}`);

  const pending = pendingLogins.get(phoneNumber);
  if (!pending) {
    console.error(`[TR API] No pending login found for ${phoneNumber}`);
    console.error(`[TR API] Available pending logins:`, Array.from(pendingLogins.keys()));
    return { 
      success: false, 
      error: 'Aucune connexion en cours. Vous devez d\'abord demander un code SMS.',
    };
  }

  const timeRemaining = pending.expiresAt - Date.now();
  console.log(`[TR API] Pending login found. ProcessId: ${pending.processId}`);
  console.log(`[TR API] Time remaining: ${Math.round(timeRemaining / 1000)}s`);

  if (pending.expiresAt < Date.now()) {
    pendingLogins.delete(phoneNumber);
    console.error(`[TR API] Pending login expired`);
    return { 
      success: false, 
      error: 'Le code a expire (validite: 5 minutes). Redemandez un nouveau code SMS.',
    };
  }

  try {
    const endpoint = `/api/v1/auth/web/login/${pending.processId}/${devicePin}`;
    console.log(`[TR API] Making request to: POST ${TR_API_HOST}${endpoint}`);
    
    const response = await trRequest(endpoint, undefined, 'POST');

    // Get raw response for debugging
    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log(`[TR API] Raw response (non-JSON): ${responseText.substring(0, 500)}`);
    }

    console.log(`[TR API] Response status: ${response.status} ${response.statusText}`);
    console.log(`[TR API] Response body:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error(`[TR API] ========== VERIFICATION FAILED ==========`);
      
      if (response.status === 401) {
        console.error(`[TR API] Invalid SMS code`);
        return { 
          success: false, 
          error: 'Code SMS incorrect. Verifiez le code recu et reessayez.',
        };
      }
      
      if (response.status === 429) {
        console.error(`[TR API] Rate limited`);
        return { 
          success: false, 
          error: 'Trop de tentatives. Attendez quelques minutes.',
        };
      }
      
      if (response.status === 410) {
        console.error(`[TR API] Code expired or already used`);
        pendingLogins.delete(phoneNumber);
        return { 
          success: false, 
          error: 'Ce code a expire ou a deja ete utilise. Demandez un nouveau code.',
        };
      }
      
      return { 
        success: false, 
        error: data.message as string || `Erreur de verification (${response.status})`,
      };
    }

    // Extract cookies from response
    const rawCookies: string[] = [];
    const setCookieHeader = response.headers.get('set-cookie');
    
    console.log(`[TR API] Extracting cookies from response...`);
    console.log(`[TR API] set-cookie header: ${setCookieHeader?.substring(0, 200) || 'none'}`);
    
    if (setCookieHeader) {
      // Parse multiple cookies (they might be comma-separated or in multiple headers)
      rawCookies.push(...setCookieHeader.split(/,(?=\s*[A-Za-z0-9_-]+=)/g));
    }

    // Also try getSetCookie if available (Node.js 18+)
    const headersAny = response.headers as { getSetCookie?: () => string[] };
    if (typeof headersAny.getSetCookie === 'function') {
      const cookies = headersAny.getSetCookie();
      console.log(`[TR API] getSetCookie() returned ${cookies.length} cookies`);
      if (cookies.length > 0) {
        rawCookies.length = 0;
        rawCookies.push(...cookies);
      }
    }

    console.log(`[TR API] Total cookies received: ${rawCookies.length}`);
    rawCookies.forEach((cookie, i) => {
      const name = cookie.split('=')[0];
      console.log(`[TR API]   Cookie ${i + 1}: ${name}=...`);
    });

    const trSessionToken = extractCookieValue(rawCookies, 'tr_session');
    const trRefreshToken = extractCookieValue(rawCookies, 'tr_refresh');

    if (!trSessionToken) {
      console.error(`[TR API] ========== SESSION TOKEN MISSING ==========`);
      console.error(`[TR API] No tr_session cookie found in response`);
      console.error(`[TR API] This might indicate:`);
      console.error(`[TR API]   - API response format has changed`);
      console.error(`[TR API]   - Additional verification step required`);
      console.error(`[TR API]   - Account issue on Trade Republic side`);
      
      return { 
        success: false, 
        error: 'Session non recue. Verifiez que votre compte Trade Republic est actif.',
      };
    }

    // Create session object
    const session: TRSession = {
      phoneNumber,
      trSessionToken,
      trRefreshToken,
      rawCookies,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
    };

    // Store session
    sessionStore.set(phoneNumber, session);
    pendingLogins.delete(phoneNumber);

    console.log(`[TR API] ========== VERIFICATION SUCCESS ==========`);
    console.log(`[TR API] Session created for ${phoneNumber}`);
    console.log(`[TR API] Session expires: ${new Date(session.expiresAt).toISOString()}`);
    console.log(`[TR API] Has refresh token: ${!!trRefreshToken}`);

    return { success: true, session };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    console.error(`[TR API] ========== VERIFICATION EXCEPTION ==========`);
    console.error(`[TR API] Error: ${errorName} - ${errorMsg}`);
    
    if (errorName === 'AbortError') {
      return { 
        success: false, 
        error: 'Timeout - Trade Republic ne repond pas. Verifiez votre connexion.',
      };
    }
    
    return { 
      success: false, 
      error: `Erreur de verification: ${errorMsg}`,
    };
  }
}

/**
 * Get stored session for a phone number
 */
export function getSession(phoneNumber: string): TRSession | null {
  const session = sessionStore.get(phoneNumber);
  if (!session) return null;

  // Check if expired
  if (session.expiresAt < Date.now()) {
    sessionStore.delete(phoneNumber);
    return null;
  }

  return session;
}

/**
 * Validate session is still active with Trade Republic
 */
export async function validateSession(session: TRSession): Promise<boolean> {
  try {
    const response = await trRequest(
      '/api/v1/auth/web/session',
      undefined,
      'GET',
      session.rawCookies
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clear session (logout)
 */
export function clearSession(phoneNumber: string): void {
  sessionStore.delete(phoneNumber);
  pendingLogins.delete(phoneNumber);
}

/**
 * Store session (for restoring from client)
 */
export function storeSession(session: TRSession): void {
  sessionStore.set(session.phoneNumber, session);
}

/**
 * Create WebSocket connection to Trade Republic
 */
export function createWebSocketConnection(session: TRSession): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TR_WS_HOST);

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('[TR WS] Connected');

      // Send connect message
      const connectMessage = JSON.stringify({ locale: 'en' });
      ws.send(`connect ${WS_CONNECT_VERSION} ${connectMessage}`);

      resolve(ws);
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('[TR WS] Error:', error);
      reject(error);
    });
  });
}

/**
 * Subscribe to a topic on the WebSocket
 */
export function subscribe(
  ws: WebSocket,
  session: TRSession,
  subscriptionId: number,
  message: { type: string; [key: string]: unknown }
): void {
  const payload = {
    token: session.trSessionToken,
    ...message,
  };
  ws.send(`sub ${subscriptionId} ${JSON.stringify(payload)}`);
}

/**
 * Unsubscribe from a topic
 */
export function unsubscribe(ws: WebSocket, subscriptionId: number): void {
  ws.send(`unsub ${subscriptionId}`);
}

/**
 * Create a message for subscription
 */
export function createMessage<T extends string>(
  type: T,
  data?: Record<string, unknown>
): { type: T; [key: string]: unknown } {
  return { type, ...data };
}

// Message types available
export const MessageTypes = {
  TICKER: 'ticker',
  PORTFOLIO: 'compactPortfolioByType',
  ORDERS: 'orders',
  CASH: 'cash',
  AVAILABLE_CASH: 'availableCash',
  WATCHLISTS: 'watchlists',
  INSTRUMENT: 'instrument',
  NEON_SEARCH: 'neonSearch',
  AGGREGATE_HISTORY: 'aggregateHistoryLight',
  TIMELINE: 'timelineTransactions',
} as const;
