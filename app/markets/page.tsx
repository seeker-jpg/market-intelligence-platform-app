'use client';

import { useState, useEffect } from 'react';
import { TerminalLayout } from '@/components/terminal/terminal-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, TrendingUp, ArrowUpDown, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMarketSnapshot } from '@/lib/binance-service';
import {
  TR_GOLD_INSTRUMENTS,
  TR_SILVER_INSTRUMENTS,
  GERMAN_EXCHANGES,
} from '@/lib/config/instruments';
import type { TRInstrument, AssetType } from '@/lib/types/arbitrage';
import { MOCK_TR_PRICES } from '@/lib/mock/tr-prices';

interface MarketData {
  goldPriceUsd: number;
  silverPriceUsd: number;
  eurUsdRate: number;
  goldSource: string;
  silverSource: string;
  eurSource: string;
  lastUpdate: string;
}

type MarketPriceData = {
  price: number;
  bid: number;
  ask: number;
  change24h: number;
};

type SortField = 'name' | 'price' | 'change' | 'spread';
type SortDir = 'asc' | 'desc';

export default function MarketsPage() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | AssetType>('ALL');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const snapshot = await getMarketSnapshot();
      setMarketData({
        goldPriceUsd: snapshot.xauUsd.price ?? 0,
        silverPriceUsd: snapshot.xagUsd.price ?? 0,
        eurUsdRate: snapshot.eurUsd.price ?? 0,
        goldSource: snapshot.xauUsd.source,
        silverSource: snapshot.xagUsd.source,
        eurSource: snapshot.eurUsd.source,
        lastUpdate: new Date().toLocaleTimeString('fr-FR'),
      });
    } catch (error) {
      console.error('Échec du chargement des données de marché :', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const allInstruments: (TRInstrument & { source: 'TR' | 'BINANCE'; priceData?: MarketPriceData })[] = [
    ...TR_GOLD_INSTRUMENTS.map(i => ({ ...i, source: 'TR' as const, priceData: MOCK_TR_PRICES[i.isin] as MarketPriceData | undefined })),
    ...TR_SILVER_INSTRUMENTS.map(i => ({ ...i, source: 'TR' as const, priceData: MOCK_TR_PRICES[i.isin] as MarketPriceData | undefined })),
  ];

  const filteredInstruments = allInstruments
    .filter(i => {
      if (selectedType !== 'ALL' && i.assetType !== selectedType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return i.name.toLowerCase().includes(q) ||
               i.shortName.toLowerCase().includes(q) ||
               i.isin.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'price') cmp = (a.priceData?.price || 0) - (b.priceData?.price || 0);
      else if (sortField === 'change') cmp = (a.priceData?.change24h || 0) - (b.priceData?.change24h || 0);
      else if (sortField === 'spread') {
        const spreadA = a.priceData ? ((a.priceData.ask - a.priceData.bid) / a.priceData.price) * 100 : 0;
        const spreadB = b.priceData ? ((b.priceData.ask - b.priceData.bid) / b.priceData.price) * 100 : 0;
        cmp = spreadA - spreadB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const goldInstruments = allInstruments.filter(i => i.assetType === 'GOLD');
  const silverInstruments = allInstruments.filter(i => i.assetType === 'SILVER');

  return (
    <TerminalLayout
      title="Marchés"
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
        {/* Reference Price Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Gold */}
          <div className="terminal-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Or (XAU/USD)</p>
                <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-gold">
                  {marketData?.goldPriceUsd ? `$${marketData.goldPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                  marketData?.goldSource === 'binance' ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-muted text-muted-foreground'
                )}>
                  {marketData?.goldSource === 'binance' ? 'Binance' : 'N/A'}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              MAJ {marketData?.lastUpdate ?? '--'}
            </p>
          </div>

          {/* Silver */}
          <div className="terminal-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Argent (XAG/USD)</p>
                <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-silver">
                  {marketData?.silverPriceUsd ? `$${marketData.silverPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Radio className="h-5 w-5 text-muted-foreground" />
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                  marketData?.silverSource === 'yahoo' ? 'bg-blue-500/15 text-blue-400' : 'bg-muted text-muted-foreground'
                )}>
                  {marketData?.silverSource === 'yahoo' ? 'Yahoo (SI=F)' : 'Dérivé'}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              MAJ {marketData?.lastUpdate ?? '--'}
            </p>
          </div>

          {/* EUR/USD */}
          <div className="terminal-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">EUR/USD</p>
                <p className="text-2xl font-bold font-mono tabular-nums mt-1">
                  {marketData?.eurUsdRate ? marketData.eurUsdRate.toFixed(4) : '--'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                  marketData?.eurSource === 'binance' ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-blue-500/15 text-blue-400'
                )}>
                  {marketData?.eurSource === 'binance' ? 'Binance' : marketData?.eurSource === 'yahoo' ? 'Yahoo' : 'N/A'}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              MAJ {marketData?.lastUpdate ?? '--'}
            </p>
          </div>
        </div>

        <div className="terminal-panel p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={selectedType === 'ALL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType('ALL')}
              >
                Tous ({allInstruments.length})
              </Button>
              <Button
                variant={selectedType === 'GOLD' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType('GOLD')}
                className={selectedType === 'GOLD' ? 'bg-gold/20 text-gold border-gold/50' : ''}
              >
                Or ({goldInstruments.length})
              </Button>
              <Button
                variant={selectedType === 'SILVER' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType('SILVER')}
                className={selectedType === 'SILVER' ? 'bg-silver/20 text-silver border-silver/50' : ''}
              >
                Argent ({silverInstruments.length})
              </Button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un instrument..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-surface-2 border-border"
              />
            </div>
          </div>
        </div>

        <div className="terminal-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort('name')}
                    >
                      Instrument
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">ISIN</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      className="flex items-center gap-1 hover:text-foreground ml-auto"
                      onClick={() => handleSort('price')}
                    >
                      Prix
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Achat</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Vente</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      className="flex items-center gap-1 hover:text-foreground ml-auto"
                      onClick={() => handleSort('spread')}
                    >
                      Écart
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <button
                      className="flex items-center gap-1 hover:text-foreground ml-auto"
                      onClick={() => handleSort('change')}
                    >
                      24h %
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">g/Unité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredInstruments.map((instrument) => {
                  const priceData = instrument.priceData;
                  const spread = priceData ? ((priceData.ask - priceData.bid) / priceData.price) * 100 : 0;

                  return (
                    <tr
                      key={instrument.isin}
                      className="hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-2 h-2 rounded-full',
                            instrument.assetType === 'GOLD' ? 'bg-gold' : 'bg-silver'
                          )} />
                          <div>
                            <div className="font-medium text-sm">{instrument.shortName}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-48">{instrument.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-xs text-muted-foreground">{instrument.isin}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={cn(
                          'text-xs',
                          instrument.assetType === 'GOLD' ? 'border-gold/50 text-gold' : 'border-silver/50 text-silver'
                        )}>
                          {instrument.assetType === 'GOLD' ? 'OR' : 'ARGENT'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-sm">
                          {priceData ? `${instrument.currency === 'EUR' ? '€' : '$'}${priceData.price.toFixed(2)}` : '--'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-xs text-muted-foreground">{priceData?.bid.toFixed(2) || '--'}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-xs text-muted-foreground">{priceData?.ask.toFixed(2) || '--'}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-xs">{spread.toFixed(3)}%</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={cn(
                          'font-mono text-sm',
                          priceData && priceData.change24h > 0 && 'text-[var(--positive)]',
                          priceData && priceData.change24h < 0 && 'text-[var(--negative)]'
                        )}>
                          {priceData ? `${priceData.change24h > 0 ? '+' : ''}${priceData.change24h.toFixed(2)}%` : '--'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-xs text-muted-foreground">{instrument.gramPerUnit?.toFixed(3) || '--'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredInstruments.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Aucun instrument ne correspond à vos critères.
            </div>
          )}
        </div>

        {/* Exchange availability panel */}
        <div className="terminal-panel p-4">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Bourses allemandes (trading hebdomadaire via Trade Republic)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {GERMAN_EXCHANGES.map((ex) => (
              <div
                key={ex.id}
                className="bg-surface-2 rounded-lg p-3 border border-border/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{ex.shortName}</span>
                  {ex.status === 'confirmed' ? (
                    <Badge className="text-[10px] bg-[var(--positive)]/20 text-[var(--positive)] border-[var(--positive)]/30">
                      Confirmé
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-[var(--warning)]/50 text-[var(--warning)]">
                      À vérifier
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{ex.name}</div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Horaires CET</span>
                  <span>{ex.open} – {ex.close}</span>
                </div>
                <div className="text-[10px] text-muted-foreground italic">{ex.notes}</div>
              </div>
            ))}
          </div>

          {/* Sources panel */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Sources de prix temps réel
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-surface-2 rounded p-3 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Binance</span>
                  <Badge variant="outline" className="text-[10px] border-[var(--warning)]/50 text-[var(--warning)]">
                    PAXG/USDT
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Or (XAU) – prix PAXG temps réel</p>
                <p className="text-xs text-muted-foreground">EUR/USD – EURUSDC ou EURUSDT</p>
              </div>
              <div className="bg-surface-2 rounded p-3 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Yahoo Finance</span>
                  <Badge variant="outline" className="text-[10px] border-blue-400/50 text-blue-400">
                    SI=F
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Argent (XAG) – futures continus</p>
                <p className="text-xs text-muted-foreground">Fallback EUR/USD (EURUSD=X) si Binance KO</p>
              </div>
              <div className="bg-surface-2 rounded p-3 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Trade Republic</span>
                  <Badge variant="outline" className="text-[10px]">
                    Simulé
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">ETC/ETF or & argent via TR API</p>
                <p className="text-xs text-muted-foreground">Intégration directe à connecter</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TerminalLayout>
  );
}

