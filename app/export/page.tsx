'use client';

import { useState } from 'react';
import { TerminalLayout } from '@/components/terminal/terminal-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Download,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Table2,
  BarChart3,
  Activity,
  History,
  Code,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportConfig {
  includeMarkets: boolean;
  includeArbitrage: boolean;
  includeSignals: boolean;
  includeHistory: boolean;
  format: 'csv' | 'xlsx';
  dateRange: '24h' | '7d' | '30d' | 'custom';
  customStartDate: string;
  customEndDate: string;
}

interface ExportJob {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  /** Stores the blob URL or the API URL for re-download */
  downloadUrl?: string;
  /** The API URL to call for re-download */
  apiUrl?: string;
  format: 'csv' | 'xlsx';
  include: string;
  size?: string;
  error?: string;
}

/** Build the include param string from config */
function buildInclude(config: ExportConfig): string {
  const parts: string[] = [];
  if (config.includeMarkets) parts.push('markets');
  if (config.includeArbitrage) parts.push('arbitrage');
  if (config.includeSignals) parts.push('signals');
  if (config.includeHistory) parts.push('history');
  return parts.join(',') || 'markets';
}

/** Trigger a browser file download from a Blob */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const [config, setConfig] = useState<ExportConfig>({
    includeMarkets: true,
    includeArbitrage: true,
    includeSignals: true,
    includeHistory: false,
    format: 'csv',
    dateRange: '7d',
    customStartDate: '',
    customEndDate: '',
  });

  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://v0-market-intelligence-platform-zeta.vercel.app';

  const apiEndpoints = [
    {
      name: 'Export CSV',
      method: 'GET',
      path: '/api/export/csv',
      description: 'Export complet en CSV (marchés, ETFs, arbitrage, signaux)',
      params: 'include=markets,etfs,arbitrage,signals',
    },
    {
      name: 'Export XLSX',
      method: 'GET',
      path: '/api/export/xlsx',
      description: 'Export multi-feuilles Excel — un onglet par catégorie',
      params: 'include=markets,etfs,arbitrage,signals',
    },
    {
      name: 'Export JSON',
      method: 'GET',
      path: '/api/export',
      description: 'Toutes les données en JSON structuré',
      params: 'format=json, include=markets,etfs,arbitrage,signals',
    },
    {
      name: 'Marchés Binance',
      method: 'GET',
      path: '/api/export/markets',
      description: 'Snapshot marchés XAU/USD, XAG/USD, EUR/USD',
      params: '-',
    },
    {
      name: 'ETFs Trade Republic',
      method: 'GET',
      path: '/api/export/etfs',
      description: 'Instruments ETF avec bid/ask/spread',
      params: '-',
    },
  ];

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);

    const include = buildInclude(config);
    const format = config.format;
    const apiPath =
      format === 'xlsx'
        ? `/api/export/xlsx?include=${include}`
        : `/api/export/csv?include=${include}`;

    const jobId = Date.now().toString();
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const label =
      `Export ${format.toUpperCase()} — ${dateStr}` +
      (config.includeMarkets && config.includeArbitrage && config.includeSignals
        ? ' (complet)'
        : ` (${include.replace(/,/g, ', ')})`);

    const newJob: ExportJob = {
      id: jobId,
      name: label,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString(),
      format,
      include,
      apiUrl: apiPath,
    };
    setExportJobs(prev => [newJob, ...prev]);

    // Animate progress while fetching
    const timer = setInterval(() => {
      setExportJobs(prev =>
        prev.map(j =>
          j.id === jobId && j.progress < 85
            ? { ...j, progress: j.progress + 15 }
            : j,
        ),
      );
    }, 200);

    try {
      const res = await fetch(apiPath);

      clearInterval(timer);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const blob = await res.blob();
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const filename = `market-intelligence-${new Date().toISOString().split('T')[0]}.${ext}`;

      // Trigger immediate download
      triggerDownload(blob, filename);

      // Store blob URL for re-download from history
      const blobUrl = URL.createObjectURL(blob);
      const sizeKb = (blob.size / 1024).toFixed(1);
      const sizeLabel = blob.size > 1024 * 1024
        ? `${(blob.size / 1024 / 1024).toFixed(1)} MB`
        : `${sizeKb} KB`;

      setExportJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status: 'completed',
                progress: 100,
                completedAt: new Date().toISOString(),
                downloadUrl: blobUrl,
                size: sizeLabel,
              }
            : j,
        ),
      );
    } catch (err) {
      clearInterval(timer);
      setExportJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status: 'failed',
                progress: 0,
                error: err instanceof Error ? err.message : 'Erreur inconnue',
              }
            : j,
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  /** Re-download a completed job by calling the API again */
  const handleReDownload = async (job: ExportJob) => {
    if (!job.apiUrl) return;
    try {
      const res = await fetch(job.apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = job.format === 'xlsx' ? 'xlsx' : 'csv';
      const filename = `market-intelligence-${new Date().toISOString().split('T')[0]}.${ext}`;
      triggerDownload(blob, filename);
    } catch {
      // silently ignore — user can retry
    }
  };

  const dataCategories = [
    {
      key: 'includeMarkets' as const,
      label: 'Données de marché',
      icon: <Table2 className="h-5 w-5" />,
      description: 'Prix XAU/USD, XAG/USD, EUR/USD depuis Binance',
    },
    {
      key: 'includeArbitrage' as const,
      label: 'Arbitrage TR vs Binance',
      icon: <BarChart3 className="h-5 w-5" />,
      description: 'Ecarts, z-scores et opportunités par instrument',
    },
    {
      key: 'includeSignals' as const,
      label: 'Signaux de trading',
      icon: <Activity className="h-5 w-5" />,
      description: 'Signaux BUY/SELL/WATCH actifs',
    },
    {
      key: 'includeHistory' as const,
      label: 'Données historiques',
      icon: <History className="h-5 w-5" />,
      description: 'Historique des signaux et des prix',
    },
  ] as const;

  const pythonCode = `#!/usr/bin/env python3
"""
Market Intelligence Platform - Connexion distante Excel
Appelle l'API REST et pousse les donnees vers Excel avec xlwings.
Compatible cron / Windows Task Scheduler.
"""

import sys
import requests
import xlwings as xw
from datetime import datetime

API_BASE_URL = "${baseUrl}"

def fetch_json():
    """Recupere toutes les donnees en JSON depuis l'API."""
    url = f"{API_BASE_URL}/api/export?format=json&include=markets,etfs,arbitrage,signals"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def download_xlsx(dest_path="market_data.xlsx"):
    """Telecharge directement le fichier XLSX genere par le serveur."""
    url = f"{API_BASE_URL}/api/export/xlsx?include=markets,etfs,arbitrage,signals"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        f.write(r.content)
    print(f"[OK] XLSX sauvegarde : {dest_path}")

def push_to_excel(data, excel_path="market_data_live.xlsx"):
    """
    Pousse les donnees JSON vers un classeur Excel via xlwings.
    Cree le fichier s'il n'existe pas.
    """
    try:
        wb = xw.Book(excel_path)
    except Exception:
        wb = xw.Book()
        wb.save(excel_path)

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ── Feuille Marches ────────────────────────────────────────────────
    if "markets" in data:
        sh = _get_or_create_sheet(wb, "Marches")
        sh.clear()
        sh.range("A1").value = f"Marches Binance — {ts}"
        sh.range("A3").value = [["Paire", "Prix USD", "Source", "Methode"]]
        row = 4
        b = data["markets"]["binance"]
        for key, m in b.items():
            sh.range(f"A{row}").value = [[m.get("pair", key), m.get("price"), m.get("source","binance"), m.get("method","")]]
            row += 1

    # ── Feuille ETFs ───────────────────────────────────────────────────
    if "etfs" in data:
        sh = _get_or_create_sheet(wb, "ETFs")
        sh.clear()
        sh.range("A1").value = f"ETFs Trade Republic — {ts}"
        sh.range("A3").value = [["ISIN","Nom","Symbole","Bid","Ask","Dernier","Spread","Spread%","Devise"]]
        row = 4
        for e in data["etfs"]["instruments"]:
            sh.range(f"A{row}").value = [[
                e["isin"], e["name"], e.get("symbol",""),
                e["bid"], e["ask"], e["last"],
                e["spread"], e["spreadPercent"], e["currency"]
            ]]
            row += 1

    # ── Feuille Arbitrage ─────────────────────────────────────────────
    if "arbitrage" in data:
        sh = _get_or_create_sheet(wb, "Arbitrage")
        sh.clear()
        sh.range("A1").value = f"Arbitrage TR vs Binance — {ts}"
        sh.range("A3").value = [["ISIN","Nom","Actif","Prix TR","Prix Binance","Ecart%","Direction"]]
        row = 4
        for actif, entries in [("OR", data["arbitrage"].get("gold",[])),
                                ("ARGENT", data["arbitrage"].get("silver",[]))]:
            for item in entries:
                sh.range(f"A{row}").value = [[
                    item["etf"]["isin"], item["etf"]["name"], actif,
                    item["etf"]["price"], item["binance"]["price"],
                    item.get("spreadPct"), item.get("direction")
                ]]
                row += 1

    # ── Feuille Signaux ────────────────────────────────────────────────
    if "signals" in data:
        sh = _get_or_create_sheet(wb, "Signaux")
        sh.clear()
        sh.range("A1").value = f"Signaux actifs — {ts}"
        sh.range("A3").value = [["ID","Actif","Instrument","Type","Ecart%","Z-Score","Confiance"]]
        row = 4
        for s in data["signals"]["active"]:
            sh.range(f"A{row}").value = [[
                s["id"], s["asset"], s["instrument"], s["type"],
                s["spreadPct"], s["zScore"], s["confidence"]
            ]]
            row += 1

    wb.save(excel_path)
    print(f"[OK] Excel mis a jour : {excel_path}")

def _get_or_create_sheet(wb, name):
    try:
        return wb.sheets[name]
    except Exception:
        return wb.sheets.add(name)

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--xlsx" in args or (len(args) > 0 and args[0].endswith(".xlsx") and "--live" not in args):
        dest = next((a for a in args if a.endswith(".xlsx")), "market_data.xlsx")
        download_xlsx(dest)
    else:
        dest = next((a for a in args if a.endswith(".xlsx")), "market_data_live.xlsx")
        data = fetch_json()
        push_to_excel(data, dest)
`;

  const curlExamples = `# Exporter en CSV (toutes sections)
curl "${baseUrl}/api/export/csv" -o export.csv

# Exporter en XLSX (toutes sections)
curl "${baseUrl}/api/export/xlsx" -o export.xlsx

# Exporter uniquement les marches en CSV
curl "${baseUrl}/api/export/csv?include=markets" -o marches.csv

# Exporter marches + arbitrage en XLSX
curl "${baseUrl}/api/export/xlsx?include=markets,arbitrage" -o arb.xlsx

# Toutes les donnees en JSON (pour scripts)
curl "${baseUrl}/api/export?format=json"

# Snapshot marches uniquement (JSON)
curl "${baseUrl}/api/export/markets"
`;

  return (
    <TerminalLayout title="Export">
      <div className="p-4 space-y-6">
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Manuel
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              API
            </TabsTrigger>
            <TabsTrigger value="python" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Python
            </TabsTrigger>
          </TabsList>

          {/* ── Manual Export Tab ─────────────────────────────────────────── */}
          <TabsContent value="manual" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Data Selection */}
              <div className="terminal-panel p-4">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
                  Données à exporter
                </h3>
                <div className="space-y-3">
                  {dataCategories.map((category) => (
                    <label
                      key={category.key}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        config[category.key]
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border hover:border-muted-foreground/50',
                      )}
                    >
                      <Checkbox
                        checked={config[category.key]}
                        onCheckedChange={(checked) =>
                          setConfig(prev => ({ ...prev, [category.key]: !!checked }))
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{category.icon}</span>
                          <span className="font-medium text-sm">{category.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{category.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Export Options */}
              <div className="terminal-panel p-4">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
                  Options d&apos;export
                </h3>

                <div className="space-y-4">
                  {/* Format */}
                  <div className="space-y-2">
                    <Label className="text-sm">Format d&apos;export</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={config.format === 'csv' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, format: 'csv' }))}
                        className="flex-1"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        CSV
                      </Button>
                      <Button
                        variant={config.format === 'xlsx' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, format: 'xlsx' }))}
                        className="flex-1"
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel (XLSX)
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {config.format === 'xlsx'
                        ? 'Classeur multi-feuilles : un onglet par catégorie sélectionnée.'
                        : 'Fichier .csv UTF-8 avec séparateurs clairs, directement ouvrable dans Excel.'}
                    </p>
                  </div>

                  {/* Date Range */}
                  <div className="space-y-2">
                    <Label className="text-sm">Période</Label>
                    <Select
                      value={config.dateRange}
                      onValueChange={(v) =>
                        setConfig(prev => ({ ...prev, dateRange: v as ExportConfig['dateRange'] }))
                      }
                    >
                      <SelectTrigger className="bg-surface-2">
                        <Clock className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">Dernières 24 heures</SelectItem>
                        <SelectItem value="7d">7 derniers jours</SelectItem>
                        <SelectItem value="30d">30 derniers jours</SelectItem>
                        <SelectItem value="custom">Plage personnalisée</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Custom Date Range */}
                  {config.dateRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Date de début</Label>
                        <Input
                          type="date"
                          value={config.customStartDate}
                          onChange={(e) =>
                            setConfig(prev => ({ ...prev, customStartDate: e.target.value }))
                          }
                          className="bg-surface-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Date de fin</Label>
                        <Input
                          type="date"
                          value={config.customEndDate}
                          onChange={(e) =>
                            setConfig(prev => ({ ...prev, customEndDate: e.target.value }))
                          }
                          className="bg-surface-2"
                        />
                      </div>
                    </div>
                  )}

                  {/* Export Button */}
                  <Button
                    onClick={handleExport}
                    disabled={
                      isExporting ||
                      (!config.includeMarkets &&
                        !config.includeArbitrage &&
                        !config.includeSignals &&
                        !config.includeHistory)
                    }
                    className="w-full mt-4"
                  >
                    {isExporting ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Génération en cours…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Télécharger .{config.format}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Export History */}
            <div className="terminal-panel mt-6">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Historique des exports
                </h3>
                {exportJobs.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExportJobs([])}
                  >
                    Effacer
                  </button>
                )}
              </div>

              <div className="divide-y divide-border/50">
                {exportJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'p-2 rounded-lg',
                        job.status === 'completed' && 'bg-[var(--positive)]/10 text-[var(--positive)]',
                        job.status === 'processing' && 'bg-[var(--warning)]/10 text-[var(--warning)]',
                        job.status === 'failed' && 'bg-[var(--negative)]/10 text-[var(--negative)]',
                        job.status === 'pending' && 'bg-muted/10 text-muted-foreground',
                      )}>
                        {job.status === 'completed' && <CheckCircle2 className="h-5 w-5" />}
                        {job.status === 'processing' && <Clock className="h-5 w-5 animate-spin" />}
                        {job.status === 'failed' && <AlertCircle className="h-5 w-5" />}
                        {job.status === 'pending' && <Clock className="h-5 w-5" />}
                      </div>

                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {job.name}
                          <Badge variant="outline" className="text-[10px] font-mono">
                            .{job.format}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{new Date(job.createdAt).toLocaleString('fr-FR')}</span>
                          {job.size && <><span>•</span><span>{job.size}</span></>}
                          {job.error && (
                            <span className="text-[var(--negative)]">{job.error}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {job.status === 'processing' && (
                        <div className="w-32">
                          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground text-center mt-1">
                            {job.progress}%
                          </div>
                        </div>
                      )}

                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          job.status === 'completed' && 'border-[var(--positive)]/50 text-[var(--positive)]',
                          job.status === 'processing' && 'border-[var(--warning)]/50 text-[var(--warning)]',
                          job.status === 'failed' && 'border-[var(--negative)]/50 text-[var(--negative)]',
                        )}
                      >
                        {job.status === 'completed' && 'Terminé'}
                        {job.status === 'processing' && 'En cours'}
                        {job.status === 'failed' && 'Échec'}
                        {job.status === 'pending' && 'En attente'}
                      </Badge>

                      {job.status === 'completed' && job.apiUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReDownload(job)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Re-télécharger
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {exportJobs.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    Aucun export pour l&apos;instant. Configurez les options ci-dessus puis cliquez sur
                    &ldquo;Télécharger&rdquo;.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Templates */}
            <div className="terminal-panel p-4 mt-6">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
                Modèles d&apos;export rapide
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => {
                    setConfig({
                      includeMarkets: true,
                      includeArbitrage: false,
                      includeSignals: false,
                      includeHistory: false,
                      format: 'csv',
                      dateRange: '24h',
                      customStartDate: '',
                      customEndDate: '',
                    });
                  }}
                >
                  <Table2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Snapshot marché</span>
                  <span className="text-xs text-muted-foreground">Prix actuels · CSV</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => {
                    setConfig({
                      includeMarkets: false,
                      includeArbitrage: true,
                      includeSignals: true,
                      includeHistory: false,
                      format: 'xlsx',
                      dateRange: '7d',
                      customStartDate: '',
                      customEndDate: '',
                    });
                  }}
                >
                  <BarChart3 className="h-5 w-5" />
                  <span className="text-sm font-medium">Analyse hebdo</span>
                  <span className="text-xs text-muted-foreground">Arbitrage + signaux · XLSX</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => {
                    setConfig({
                      includeMarkets: true,
                      includeArbitrage: true,
                      includeSignals: true,
                      includeHistory: true,
                      format: 'xlsx',
                      dateRange: '30d',
                      customStartDate: '',
                      customEndDate: '',
                    });
                  }}
                >
                  <FileSpreadsheet className="h-5 w-5" />
                  <span className="text-sm font-medium">Rapport complet</span>
                  <span className="text-xs text-muted-foreground">Tout · 30 jours · XLSX</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => {
                    setConfig({
                      includeMarkets: false,
                      includeArbitrage: false,
                      includeSignals: true,
                      includeHistory: false,
                      format: 'csv',
                      dateRange: '24h',
                      customStartDate: '',
                      customEndDate: '',
                    });
                  }}
                >
                  <Activity className="h-5 w-5" />
                  <span className="text-sm font-medium">Signaux du jour</span>
                  <span className="text-xs text-muted-foreground">Signaux 24 h · CSV</span>
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── API Endpoints Tab ─────────────────────────────────────────── */}
          <TabsContent value="api" className="mt-6 space-y-6">
            <div className="terminal-panel p-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Code className="h-4 w-4" />
                Endpoints API REST
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Utilisez ces endpoints depuis votre serveur Debian ou tout client HTTP.
                Les fichiers CSV et XLSX sont générés côté serveur avec de vraies données Binance.
              </p>

              <div className="space-y-3">
                {apiEndpoints.map((endpoint) => (
                  <div
                    key={endpoint.path}
                    className="p-4 rounded-lg border border-border bg-surface-2/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-xs font-mono bg-primary/10 text-primary border-primary/30"
                          >
                            {endpoint.method}
                          </Badge>
                          <span className="font-medium text-sm">{endpoint.name}</span>
                        </div>
                        <code className="text-xs text-muted-foreground font-mono block mb-2">
                          {baseUrl}{endpoint.path}
                        </code>
                        <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                        {endpoint.params !== '-' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="text-gold">Params :</span> {endpoint.params}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(`${baseUrl}${endpoint.path}`, endpoint.path)
                          }
                        >
                          {copiedEndpoint === endpoint.path ? (
                            <Check className="h-4 w-4 text-[var(--positive)]" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={endpoint.path} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* cURL Examples */}
            <div className="terminal-panel p-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Exemples cURL
              </h3>
              <div className="relative">
                <pre className="bg-surface-1 p-4 rounded-lg text-xs font-mono overflow-x-auto text-muted-foreground">
                  {curlExamples}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(curlExamples, 'curl')}
                >
                  {copiedEndpoint === 'curl' ? (
                    <Check className="h-4 w-4 text-[var(--positive)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Python Tab ────────────────────────────────────────────────── */}
          <TabsContent value="python" className="mt-6 space-y-6">
            <div className="terminal-panel p-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Script Python — connexion distante Excel
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Deux modes : <strong>téléchargement direct</strong> du XLSX généré par le serveur,
                ou <strong>push live</strong> via xlwings dans un classeur Excel ouvert.
                Compatible Debian → Python → Excel via réseau.
              </p>

              <div className="bg-surface-1 p-3 rounded-lg mb-4">
                <p className="text-xs font-mono text-muted-foreground mb-1">
                  <span className="text-gold"># Dépendances</span>
                </p>
                <code className="text-xs font-mono text-foreground">
                  pip install requests xlwings
                </code>
              </div>

              <div className="relative">
                <pre className="bg-surface-1 p-4 rounded-lg text-xs font-mono overflow-x-auto text-muted-foreground max-h-[520px] overflow-y-auto">
                  {pythonCode}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(pythonCode, 'python')}
                >
                  {copiedEndpoint === 'python' ? (
                    <Check className="h-4 w-4 text-[var(--positive)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Usage */}
              <div className="mt-4 p-4 border border-border rounded-lg">
                <h4 className="text-sm font-medium mb-2">Utilisation</h4>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  <p><span className="text-gold">$</span> python export_to_excel.py data.xlsx</p>
                  <p className="text-muted-foreground/60 pl-4"># Télécharge le XLSX généré par le serveur</p>
                  <p><span className="text-gold">$</span> python export_to_excel.py live.xlsx --live</p>
                  <p className="text-muted-foreground/60 pl-4"># Push JSON → classeur Excel via xlwings</p>
                </div>
              </div>

              {/* Cron */}
              <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-medium text-primary mb-2">Automatisation (cron)</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Rafraîchissement automatique toutes les 5 minutes :
                </p>
                <code className="text-xs font-mono text-foreground block bg-surface-1 p-2 rounded">
                  {'*/5 * * * * /usr/bin/python3 /path/to/export_to_excel.py /path/to/market_data.xlsx'}
                </code>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([pythonCode], { type: 'text/plain' });
                  triggerDownload(blob, 'export_to_excel.py');
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Télécharger le script .py
              </Button>
              <Button variant="outline" asChild>
                <a href="/api/export/xlsx" download="market-intelligence.xlsx">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Tester XLSX
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/api/export/csv" download="market-intelligence.csv">
                  <FileText className="h-4 w-4 mr-2" />
                  Tester CSV
                </a>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TerminalLayout>
  );
}
