'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertCircle, CheckCircle, Moon, Sun, HelpCircle } from 'lucide-react';
import type { MarketState } from '@/lib/types/arbitrage';
import {
  getTRMarketState,
  getMarketStatusText,
  areMarketsComparable,
  isWeekendGapPeriod,
} from '@/lib/services/market-hours';
import { GERMAN_EXCHANGES } from '@/lib/config/instruments';

/**
 * Determine if a German exchange is currently open given CET time
 */
function getExchangeState(
  openTime: string,
  closeTime: string,
  nowCET: Date
): 'open' | 'closed' | 'pre' {
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const nowMin = nowCET.getHours() * 60 + nowCET.getMinutes();
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const day = nowCET.getDay();
  if (day === 0 || day === 6) return 'closed';
  if (nowMin < openMin) return 'pre';
  if (nowMin >= closeMin) return 'closed';
  return 'open';
}

interface MarketStatusProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

function getStateIcon(state: MarketState) {
  switch (state) {
    case 'OPEN':
      return <CheckCircle className="h-4 w-4 text-[var(--positive)]" />;
    case 'CLOSED':
      return <Moon className="h-4 w-4 text-muted-foreground" />;
    case 'PRE_MARKET':
    case 'AFTER_HOURS':
      return <Sun className="h-4 w-4 text-[var(--warning)]" />;
  }
}

function getStateColor(state: MarketState): string {
  switch (state) {
    case 'OPEN':
      return 'text-[var(--positive)]';
    case 'CLOSED':
      return 'text-muted-foreground';
    case 'PRE_MARKET':
    case 'AFTER_HOURS':
      return 'text-[var(--warning)]';
  }
}

export function MarketStatus({ className, showDetails = false, compact = false }: MarketStatusProps) {
  const [trState, setTrState] = useState<MarketState>('CLOSED');
  const [statusText, setStatusText] = useState('');
  const [isComparable, setIsComparable] = useState(false);
  const [isWeekendGap, setIsWeekendGap] = useState(false);
  const [currentTime, setCurrentTime] = useState<string | null>(null);
  const [cetTime, setCetTime] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [exchangeStates, setExchangeStates] = useState<Record<string, 'open' | 'closed' | 'pre'>>({});

  useEffect(() => {
    setIsMounted(true);

    const updateStatus = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR'));
      // CET time string
      setCetTime(
        now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setTrState(getTRMarketState(now));
      setStatusText(getMarketStatusText(now));
      setIsComparable(areMarketsComparable(now).comparable);
      setIsWeekendGap(isWeekendGapPeriod(now));

      // Compute CET date for exchange state checks
      const cetDateStr = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
      const cetDate = new Date(cetDateStr);
      const states: Record<string, 'open' | 'closed' | 'pre'> = {};
      for (const ex of GERMAN_EXCHANGES) {
        states[ex.id] = getExchangeState(ex.open, ex.close, cetDate);
      }
      setExchangeStates(states);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const trStateLabel =
    trState === 'OPEN'
      ? 'OUVERT'
      : trState === 'CLOSED'
      ? 'FERMÉ'
      : trState === 'PRE_MARKET'
      ? 'PRÉ-OUVERTURE'
      : 'HORS SÉANCE';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {getStateIcon(trState)}
        <span className={cn('text-xs font-medium', getStateColor(trState))}>
          {trStateLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('terminal-panel', className)}>
      <div className="terminal-panel-header">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="terminal-panel-title">Marchés</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {isMounted && cetTime ? `${cetTime} CET` : '--:--:--'}
        </span>
      </div>

      <div className="terminal-panel-content space-y-2">
        {/* German Exchanges */}
        {GERMAN_EXCHANGES.map((ex) => {
          const state = exchangeStates[ex.id] ?? 'closed';
          return (
            <div key={ex.id} className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm">{ex.shortName}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {ex.open}–{ex.close}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {ex.status === 'to-verify' ? (
                  <>
                    <HelpCircle className="h-3.5 w-3.5 text-[var(--warning)]" />
                    <span className="text-xs text-[var(--warning)]">À VÉRIFIER</span>
                  </>
                ) : state === 'open' ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-[var(--positive)]" />
                    <span className="text-xs font-medium text-[var(--positive)]">OUVERT</span>
                  </>
                ) : state === 'pre' ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-[var(--warning)]" />
                    <span className="text-xs font-medium text-[var(--warning)]">PRÉ</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">FERMÉ</span>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Divider */}
        <div className="border-t border-border-subtle pt-2 space-y-2">
          {/* Binance Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Binance</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-[var(--positive)]" />
              <span className="text-xs font-medium text-[var(--positive)]">24/7</span>
            </div>
          </div>

          {/* Yahoo Finance Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Yahoo Finance</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-[var(--positive)]" />
              <span className="text-xs font-medium text-[var(--positive)]">XAG / SI=F</span>
            </div>
          </div>
        </div>

        {/* Comparability */}
        <div className="pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <span className="text-sm">Prix comparables</span>
            {isComparable ? (
              <span className="text-sm font-medium text-[var(--positive)]">OUI</span>
            ) : (
              <span className="text-sm font-medium text-[var(--negative)]">NON</span>
            )}
          </div>
        </div>

        {showDetails && (
          <>
            <div className="text-xs text-muted-foreground pt-2 border-t border-border-subtle">
              {statusText}
            </div>

            {isWeekendGap && (
              <div className="flex items-center gap-2 p-2 rounded bg-[var(--warning)]/10 text-[var(--warning)]">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs">
                  Période de gap week-end – surveiller les écarts à l&apos;ouverture
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface MarketStatusBadgeProps {
  className?: string;
}

export function MarketStatusBadge({ className }: MarketStatusBadgeProps) {
  const [trState, setTrState] = useState<MarketState>('CLOSED');
  
  useEffect(() => {
    const updateStatus = () => {
      setTrState(getTRMarketState());
    };
    
    updateStatus();
    const interval = setInterval(updateStatus, 10000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
        trState === 'OPEN' && 'bg-[var(--positive)]/20 text-[var(--positive)]',
        trState === 'CLOSED' && 'bg-muted text-muted-foreground',
        (trState === 'PRE_MARKET' || trState === 'AFTER_HOURS') && 'bg-[var(--warning)]/20 text-[var(--warning)]',
        className
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          trState === 'OPEN' && 'bg-[var(--positive)]',
          trState === 'CLOSED' && 'bg-muted-foreground',
          (trState === 'PRE_MARKET' || trState === 'AFTER_HOURS') && 'bg-[var(--warning)] animate-pulse'
        )}
      />
      {trState === 'OPEN' && 'Marché ouvert'}
      {trState === 'CLOSED' && 'Marché fermé'}
      {trState === 'PRE_MARKET' && 'Pré-ouverture'}
      {trState === 'AFTER_HOURS' && 'Hors séance'}
    </div>
  );
}
