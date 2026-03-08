import { NextRequest, NextResponse } from 'next/server';
import { getMarketSnapshot } from '@/lib/binance-service';
import { getETFSnapshot } from '@/lib/etf-data';
import {
  TR_GOLD_INSTRUMENTS,
  TR_SILVER_INSTRUMENTS,
  GOLD_SILVER_RATIO,
} from '@/lib/config/instruments';
import { calculateInstrumentSpread } from '@/lib/engine/arbitrage-engine';
import { getActiveSignals } from '@/lib/engine/signal-engine';
import { MOCK_TR_PRICES } from '@/lib/mock/tr-prices';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function esc(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...values: (string | number | boolean | null | undefined)[]): string {
  return values.map(esc).join(',');
}

/**
 * GET /api/export/csv
 * Returns a real .csv file containing the selected data sections.
 *
 * Query params:
 *   include=markets,etfs,arbitrage,signals  (default: all)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeParam = searchParams.get('include') || 'markets,etfs,arbitrage,signals';
  const includes = includeParam.split(',').map(s => s.trim().toLowerCase());

  try {
    const timestamp = new Date().toISOString();
    const dateLabel = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const lines: string[] = [];

    const snapshot = await getMarketSnapshot();
    const paxgPrice = snapshot.xauUsd.price ?? 2650;
    const eurUsd = snapshot.eurUsd.price ?? 1.08;
    const silverPriceUsd = snapshot.xagUsd.price || paxgPrice / GOLD_SILVER_RATIO.default;

    lines.push('# Market Intelligence Platform — Export CSV');
    lines.push(`# Genere le: ${dateLabel}`);
    lines.push(`# Source primaire: Binance`);
    lines.push('');

    // ── Markets ──────────────────────────────────────────────────────────
    if (includes.includes('markets')) {
      lines.push('## MARCHES (Binance)');
      lines.push(row('Paire', 'Prix USD', 'Source', 'Methode', 'Horodatage'));
      lines.push(row('XAU/USD', paxgPrice, snapshot.xauUsd.source, 'PAXGUSDT spot', timestamp));
      lines.push(row('XAG/USD', silverPriceUsd, snapshot.xagUsd.source, 'PAXG/ratio', timestamp));
      lines.push(row('EUR/USD', eurUsd, snapshot.eurUsd.source, 'EURUSDC spot', timestamp));
      lines.push(row('XAU/EUR', paxgPrice / eurUsd, 'calcule', 'XAU/USD / EUR/USD', timestamp));
      lines.push(row('XAG/EUR', silverPriceUsd / eurUsd, 'calcule', 'XAG/USD / EUR/USD', timestamp));
      lines.push('');
    }

    // ── ETFs ──────────────────────────────────────────────────────────────
    if (includes.includes('etfs')) {
      const etfSnapshot = getETFSnapshot();
      lines.push('## ETFs / ETCs (Trade Republic)');
      lines.push(row('ISIN', 'Nom', 'Symbole', 'Bid', 'Ask', 'Dernier', 'Spread', 'Spread%', 'Devise'));
      for (const etf of etfSnapshot.etfs) {
        lines.push(row(
          etf.isin, etf.name, etf.symbol,
          etf.bid, etf.ask, etf.last,
          etf.spread, etf.spreadPercent, etf.currency,
        ));
      }
      lines.push('');
    }

    // ── Arbitrage ─────────────────────────────────────────────────────────
    if (includes.includes('arbitrage')) {
      lines.push('## ARBITRAGE (TR vs Binance)');
      lines.push(row(
        'ISIN', 'Nom', 'Actif', 'Prix TR', 'Bid TR', 'Ask TR',
        'Prix Binance', 'Ecart%', 'Ecart BPS', 'Z-Score',
        'Confiance', 'Devise', 'Taux FX', 'Horodatage',
      ));

      for (const instrument of TR_GOLD_INSTRUMENTS) {
        const trData = MOCK_TR_PRICES[instrument.isin];
        if (trData) {
          const s = calculateInstrumentSpread(
            instrument, trData.price, trData.bid, trData.ask, paxgPrice, eurUsd,
          );
          lines.push(row(
            s.trInstrument.isin, s.trInstrument.name, 'OR',
            s.trPrice, s.trBid ?? '', s.trAsk ?? '',
            s.binancePrice, s.spreadPct, s.spreadBps,
            s.zScore, s.confidence, s.currency, s.fxRate ?? '', s.timestamp,
          ));
        }
      }

      for (const instrument of TR_SILVER_INSTRUMENTS) {
        const trData = MOCK_TR_PRICES[instrument.isin];
        if (trData) {
          const normalizedBinance =
            instrument.currency === 'EUR'
              ? (silverPriceUsd / eurUsd) * (instrument.gramPerUnit || 1) / 31.1035
              : silverPriceUsd * (instrument.gramPerUnit || 1) / 31.1035;

          const spreadPct = ((trData.price - normalizedBinance) / normalizedBinance) * 100;
          lines.push(row(
            instrument.isin, instrument.name, 'ARGENT',
            trData.price, trData.bid ?? '', trData.ask ?? '',
            normalizedBinance, spreadPct, spreadPct * 100,
            0, 'MEDIUM', instrument.currency, eurUsd, timestamp,
          ));
        }
      }
      lines.push('');
    }

    // ── Signals ───────────────────────────────────────────────────────────
    if (includes.includes('signals')) {
      const signals = getActiveSignals();
      lines.push('## SIGNAUX DE TRADING');
      lines.push(row(
        'ID', 'Actif', 'Instrument', 'Type', 'Ecart%',
        'Z-Score', 'Confiance', 'Priorite', 'Statut', 'Rationale', 'Horodatage',
      ));
      for (const s of signals) {
        lines.push(row(
          s.id, s.assetType, s.instrumentName, s.signalType,
          s.spreadPct, s.zScore, s.confidence, s.priority,
          s.status, s.rationale, s.timestamp,
        ));
      }
      lines.push('');
    }

    const csv = lines.join('\r\n');
    const filename = `market-intelligence-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[API Export CSV] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export CSV', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
