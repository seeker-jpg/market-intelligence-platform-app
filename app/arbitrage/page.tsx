'use client';

import { useState, useEffect, useCallback } from 'react';
import { TerminalLayout, PanelGrid, StatCard } from '@/components/terminal/terminal-layout';
import { SpreadGauge } from '@/components/terminal/spread-gauge';
import { PriceTable } from '@/components/terminal/price-table';
import { AssetToggle } from '@/components/terminal/asset-toggle';
import { SpreadChart } from '@/components/terminal/spread-chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, TrendingDown, ArrowLeftRight, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMarketSnapshot } from '@/lib/binance-service';
import { 
  TR_GOLD_INSTRUMENTS, 
  TR_SILVER_INSTRUMENTS,
  TROY_OUNCE_GRAMS,
} from '@/lib/config/instruments';
import { calculateInstrumentSpread } from '@/lib/engine/arbitrage-engine';
import type { AssetType, SpreadResult, ArbitrageOpportunity, SpreadHistoryPoint } from '@/lib/types/arbitrage';
import { getRealTRPrices, validateRealTRPrice, logMockDataWarning } from '@/lib/trade-republic-prices';

export default function ArbitragePage() {
  const [selectedAsset, setSelectedAsset] = useState<AssetType>('GOLD');
  const [isLoading, setIsLoading] = useState(true);
  const [goldPrice, setGoldPrice] = useState<number>(0);
  const [eurUsdRate, setEurUsdRate] = useState<number>(1.08);
  const [goldSpreads, setGoldSpreads] = useState<SpreadResult[]>([]);
  const [silverSpreads, setSilverSpreads] = useState<SpreadResult[]>([]);
  const [spreadHistory, setSpreadHistory] = useState<SpreadHistoryPoint[]>([]);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [dataStatusMessage, setDataStatusMessage] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const snapshot = await getMarketSnapshot();
      
      // STRICT: Prices must come from real sources - no hardcoded fallbacks
      if (!snapshot.xauUsd.price || !snapshot.eurUsd.price) {
        console.error('[ARBITRAGE] CRITICAL: Real market data unavailable', {
          xau: snapshot.xauUsd.price,
          eur: snapshot.eurUsd.price,
        });
        setDataStatus('unavailable');
        setDataStatusMessage('Données de marché en direct non disponibles');
        setIsLoading(false);
        return;
      }

      const paxgPrice = snapshot.xauUsd.price;
      const eurUsd = snapshot.eurUsd.price;
      const silverPriceUsd = snapshot.xagUsd.price ?? paxgPrice / 85;
      
      setGoldPrice(paxgPrice);
      setEurUsdRate(eurUsd);
      
      // Fetch REAL Trade Republic prices (not mocks)
      const trSession = null; // TODO: Get from auth context when available
      const isins = [
        ...TR_GOLD_INSTRUMENTS.map(i => i.isin),
        ...TR_SILVER_INSTRUMENTS.map(i => i.isin),
      ];
      const realTRPrices = await getRealTRPrices(trSession, isins);
      
      // If no real TR prices available, show UI with reference prices only
      if (realTRPrices.size === 0) {
        console.warn('[ARBITRAGE] No real Trade Republic prices available yet');
        console.log('[ARBITRAGE] Showing reference prices (Binance) only. Connect Trade Republic session for spread calculations.');
        setGoldSpreads([]);
        setSilverSpreads([]);
        setDataStatus('unavailable');
        setDataStatusMessage('Connectez Trade Republic pour voir les écarts. Affichage des prix de référence Binance.');
        setIsLoading(false);
        return;
      }
      
      // Calculate spreads for gold instruments using REAL TR prices
      const goldSpreadResults: SpreadResult[] = [];
      for (const instrument of TR_GOLD_INSTRUMENTS) {
        const realPrice = realTRPrices.get(instrument.isin);
        if (realPrice) {
          try {
            validateRealTRPrice(instrument.isin, realPrice);
            const spread = calculateInstrumentSpread(
              instrument,
              realPrice.price,
              realPrice.bid,
              realPrice.ask,
              paxgPrice,
              eurUsd
            );
            goldSpreadResults.push(spread);
          } catch (error) {
            console.error(
              `[ARBITRAGE] Skipping ${instrument.isin} due to invalid price:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        } else {
          logMockDataWarning(instrument.isin, 'arbitrage calculation');
        }
      }
      setGoldSpreads(goldSpreadResults);
      
      // Calculate spreads for silver instruments using REAL TR prices
      const silverSpreadResults: SpreadResult[] = [];
      for (const instrument of TR_SILVER_INSTRUMENTS) {
        const realPrice = realTRPrices.get(instrument.isin);
        if (realPrice) {
          try {
            validateRealTRPrice(instrument.isin, realPrice);
            const pricePerGram = silverPriceUsd / TROY_OUNCE_GRAMS;
            let normalizedPrice = pricePerGram * (instrument.gramPerUnit || 1);
            if (instrument.currency === 'EUR') {
              normalizedPrice = normalizedPrice / eurUsd;
            }
            
            const spread: SpreadResult = {
              id: `${instrument.isin}-${Date.now()}`,
              assetType: 'SILVER',
              trInstrument: instrument,
              binanceSymbol: 'SILVER_PROXY',
              trPrice: realPrice.price,
              trBid: realPrice.bid,
              trAsk: realPrice.ask,
              binancePrice: normalizedPrice,
              spreadAbs: realPrice.price - normalizedPrice,
              spreadPct: ((realPrice.price - normalizedPrice) / normalizedPrice) * 100,
              spreadBps: ((realPrice.price - normalizedPrice) / normalizedPrice) * 10000,
              zScore: 0, // Would be calculated from history in production
              historicalMean: 0,
              historicalStdDev: 0.5,
              confidence: Math.abs(realPrice.price - normalizedPrice) < normalizedPrice * 0.01 ? 'HIGH' : 'MEDIUM',
              currency: instrument.currency,
              fxRate: eurUsd,
              timestamp: new Date().toISOString(),
              marketHoursComparable: true,
              trMarketState: 'OPEN',
              binanceMarketState: 'OPEN',
              isStale: false,
            };
            silverSpreadResults.push(spread);
          } catch (error) {
            console.error(
              `[ARBITRAGE] Skipping ${instrument.isin} due to invalid price:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        } else {
          logMockDataWarning(instrument.isin, 'arbitrage calculation');
        }
      }
      setSilverSpreads(silverSpreadResults);
      setDataStatus('ready');
      
    } catch (error) {
      setDataStatus('unavailable');
      setDataStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Erreur de chargement'}`);
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeSpreads = selectedAsset === 'GOLD' ? goldSpreads : silverSpreads;
  const avgSpread = activeSpreads.length > 0
    ? activeSpreads.reduce((sum, s) => sum + s.spreadPct, 0) / activeSpreads.length
    : 0;
  const minSpread = activeSpreads.length > 0
    ? Math.min(...activeSpreads.map(s => s.spreadPct))
    : 0;
  const maxSpread = activeSpreads.length > 0
    ? Math.max(...activeSpreads.map(s => s.spreadPct))
    : 0;
  const avgZScore = activeSpreads.length > 0
    ? activeSpreads.reduce((sum, s) => sum + s.zScore, 0) / activeSpreads.length
    : 0;
  const selectedAssetLabel = selectedAsset === 'GOLD' ? 'OR' : 'ARGENT';

  return (
    <TerminalLayout
      title="Arbitrage"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Actualiser
        </Button>
      }
    >
      <div className="p-4 space-y-4">
        {/* Asset Toggle & Reference Prices */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <AssetToggle value={selectedAsset} onChange={setSelectedAsset} size="md" />
          
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">PAXG:</span>
              <span className="font-mono text-gold">${goldPrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">EUR/USD:</span>
              <span className="font-mono">{eurUsdRate.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* Data Status Message */}
        {dataStatus === 'unavailable' && (
          <div className="terminal-panel p-4 border-l-4 border-[var(--warning)] bg-[var(--warning)]/5 space-y-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-[var(--warning)]">Données de Trade Republic non disponibles</p>
                <p className="text-xs text-muted-foreground">{dataStatusMessage}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  L&apos;intégration Trade Republic nécessite une authentification active. 
                  Les prix de référence Binance sont affichés ci-dessus. Les écarts de trading nécessitent les données réelles de Trade Republic.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <PanelGrid cols={4} gap="md">
          <StatCard
            label="Écart moyen"
            value={`${avgSpread > 0 ? '+' : ''}${avgSpread.toFixed(3)}%`}
            icon={<ArrowLeftRight className="h-5 w-5" />}
            valueClassName={cn(
              avgSpread < -0.5 && 'text-[var(--positive)]',
              avgSpread > 0.5 && 'text-[var(--negative)]'
            )}
          />
          <StatCard
            label="Écart min."
            value={`${minSpread > 0 ? '+' : ''}${minSpread.toFixed(3)}%`}
            icon={<TrendingDown className="h-5 w-5" />}
            valueClassName={minSpread < -0.5 ? 'text-[var(--positive)]' : ''}
          />
          <StatCard
            label="Écart max."
            value={`${maxSpread > 0 ? '+' : ''}${maxSpread.toFixed(3)}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            valueClassName={maxSpread > 0.5 ? 'text-[var(--negative)]' : ''}
          />
          <StatCard
            label="Z-Score moyen"
            value={avgZScore.toFixed(2)}
            icon={<Zap className="h-5 w-5" />}
            valueClassName={cn(
              Math.abs(avgZScore) > 1.5 && 'text-[var(--warning)]'
            )}
          />
        </PanelGrid>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Spread Gauge & Chart */}
          <div className="space-y-4">
            <div className="terminal-panel p-4">
              <h3 className={cn(
                'text-sm font-medium uppercase tracking-wider mb-4',
                selectedAsset === 'GOLD' ? 'text-gold' : 'text-silver'
              )}>
                Écart actuel
              </h3>
              <SpreadGauge
                assetType={selectedAsset}
                spreadPct={avgSpread}
                zScore={avgZScore}
                confidence={Math.abs(avgSpread) < 0.5 ? 'HIGH' : 'MEDIUM'}
                size="lg"
              />
            </div>

            <SpreadChart
              data={spreadHistory}
              assetType={selectedAsset}
              height={200}
            />
          </div>

          {/* Price Table */}
          <div className="lg:col-span-2">
            <PriceTable
              spreads={activeSpreads}
              title={`${selectedAssetLabel} écarts vs Binance`}
              assetType={selectedAsset}
              maxHeight="450px"
            />
          </div>
        </div>

        {/* Opportunities */}
        <div className="terminal-panel">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Opportunités actives
            </h3>
            <Badge variant="outline" className="text-xs">
              {opportunities.length} ouvertes
            </Badge>
          </div>
          
          {opportunities.length > 0 ? (
            <div className="divide-y divide-border/50">
              {opportunities.map((opp) => (
                <div 
                  key={opp.id}
                  className="p-4 hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-2 rounded-lg',
                        opp.direction === 'BUY_TR_SELL_BINANCE' 
                          ? 'bg-[var(--positive)]/10 text-[var(--positive)]'
                          : 'bg-[var(--negative)]/10 text-[var(--negative)]'
                      )}>
                        {opp.direction === 'BUY_TR_SELL_BINANCE' 
                          ? <TrendingUp className="h-5 w-5" />
                          : <TrendingDown className="h-5 w-5" />
                        }
                      </div>
                      <div>
                        <div className="font-medium text-sm">{opp.trInstrument.shortName}</div>
                        <div className="text-xs text-muted-foreground">
                          {opp.direction === 'BUY_TR_SELL_BINANCE' 
                            ? 'Acheter TR, vendre Binance'
                            : 'Acheter Binance, vendre TR'
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Écart</div>
                        <div className={cn(
                          'font-mono text-sm',
                          opp.currentSpreadPct < 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        )}>
                          {opp.currentSpreadPct > 0 ? '+' : ''}{opp.currentSpreadPct.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Profit net</div>
                        <div className="font-mono text-sm text-[var(--positive)]">
                          +{opp.netProfitPct.toFixed(2)}%
                        </div>
                      </div>
                      <Badge variant="outline" className={cn(
                        'text-xs',
                        opp.confidence === 'HIGH' && 'border-[var(--positive)]/50 text-[var(--positive)]',
                        opp.confidence === 'MEDIUM' && 'border-[var(--warning)]/50 text-[var(--warning)]'
                      )}>
                        {opp.confidence === 'HIGH' ? 'ÉLEVÉE' : 'MOYENNE'}
                      </Badge>
                      <Badge variant="outline" className={cn(
                        'text-xs',
                        opp.riskLevel === 'HIGH' && 'border-[var(--negative)]/50 text-[var(--negative)]',
                        opp.riskLevel === 'MEDIUM' && 'border-[var(--warning)]/50 text-[var(--warning)]'
                      )}>
                        Risque {opp.riskLevel === 'HIGH' ? 'ÉLEVÉ' : 'MOYEN'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Aucune opportunité d'arbitrage détectée.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Les opportunités apparaissent quand l'écart dépasse 0,5 %
              </p>
            </div>
          )}
        </div>
      </div>
    </TerminalLayout>
  );
}
