import { NextRequest, NextResponse } from 'next/server';
import { 
  initiateLogin, 
  verifyDevicePin, 
  getSession, 
} from '@/lib/trade-republic-api';

/**
 * POST /api/auth/sms
 * Step 1: Initiate login - calls Trade Republic API to send SMS
 * 
 * Body: { phone: string, pin: string }
 * 
 * IMPORTANT: Trade Republic peut bloquer les requetes depuis certaines IPs
 * (datacenters, VPNs). Les logs serveur donnent plus de details.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  console.log(`[SMS API] ========== NEW LOGIN REQUEST ==========`);
  console.log(`[SMS API] Timestamp: ${new Date().toISOString()}`);
  
  try {
    const body = await request.json();
    const { phone, pin } = body;

    console.log(`[SMS API] Received: phone=${phone ? phone.substring(0, 6) + '***' : 'null'}, pin=${pin ? '****' : 'null'}`);

    if (!phone) {
      console.log(`[SMS API] Error: Missing phone`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Numero de telephone requis',
          details: { validation: 'missing_phone' }
        },
        { status: 400 }
      );
    }

    if (!pin) {
      console.log(`[SMS API] Error: Missing PIN`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'PIN Trade Republic requis (4 chiffres)',
          details: { validation: 'missing_pin' }
        },
        { status: 400 }
      );
    }

    // Validate phone format
    const cleanPhone = phone.replace(/\s/g, '');
    
    if (!cleanPhone.startsWith('+')) {
      console.log(`[SMS API] Error: Phone missing country code`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Le numero doit commencer par un indicatif pays (+33 pour France, +49 pour Allemagne)',
          details: { validation: 'missing_country_code', phone: cleanPhone }
        },
        { status: 400 }
      );
    }

    const phoneRegex = /^\+[0-9]{10,15}$/;
    if (!phoneRegex.test(cleanPhone)) {
      console.log(`[SMS API] Error: Invalid phone format`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Format de numero invalide. Exemple: +33612345678 ou +4915123456789',
          details: { validation: 'invalid_phone_format', phone: cleanPhone }
        },
        { status: 400 }
      );
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      console.log(`[SMS API] Error: Invalid PIN format`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Le PIN doit etre exactement 4 chiffres',
          details: { validation: 'invalid_pin_format', pinLength: pin.length }
        },
        { status: 400 }
      );
    }

    // Call Trade Republic API
    console.log(`[SMS API] Calling initiateLogin for ${cleanPhone}`);
    const result = await initiateLogin(cleanPhone, pin);
    
    const elapsed = Date.now() - startTime;
    console.log(`[SMS API] initiateLogin completed in ${elapsed}ms`);
    console.log(`[SMS API] Result:`, { 
      hasProcessId: !!result.processId, 
      hasError: !!result.error,
      error: result.error,
    });

    if (result.error) {
      console.log(`[SMS API] ========== LOGIN FAILED ==========`);
      console.log(`[SMS API] Error: ${result.error}`);
      if (result.details) {
        console.log(`[SMS API] Details:`, JSON.stringify(result.details, null, 2));
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          details: result.details,
          debug: {
            timestamp: new Date().toISOString(),
            phone: cleanPhone,
            apiHost: 'api.traderepublic.com',
            elapsed: `${elapsed}ms`,
          }
        },
        { status: 400 }
      );
    }

    console.log(`[SMS API] ========== LOGIN SUCCESS ==========`);
    console.log(`[SMS API] ProcessId: ${result.processId}`);
    console.log(`[SMS API] SMS devrait etre envoye a: ${cleanPhone}`);

    return NextResponse.json({
      success: true,
      message: 'SMS envoye par Trade Republic. Verifiez vos messages!',
      processId: result.processId,
      countdownInSeconds: result.countdownInSeconds || 60,
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`[SMS API] ========== EXCEPTION ==========`);
    console.error(`[SMS API] Error: ${errorMsg}`);
    console.error(`[SMS API] Elapsed: ${elapsed}ms`);
    if (errorStack) {
      console.error(`[SMS API] Stack:`, errorStack);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Erreur lors de l'envoi du SMS: ${errorMsg}`,
        details: {
          exception: errorMsg,
          elapsed: `${elapsed}ms`,
        }
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/sms
 * Step 2: Verify the device PIN received by SMS
 * 
 * Body: { phone: string, code: string }
 */
export async function PUT(request: NextRequest) {
  const startTime = Date.now();
  
  console.log(`[SMS API] ========== VERIFY SMS CODE ==========`);
  console.log(`[SMS API] Timestamp: ${new Date().toISOString()}`);
  
  try {
    const body = await request.json();
    const { phone, code } = body;

    console.log(`[SMS API] Received: phone=${phone ? phone.substring(0, 6) + '***' : 'null'}, code=${code ? '****' : 'null'}`);

    if (!phone || !code) {
      console.log(`[SMS API] Error: Missing phone or code`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Numero et code SMS requis',
          details: { validation: 'missing_fields' }
        },
        { status: 400 }
      );
    }

    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      console.log(`[SMS API] Error: Invalid code format`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Le code SMS doit etre exactement 4 chiffres',
          details: { validation: 'invalid_code_format', codeLength: code.length }
        },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/\s/g, '');

    // Verify with Trade Republic
    console.log(`[SMS API] Calling verifyDevicePin`);
    const result = await verifyDevicePin(cleanPhone, code);
    
    const elapsed = Date.now() - startTime;
    console.log(`[SMS API] verifyDevicePin completed in ${elapsed}ms`);

    if (!result.success) {
      console.log(`[SMS API] ========== VERIFICATION FAILED ==========`);
      console.log(`[SMS API] Error: ${result.error}`);
      
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          details: {
            elapsed: `${elapsed}ms`,
          }
        },
        { status: 401 }
      );
    }

    console.log(`[SMS API] ========== VERIFICATION SUCCESS ==========`);
    console.log(`[SMS API] Session created for: ${result.session?.phoneNumber}`);

    return NextResponse.json({
      success: true,
      message: 'Connexion Trade Republic reussie!',
      session: {
        phoneNumber: result.session?.phoneNumber,
        expiresAt: result.session?.expiresAt,
      },
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    console.error(`[SMS API] ========== VERIFICATION EXCEPTION ==========`);
    console.error(`[SMS API] Error: ${errorMsg}`);
    console.error(`[SMS API] Elapsed: ${elapsed}ms`);
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Erreur de verification: ${errorMsg}`,
        details: {
          exception: errorMsg,
          elapsed: `${elapsed}ms`,
        }
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/sms
 * Check if there's a valid session for the phone number
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Numero requis' },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/\s/g, '');
    const session = getSession(cleanPhone);

    if (!session) {
      return NextResponse.json({
        success: false,
        hasSession: false,
      });
    }

    return NextResponse.json({
      success: true,
      hasSession: true,
      expiresAt: session.expiresAt,
    });

  } catch (error) {
    console.error('[SMS API] Session check error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur de verification de session' },
      { status: 500 }
    );
  }
}
