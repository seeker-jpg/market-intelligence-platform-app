import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
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

/**
 * GET /api/export/xlsx
 * Generates a real .xlsx workbook with multiple sheets:
 *   - Marches     : Binance snapshot (XAU, XAG, EUR/USD)
 *   - ETFs        : Trade Republic instruments
 *   - Arbitrage   : Spread calculations vs Binance
 *   - Signaux     : Active trading signals
 *
 * Query params:
 *   include=markets,etfs,arbitrage,signals  (default: all)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeParam = searchParams.get('include') || 'markets,etfs,arbitrage,signals';
  const includes = includeParam.split(',').map(s => s.trim().toLowerCase());

  try {
    const wb = XLSX.utils.book_new();
    const timestamp = new Date().toISOString();
    const dateLabel = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

    const snapshot = await getMarketSnapshot();
    const paxgPrice = snapshot.xauUsd.price ?? 2650;
    const eurUsd = snapshot.eurUsd.price ?? 1.08;
    const silverPriceUsd = snapshot.xagUsd.price || paxgPrice / GOLD_SILVER_RATIO.default;

    // ── Sheet 1: Marches ──────────────────────────────────────────────────
    if (includes.includes('markets')) {
      const marketsData = [
        ['Market Intelligence Platform — Export marchés', '', '', '', ''],
        [`Généré le : ${dateLabel}`, '', '', '', ''],
        ['Source primaire : Binance', '', '', '', ''],
        [''],
        ['Paire', 'Prix (USD)', 'Source', 'Méthode', 'Horodatage'],
        ['XAU/USD (Or)', paxgPrice, snapshot.xauUsd.source, 'PAXGUSDT spot', timestamp],
        ['XAG/USD (Argent)', silverPriceUsd, snapshot.xagUsd.source, 'PAXG/ratio', timestamp],
        ['EUR/USD', eurUsd, snapshot.eurUsd.source, 'EURUSDC spot', timestamp],
        ['XAU/EUR (Or EUR)', paxgPrice / eurUsd, 'calculé', 'XAU/USD ÷ EUR/USD', timestamp],
        ['XAG/EUR (Argent EUR)', silverPriceUsd / eurUsd, 'calculé', 'XAG/USD ÷ EUR/USD', timestamp],
      ];

      const ws = XLSX.utils.aoa_to_sheet(marketsData);
      // Column widths
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 26 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Marches');
    }

    // ── Sheet 2: ETFs ─────────────────────────────────────────────────────
    if (includes.includes('etfs')) {
      const etfSnapshot = getETFSnapshot();
      const rows: (string | number | null)[][] = [
        ['ETFs / ETCs Trade Republic', '', '', '', '', '', '', '', ''],
        [`Généré le : ${dateLabel}`, '', '', '', '', '', '', '', ''],
        [''],
        ['ISIN', 'Nom', 'Symbole', 'Bid', 'Ask', 'Dernier', 'Spread', 'Spread %', 'Devise'],
        ...etfSnapshot.etfs.map(etf => [
          etf.isin,
          etf.name,
          etf.symbol,
          etf.bid,
          etf.ask,
          etf.last,
          etf.spread,
          etf.spreadPercent,
          etf.currency,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 16 }, { wch: 32 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'ETFs');
    }

    // ── Sheet 3: Arbitrage ────────────────────────────────────────────────
    if (includes.includes('arbitrage')) {
      const headers = [
        'ISIN', 'Nom', 'Actif', 'Prix TR', 'Bid TR', 'Ask TR',
        'Prix Binance', 'Ecart %', 'Ecart BPS', 'Z-Score',
        'Confiance', 'Devise', 'Taux FX', 'Horodatage',
      ];

      const arbitrageRows: (string | number | null)[][] = [
        ['Arbitrage — Ecarts TR vs Binance', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        [`Généré le : ${dateLabel}`, '', '', '', '', '', '', '', '', '', '', '', '', ''],
        [''],
        headers,
      ];

      for (const instrument of TR_GOLD_INSTRUMENTS) {
        const trData = MOCK_TR_PRICES[instrument.isin];
        if (trData) {
          const spread = calculateInstrumentSpread(
            instrument, trData.price, trData.bid, trData.ask, paxgPrice, eurUsd
          );
          arbitrageRows.push([
            spread.trInstrument.isin,
            spread.trInstrument.name,
            'OR',
            spread.trPrice,
            spread.trBid ?? null,
            spread.trAsk ?? null,
            spread.binancePrice,
            spread.spreadPct,
            spread.spreadBps,
            spread.zScore,
            spread.confidence,
            spread.currency,
            spread.fxRate ?? null,
            spread.timestamp,
          ]);
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
          arbitrageRows.push([
            instrument.isin,
            instrument.name,
            'ARGENT',
            trData.price,
            trData.bid ?? null,
            trData.ask ?? null,
            normalizedBinance,
            spreadPct,
            spreadPct * 100,
            0,
            'MEDIUM',
            instrument.currency,
            eurUsd,
            timestamp,
          ]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(arbitrageRows);
      ws['!cols'] = [
        { wch: 16 }, { wch: 32 }, { wch: 8 },
        { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 10 }, { wch: 10 },
        { wch: 8 }, { wch: 10 }, { wch: 8 },
        { wch: 10 }, { wch: 26 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Arbitrage');
    }

    // ── Sheet 4: Signaux ──────────────────────────────────────────────────
    if (includes.includes('signals')) {
      const signals = getActiveSignals();
      const sigHeaders = [
        'ID', 'Actif', 'Instrument', 'Type', 'Ecart %',
        'Z-Score', 'Confiance', 'Priorite', 'Statut', 'Rationale', 'Horodatage',
      ];

      const signalRows: (string | number | null)[][] = [
        ['Signaux de trading actifs', '', '', '', '', '', '', '', '', '', ''],
        [`Généré le : ${dateLabel}`, '', '', '', '', '', '', '', '', '', ''],
        [''],
        sigHeaders,
        ...signals.map(s => [
          s.id, s.assetType, s.instrumentName, s.signalType,
          s.spreadPct, s.zScore, s.confidence, s.priority,
          s.status, s.rationale, s.timestamp,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(signalRows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 8 },
        { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 8 },
        { wch: 10 }, { wch: 40 }, { wch: 26 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Signaux');
    }

    // Write workbook to buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `market-intelligence-${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[API Export XLSX] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate XLSX', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
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
