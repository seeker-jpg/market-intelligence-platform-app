'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/lib/branding';
import { Lock, Phone, CheckCircle, MessageSquare, ArrowLeft, TrendingUp, Bug, Loader2, AlertTriangle, Copy, Check } from 'lucide-react';

interface DebugInfo {
  processId?: string;
  logs: string[];
}

interface ErrorDetails {
  status?: number;
  statusText?: string;
  message?: string;
  code?: string;
  raw?: string;
  debug?: {
    timestamp?: string;
    phone?: string;
    apiHost?: string;
  };
}

export function AuthForm() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [trPin, setTrPin] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingSession, setExistingSession] = useState<{ phone: string; lastUsed: string } | null>(null);
  const [step, setStep] = useState<'phone' | 'sms'>('phone');
  const [isMounted, setIsMounted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ logs: [] });
  const [showDebug, setShowDebug] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    loadExistingSession();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const loadExistingSession = async () => {
    try {
      const stored = localStorage.getItem('tradeSession');
      if (stored) {
        const session = JSON.parse(stored);
        const storedPhone = session.phoneNumber;
        
        if (storedPhone && storedPhone !== 'guest') {
          setPhoneNumber(storedPhone);
          const date = new Date(session.timestamp);
          const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
          
          setExistingSession({
            phone: storedPhone,
            lastUsed: formattedDate,
          });

          const params = new URLSearchParams({ phone: storedPhone });
          const response = await fetch(`/api/auth/sms?${params}`);
          const data = await response.json();
          
          if (!data.hasSession) {
            setExistingSession(null);
          }
        }
      }
    } catch (error) {
      console.error('[AuthForm] Failed to load session:', error);
    }
  };

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-29), `[${timestamp}] ${message}`]
    }));
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetails(null);
    setIsLoading(true);
    addDebugLog(`Initiation connexion Trade Republic: ${phoneNumber}`);

    try {
      if (!phoneNumber) {
        setError('Numero de telephone requis');
        setIsLoading(false);
        return;
      }

      if (!trPin || trPin.length !== 4) {
        setError('PIN Trade Republic requis (4 chiffres)');
        setIsLoading(false);
        return;
      }

      addDebugLog(`Appel API: POST /api/auth/sms`);
      addDebugLog(`Phone: ${phoneNumber}, PIN: ****`);
      
      const response = await fetch('/api/auth/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneNumber,
          pin: trPin,
        }),
      });

      const data = await response.json();
      addDebugLog(`HTTP Status: ${response.status} ${response.statusText}`);
      addDebugLog(`Response: ${JSON.stringify(data).substring(0, 500)}`);

      if (!response.ok || !data.success) {
        const errMsg = data.error || 'Erreur lors de l\'envoi';
        setError(errMsg);
        
        // Store detailed error info
        if (data.details || data.debug) {
          setErrorDetails({
            ...data.details,
            debug: data.debug,
          });
          addDebugLog(`Details: ${JSON.stringify(data.details || {})}`);
        }
        
        addDebugLog(`ERREUR: ${errMsg}`);
        setIsLoading(false);
        return;
      }

      setDebugInfo(prev => ({
        ...prev,
        processId: data.processId,
      }));

      addDebugLog(`SMS Trade Republic envoye (processId: ${data.processId})`);
      setCountdown(data.countdownInSeconds || 60);
      setStep('sms');
      addDebugLog('En attente du code SMS...');

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erreur reseau';
      setError(`Erreur de connexion: ${errMsg}`);
      setErrorDetails({ message: errMsg });
      addDebugLog(`ERREUR RESEAU: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySms = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    addDebugLog(`Verification code SMS: ${smsCode}`);

    try {
      if (!smsCode || smsCode.length !== 4) {
        setError('Code SMS requis (4 chiffres)');
        setIsLoading(false);
        return;
      }

      addDebugLog('Appel API: PUT /api/auth/sms');
      const response = await fetch('/api/auth/sms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneNumber, 
          code: smsCode,
        }),
      });

      const data = await response.json();
      addDebugLog(`Reponse: ${response.status} - ${JSON.stringify(data)}`);

      if (!response.ok || !data.success) {
        setError(data.error || 'Code invalide');
        addDebugLog(`ERREUR: ${data.error}`);
        setIsLoading(false);
        return;
      }

      addDebugLog('Verification reussie! Creation session...');

      const sessionResponse = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneNumber,
          sessionId: `session_${Date.now()}`,
        }),
      });

      if (!sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        setError(sessionData.error || 'Erreur session');
        addDebugLog(`ERREUR SESSION: ${sessionData.error}`);
        setIsLoading(false);
        return;
      }

      localStorage.setItem('tradeSession', JSON.stringify({
        phoneNumber,
        timestamp: new Date().toISOString(),
      }));

      addDebugLog('Session creee, redirection vers dashboard...');
      router.push('/dashboard');

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erreur reseau';
      setError(errMsg);
      addDebugLog(`ERREUR: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipTradeRepublic = () => {
    localStorage.setItem('tradeSession', JSON.stringify({
      phoneNumber: 'guest',
      timestamp: new Date().toISOString(),
      guestMode: true,
    }));
    router.push('/dashboard');
  };

  const handleResumeSession = async () => {
    if (!existingSession?.phone) return;
    
    setIsLoading(true);
    addDebugLog(`Reprise session: ${existingSession.phone}`);
    
    try {
      const params = new URLSearchParams({ phone: existingSession.phone });
      const response = await fetch(`/api/auth/sms?${params}`);
      const data = await response.json();
      
      if (data.hasSession) {
        addDebugLog('Session valide, redirection...');
        router.push('/dashboard');
      } else {
        setError('Session expiree, reconnexion necessaire');
        setExistingSession(null);
        localStorage.removeItem('tradeSession');
        addDebugLog('Session expiree');
      }
    } catch {
      setError('Erreur de reprise de session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendSms = () => {
    if (countdown > 0) return;
    setStep('phone');
    setSmsCode('');
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-background">
      <Card className="w-full max-w-md">
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">
              {step === 'phone' 
                ? 'Connectez-vous avec Trade Republic' 
                : 'Entrez le code recu par SMS'}
            </p>
          </div>

          {/* Step 1: Phone + PIN */}
          {step === 'phone' && (
            <form onSubmit={handleSendSms} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Numero de telephone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="+33 6 12 34 56 78"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Format international (+33 pour France, +49 pour Allemagne)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">PIN Trade Republic</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="****"
                    value={trPin}
                    onChange={(e) => setTrPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="pl-10 text-center tracking-widest font-mono"
                    maxLength={4}
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Votre PIN de connexion Trade Republic (4 chiffres)
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                  {errorDetails && (
                    <div className="text-xs text-destructive/80 space-y-1 pl-6">
                      {errorDetails.status && (
                        <p>Code HTTP: {errorDetails.status} {errorDetails.statusText}</p>
                      )}
                      {errorDetails.code && (
                        <p>Code erreur: {errorDetails.code}</p>
                      )}
                      {errorDetails.message && errorDetails.message !== error && (
                        <p>Details: {String(errorDetails.message)}</p>
                      )}
                      <div className="pt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const text = JSON.stringify(errorDetails, null, 2);
                            navigator.clipboard.writeText(text);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? (
                            <><Check className="w-3 h-3 mr-1" />Copie!</>
                          ) : (
                            <><Copy className="w-3 h-3 mr-1" />Copier les details</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Helpful tips */}
              <div className="p-3 rounded-lg bg-muted/50 border border-muted text-xs space-y-1">
                <p className="font-medium text-foreground">Conseils de connexion:</p>
                <ul className="text-muted-foreground space-y-0.5 list-disc pl-4">
                  <li>Fermez l'app Trade Republic si elle est ouverte</li>
                  <li>Utilisez le format international: +33612345678</li>
                  <li>Le PIN est celui de 4 chiffres de votre compte TR</li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !phoneNumber || trPin.length !== 4}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion a Trade Republic...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Recevoir le code SMS
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Step 2: SMS Code Verification */}
          {step === 'sms' && (
            <form onSubmit={handleVerifySms} className="space-y-4">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-primary">
                  Un SMS a ete envoye au {phoneNumber}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Entrez le code de verification recu de Trade Republic
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Code SMS</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="****"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="pl-10 text-center text-xl tracking-widest font-mono"
                    maxLength={4}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                </div>
              )}

              {/* SMS Tips */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                <p className="font-medium text-amber-700 dark:text-amber-400">Vous n'avez pas recu le SMS?</p>
                <ul className="text-amber-600/80 dark:text-amber-400/80 space-y-0.5 list-disc pl-4">
                  <li>Verifiez que le numero correspond a votre compte TR</li>
                  <li>L'app Trade Republic doit etre fermee</li>
                  <li>Attendez jusqu'a 2 minutes pour recevoir le SMS</li>
                  <li>Verifiez vos SMS/messages (pas les notifications)</li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || smsCode.length !== 4}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verification...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Verifier le code
                  </>
                )}
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep('phone');
                    setSmsCode('');
                    setError('');
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleResendSms}
                  disabled={countdown > 0 || isLoading}
                >
                  {countdown > 0 ? `Renvoyer (${countdown}s)` : 'Renvoyer SMS'}
                </Button>
              </div>
            </form>
          )}

          {/* Existing session */}
          {isMounted && existingSession && step === 'phone' && (
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Session existante</p>
                  <p className="text-xs text-muted-foreground">
                    {existingSession.phone} - {existingSession.lastUsed}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={handleResumeSession}
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Reprendre la session
              </Button>
            </div>
          )}

          {/* Skip option */}
          {step === 'phone' && (
            <div className="pt-4 border-t border-border space-y-3">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleSkipTradeRepublic}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Continuer sans Trade Republic
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Acces limite aux donnees Binance uniquement
              </p>
            </div>
          )}

          {/* Debug toggle */}
          <div className="pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => setShowDebug(!showDebug)}
            >
              <Bug className="w-4 h-4 mr-2" />
              {showDebug ? 'Masquer' : 'Afficher'} les logs
            </Button>
          </div>
        </div>
      </Card>

      {/* Debug Panel */}
      {showDebug && (
        <Card className="w-full max-w-md mt-4">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Console Debug - Trade Republic API
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebugInfo({ logs: [] })}
              >
                Effacer
              </Button>
            </div>

            {/* Process ID */}
            {debugInfo.processId && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                <span className="font-medium">processId:</span> {debugInfo.processId}
                <p className="text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                  SMS envoye - Verifiez vos messages!
                </p>
              </div>
            )}

            {/* Error Details */}
            {errorDetails && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs space-y-2">
                <p className="font-medium text-red-600 dark:text-red-400">Derniere erreur:</p>
                <pre className="font-mono text-red-600/80 dark:text-red-400/80 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
                  {JSON.stringify(errorDetails, null, 2)}
                </pre>
              </div>
            )}

            {/* Logs */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Logs ({debugInfo.logs.length})</p>
              <div className="bg-black/50 dark:bg-black/30 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1 border border-border">
                {debugInfo.logs.length === 0 ? (
                  <p className="text-muted-foreground italic">En attente d'une action...</p>
                ) : (
                  debugInfo.logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`${
                        log.includes('ERREUR') || log.includes('Error')
                          ? 'text-red-400' 
                          : log.includes('reussie') || log.includes('succes') || log.includes('SUCCESS')
                            ? 'text-emerald-400'
                            : log.includes('SMS') || log.includes('envoye')
                              ? 'text-blue-400'
                              : 'text-gray-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
              <p className="font-medium text-amber-700 dark:text-amber-400">Problemes courants:</p>
              <ul className="text-amber-600/80 dark:text-amber-400/80 space-y-1 list-disc pl-4">
                <li><strong>401 Unauthorized:</strong> PIN ou numero incorrect</li>
                <li><strong>403 Forbidden:</strong> IP bloquee (VPN, datacenter)</li>
                <li><strong>429 Too Many Requests:</strong> Attendez quelques minutes</li>
                <li><strong>Timeout:</strong> Probleme reseau ou serveur TR</li>
                <li><strong>Pas de SMS:</strong> Fermez l'app TR et reessayez</li>
              </ul>
            </div>

            {/* API Info */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <p className="font-medium">Trade Republic API Endpoints</p>
              <div className="space-y-1 text-muted-foreground font-mono text-[10px]">
                <p>Step 1: POST api.traderepublic.com/api/v1/auth/web/login</p>
                <p>Step 2: POST api.traderepublic.com/api/v1/auth/web/login/{'{processId}'}/{'{code}'}</p>
              </div>
              <p className="text-muted-foreground mt-2">
                Pour voir les logs serveur detailles, ouvrez la console du navigateur (F12) 
                et regardez les requetes reseau.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
