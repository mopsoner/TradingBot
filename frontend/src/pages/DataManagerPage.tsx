import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, type ProcessStatus } from '../services/api';
import type { AdminPage } from '../types';
import { TIMEFRAMES } from '../constants';
import { fmtDateTime } from '../utils/dateUtils';

type Props = { onNavigate?: (page: AdminPage) => void };

const PERIODS = [
  { label: '1 mois',  days: 30   },
  { label: '3 mois',  days: 90   },
  { label: '6 mois',  days: 180  },
  { label: '1 an',    days: 365  },
  { label: '2 ans',   days: 730  },
  { label: '4 ans',   days: 1460 },
] as const;

const CANDLES_PER_DAY: Record<string, number> = { '5m': 288, '15m': 96, '1h': 24, '4h': 6 };

const YF_MAX_DAYS: Record<string, number> = { '5m': 59, '15m': 59, '1h': 729, '4h': 729 };

const SOURCE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  binance: { label: 'Binance API',   color: '#f0b90b', desc: 'Données temps réel — nécessite accès réseau Binance' },
  yfinance: { label: 'Yahoo Finance', color: '#7c3aed', desc: 'Données historiques gratuites — disponible partout' },
  csv:      { label: 'Fichier CSV',   color: '#06b6d4', desc: 'Import manuel depuis fichier local (pandas)' },
};

function candleCount(tf: string, days: number) {
  return (CANDLES_PER_DAY[tf] ?? 24) * days;
}

type ImportResult = {
  ok: boolean;
  symbol?: string;
  timeframe?: string;
  source?: string;
  inserted?: number;
  downloaded?: number;
  skipped?: number;
  period_start?: string;
  period_end?: string;
  error?: string;
};

export function DataManagerPage({ onNavigate }: Props) {
  const { data: settings } = useApi(() => api.config());
  const { data: byQuote } = useApi(() => api.symbolsByQuote());
  const { data: prices } = useApi(() => api.symbolPrices());
  const { data: stats, reload: refreshStats } = useApi(() => api.dataStats());
  const { data: candles, reload: refreshCandles } = useApi(() => api.candles('?limit=50'));
  const { data: dbStats, reload: refreshDbStats } = useApi(() => api.dataStats());

  const [quote, setQuote] = useState<string>('USDT');
  const quotes = Object.keys(byQuote ?? { USDT: [] });
  const symbols = (byQuote ?? {})[quote] ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(365);
  const [loading, setLoading] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ symbol: string; tf?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  const [importProcesses, setImportProcesses] = useState<ProcessStatus[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startImportPoll = useCallback((jobIds: string[]) => {
    setActiveJobIds(jobIds);
    const shortIds = jobIds.map(id => `import-${id.slice(0, 8)}`);
    let failCount = 0;
    const startedAt = Date.now();
    const MAX_POLL_MS = 10 * 60 * 1000;

    const cleanup = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setLoading(null);
      setLoadingAll(null);
    };

    const doPoll = () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        cleanup();
        setImportProcesses([]);
        setActiveJobIds([]);
        return;
      }

      api.systemProcesses().then(d => {
        failCount = 0;
        const importProcs = d.processes.filter(p => p.type === 'import' && shortIds.includes(p.id));
        setImportProcesses(importProcs);

        const allDone = importProcs.length > 0 && importProcs.every(p => p.status === 'done' || p.status === 'error');
        const allGone = importProcs.length === 0 && Date.now() - startedAt > 5000;
        if (allDone || allGone) {
          cleanup();
          refreshStats();
          refreshCandles();
          setTimeout(() => {
            setActiveJobIds([]);
            setImportProcesses([]);
          }, 5000);
        }
      }).catch(() => {
        failCount++;
        if (failCount >= 5) {
          cleanup();
          setImportProcesses([]);
          setActiveJobIds([]);
        }
      });
    };

    doPoll();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(doPoll, 3000);
  }, [refreshStats, refreshCandles]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const candleSource = (settings as Record<string, unknown> | null)?.data
    ? ((settings as Record<string, Record<string, unknown>>).data.candle_source as string) ?? 'yfinance'
    : 'yfinance';

  const fileRef = useRef<HTMLInputElement>(null);
  const [csvSymbol, setCsvSymbol] = useState('BTCUSDT');
  const [csvTf, setCsvTf] = useState('1h');
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);

  const toggle = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const sourceInfo = SOURCE_INFO[candleSource] ?? SOURCE_INFO.yfinance;

  const importTf = async (tf: string) => {
    if (selected.size === 0) return;
    setLoading(tf);
    if (!loadingAll) setResults([]);
    const syms = Array.from(selected);
    try {
      const res = await api.fetchCandles({ symbols: syms, timeframe: tf, days }) as Record<string, unknown>;
      if (res.async === true) {
        const jobs = (res.jobs as { job_id: string; symbol: string; timeframe: string }[]) ?? [];
        startImportPoll(jobs.map(j => j.job_id));
      } else {
        const raw = (res.results as ImportResult[] | undefined) ?? [];
        if (!loadingAll) {
          setResults(raw);
          refreshStats();
          refreshCandles();
          setLoading(null);
        }
      }
    } catch (e) {
      console.error(e);
      if (!loadingAll) {
        setResults([{ ok: false, error: String(e) }]);
        setLoading(null);
      }
    }
  };

  const importAllTf = async () => {
    if (selected.size === 0 || loading || loadingAll) return;
    setResults([]);
    const syms = Array.from(selected);
    const allJobIds: string[] = [];
    try {
      for (let i = 0; i < TIMEFRAMES.length; i++) {
        const tf = TIMEFRAMES[i];
        setLoadingAll(`${tf.label} (${i + 1}/${TIMEFRAMES.length})`);
        setLoading(tf.value);
        try {
          const res = await api.fetchCandles({ symbols: syms, timeframe: tf.value, days }) as Record<string, unknown>;
          if (res.async === true) {
            const jobs = (res.jobs as { job_id: string; symbol: string; timeframe: string }[]) ?? [];
            allJobIds.push(...jobs.map(j => j.job_id));
          }
        } catch (e) {
          console.error(e);
          setResults(prev => [...prev, { ok: false, error: `${tf.label}: ${String(e)}` }]);
        }
      }
      if (allJobIds.length > 0) {
        startImportPoll(allJobIds);
      } else {
        setLoading(null);
        setLoadingAll(null);
        refreshStats();
        refreshCandles();
      }
    } catch {
      setLoading(null);
      setLoadingAll(null);
    }
  };

  const importAllBinance = async () => {
    if (selected.size === 0 || bulkLoading || loading || loadingAll) return;
    setBulkLoading(true);
    setResults([]);
    const syms = Array.from(selected);
    try {
      const res = await api.fetchBulk({
        symbols: syms,
        timeframes: ['5m', '15m', '1h', '4h'],
        days,
        source: 'binance',
      }) as Record<string, unknown>;
      if (res.async === true) {
        const jobs = (res.jobs as { job_id: string; symbol: string; timeframe: string }[]) ?? [];
        startImportPoll(jobs.map(j => j.job_id));
      }
    } catch (e) {
      console.error(e);
      setResults([{ ok: false, error: String(e) }]);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCsvUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setCsvLoading(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      const res = await api.importCsv({ symbol: csvSymbol, timeframe: csvTf, csv_text: text }) as ImportResult;
      setCsvResult(res);
      refreshStats();
      refreshCandles();
    } catch (e) {
      setCsvResult({ ok: false, error: String(e) });
    } finally {
      setCsvLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCandles({ symbol: deleteTarget.symbol, timeframe: deleteTarget.tf });
      refreshStats();
      refreshCandles();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const totalCandles = Number(stats?.total_candles ?? 0);
  const trackedCount = (stats?.tracked_symbols as string[] | undefined)?.length ?? 0;
  const selectedPeriod = PERIODS.find(p => p.days === days) ?? PERIODS[3];

  return (
    <section>
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Données de marché</h2>
          <p className="page-description">Import et gestion des bougies historiques</p>
        </div>
        {onNavigate && (
          <button className="btn btn-primary" onClick={() => onNavigate('Stratégie')}>
            Configurer la stratégie →
          </button>
        )}
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card stat-card-accent-blue">
          <div className="stat-num" style={{ color: 'var(--accent)', fontSize: 28 }}>{totalCandles.toLocaleString()}</div>
          <div className="stat-lbl">Bougies en base</div>
        </div>
        <div className="stat-card stat-card-accent-yellow">
          <div className="stat-num" style={{ color: 'var(--accent-yellow)' }}>{trackedCount}</div>
          <div className="stat-lbl">Symboles chargés</div>
        </div>
        <div className="stat-card stat-card-accent-green">
          <div className="stat-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-green)' }}>
            {stats?.last_candle_at ? fmtDateTime(String(stats.last_candle_at)) : '—'}
          </div>
          <div className="stat-lbl">Dernière ingestion</div>
        </div>
      </div>

      <div
        style={{
          marginBottom: 20, padding: '10px 16px', borderRadius: 8,
          border: `1px solid ${sourceInfo.color}44`,
          background: `${sourceInfo.color}11`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
            background: `${sourceInfo.color}22`, color: sourceInfo.color, letterSpacing: 0.4,
          }}>
            {sourceInfo.label}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sourceInfo.desc}</span>
        </div>
        {onNavigate && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '4px 12px', whiteSpace: 'nowrap' }}
            onClick={() => onNavigate('Paramètres')}
          >
            ⚙ Changer la source
          </button>
        )}
      </div>

      <div className="grid-2">
        <div>
          {candleSource !== 'csv' ? (
            <div className="card">
              <div className="section-title">1 — Sélectionner les cryptos</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {quotes.map(q => (
                  <button key={q} onClick={() => { setQuote(q); setSelected(new Set()); }}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${quote === q ? 'var(--accent)' : 'var(--border)'}`,
                      background: quote === q ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                      color: quote === q ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >{q}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSelected(new Set(symbols))}>Tout</button>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSelected(new Set())}>Aucun</button>
                <span className="muted" style={{ lineHeight: '28px', fontSize: 12 }}>{selected.size} sélectionné(s)</span>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6, maxHeight: 220, overflowY: 'auto',
              }}>
                {symbols.map(sym => (
                  <label
                    key={sym}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                      background: selected.has(sym) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      border: `1px solid ${selected.has(sym) ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 12, userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(sym)}
                      onChange={() => toggle(sym)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    {sym.replace(/USDT$|USDC$|BTC$/, '')}
                    {prices?.[sym] && (
                      <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>
                        ${prices[sym] >= 1000
                          ? (prices[sym] / 1000).toFixed(0) + 'k'
                          : prices[sym] < 1
                            ? prices[sym].toFixed(4)
                            : prices[sym].toFixed(2)}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <div className="section-title" style={{ marginTop: 20 }}>2 — Période de chargement</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {PERIODS.map(p => (
                  <button
                    key={p.days}
                    onClick={() => setDays(p.days)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${days === p.days ? 'var(--accent)' : 'var(--border)'}`,
                      background: days === p.days ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                      color: days === p.days ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="section-title">3 — Importer les données</div>

              <button
                className="btn btn-primary"
                style={{
                  width: '100%', padding: '14px 20px', fontSize: 14, fontWeight: 700,
                  marginBottom: 8, letterSpacing: 0.3,
                  background: bulkLoading
                    ? 'linear-gradient(135deg, rgba(240,185,11,0.25), rgba(240,185,11,0.15))'
                    : 'linear-gradient(135deg, #f0b90b, #e58e00)',
                  border: bulkLoading ? '1px solid rgba(240,185,11,0.4)' : 'none',
                  color: '#000',
                  boxShadow: bulkLoading ? 'none' : '0 0 12px rgba(240,185,11,0.35)',
                }}
                disabled={!!loading || !!loadingAll || bulkLoading || selected.size === 0 || activeJobIds.length > 0}
                onClick={importAllBinance}
              >
                {bulkLoading
                  ? 'Binance — Import en cours…'
                  : `Binance — Fetch 5m + 15m + 1h + 4h (${days}j)`}
              </button>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, paddingLeft: 2 }}>
                Utilise l'API publique Binance — données réelles 15m/5m sans limite yfinance
              </div>

              <button
                className="btn btn-secondary"
                style={{
                  width: '100%', padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  marginBottom: 12,
                  background: loadingAll
                    ? 'rgba(59,130,246,0.08)'
                    : 'var(--surface2)',
                }}
                disabled={!!loading || !!loadingAll || bulkLoading || selected.size === 0 || activeJobIds.length > 0}
                onClick={importAllTf}
              >
                {loadingAll
                  ? `Import ${loadingAll}…`
                  : `Source actuelle — tous les TF (${candleSource})`}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TIMEFRAMES.map(tf => {
                  const maxDays = YF_MAX_DAYS[tf.value] ?? 730;
                  const effectiveDays = candleSource === 'yfinance' ? Math.min(days, maxDays) : days;
                  const n = candleCount(tf.value, effectiveDays);
                  const capped = candleSource === 'yfinance' && days > maxDays;
                  return (
                    <div
                      key={tf.value}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 8,
                        background: loading === tf.value
                          ? 'rgba(59,130,246,0.08)'
                          : 'var(--surface2)',
                        border: `1px solid ${loading === tf.value ? 'rgba(59,130,246,0.25)' : 'var(--border)'}`,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{tf.label}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          ~{n.toLocaleString()} bougies
                          {capped
                            ? <span style={{ color: '#f59e0b', marginLeft: 4 }}>(limité à {maxDays}j par Yahoo Finance)</span>
                            : <span> · {selectedPeriod.label}</span>
                          }
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{ minWidth: 120, fontSize: 12 }}
                        disabled={!!loading || !!loadingAll || selected.size === 0 || activeJobIds.length > 0}
                        onClick={() => importTf(tf.value)}
                      >
                        {loading === tf.value ? 'En cours…' : `Importer ${tf.label}`}
                      </button>
                    </div>
                  );
                })}
              </div>

              {importProcesses.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {importProcesses.map(proc => (
                    <div
                      key={proc.id}
                      style={{
                        padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                        background: proc.status === 'error' ? 'rgba(239,68,68,0.08)' : proc.status === 'done' ? 'rgba(34,197,94,0.08)' : 'rgba(6,182,212,0.08)',
                        border: `1px solid ${proc.status === 'error' ? 'rgba(239,68,68,0.25)' : proc.status === 'done' ? 'rgba(34,197,94,0.25)' : 'rgba(6,182,212,0.25)'}`,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: proc.status === 'running' ? 6 : 0 }}>
                        <span style={{ fontWeight: 600 }}>
                          {proc.status === 'done' ? '✅' : proc.status === 'error' ? '❌' : '⏳'}{' '}
                          {proc.label}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{proc.detail}</span>
                      </div>
                      {proc.status === 'running' && proc.pct_done !== undefined && (
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(100,116,139,0.15)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${proc.pct_done}%`,
                            background: '#06b6d4',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {results.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {results.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                        background: r.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${r.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                        fontSize: 12,
                      }}
                    >
                      {r.ok ? (
                        <span>
                          ✅ <strong>{r.symbol}</strong> {r.timeframe} via <em>{r.source}</em> —{' '}
                          {r.inserted?.toLocaleString()} insérées, {r.skipped?.toLocaleString()} existantes
                          {r.period_start && ` (${r.period_start} → ${r.period_end})`}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent-red)' }}>
                          ❌ {r.symbol ?? 'Erreur'}: {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="section-title">Import depuis fichier CSV</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Format attendu : <code>timestamp,open,high,low,close,volume</code>
                <br />timestamp = ISO string, Unix secondes ou Unix millisecondes
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Symbole</label>
                  <input
                    value={csvSymbol}
                    onChange={e => setCsvSymbol(e.target.value.toUpperCase())}
                    placeholder="ex: BTCUSDT"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Timeframe</label>
                  <select
                    value={csvTf}
                    onChange={e => setCsvTf(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13 }}
                  >
                    {TIMEFRAMES.map(tf => (
                      <option key={tf.value} value={tf.value}>{tf.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fichier CSV</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCsvUpload}
                  disabled={csvLoading}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {csvLoading ? 'Import en cours…' : 'Importer le CSV'}
                </button>

                {csvResult && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: csvResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${csvResult.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    fontSize: 12,
                  }}>
                    {csvResult.ok ? (
                      <span>
                        ✅ <strong>{csvResult.symbol}</strong> {csvResult.timeframe} —{' '}
                        {(csvResult as Record<string, unknown>).parsed as number} bougies lues,{' '}
                        {csvResult.inserted} insérées, {csvResult.skipped} existantes
                        {csvResult.period_start && ` (${csvResult.period_start} → ${csvResult.period_end})`}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-red)' }}>❌ {csvResult.error}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Couverture DB par TF</h3>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => { refreshStats(); refreshDbStats(); }}
              >↻ Actualiser</button>
            </div>
            {(() => {
              const coverage = (dbStats?.coverage as Array<{symbol: string; timeframe: string; count: number; from: string; to: string}> | undefined) ?? [];
              const allSymbols = [...new Set(coverage.map(c => c.symbol))].sort();
              const allTfs = ['5m', '15m', '1h', '4h'];
              if (allSymbols.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: 24, opacity: 0.5, fontSize: 13 }}>
                    Aucune donnée — importez des bougies
                  </div>
                );
              }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>Symbole</th>
                        {allTfs.map(tf => (
                          <th key={tf} style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>{tf}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allSymbols.map(sym => (
                        <tr key={sym}>
                          <td style={{ padding: '8px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                            {sym.replace('USDT', '')}
                          </td>
                          {allTfs.map(tf => {
                            const cell = coverage.find(c => c.symbol === sym && c.timeframe === tf);
                            return (
                              <td key={tf} style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                                {cell ? (
                                  <div>
                                    <div style={{
                                      display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                                      fontSize: 11, fontWeight: 700,
                                      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                                      marginBottom: 2,
                                    }}>
                                      {cell.count.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                                      {cell.from}<br/>{cell.to}
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{
                                    display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                                    fontSize: 11, background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                  }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          <div className="card">
            <h3>Bougies récentes</h3>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbole</th>
                    <th>TF</th>
                    <th>Ouv.</th>
                    <th>Haut</th>
                    <th>Bas</th>
                    <th>Clôture</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(candles?.rows as Array<Record<string, unknown>> | undefined)?.map((row, i) => (
                    <tr key={i}>
                      <td className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                        {fmtDateTime(String(row.timestamp))}
                      </td>
                      <td><strong style={{ fontSize: 12 }}>{String(row.symbol).replace('USDT', '')}</strong></td>
                      <td><span className="tag">{String(row.timeframe)}</span></td>
                      <td style={{ fontSize: 12 }}>{Number(row.open).toFixed(2)}</td>
                      <td style={{ fontSize: 12, color: 'var(--accent-green)' }}>{Number(row.high).toFixed(2)}</td>
                      <td style={{ fontSize: 12, color: 'var(--accent-red)' }}>{Number(row.low).toFixed(2)}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{Number(row.close).toFixed(2)}</td>
                      <td>
                        <button
                          title={`Supprimer toutes les bougies ${row.symbol}`}
                          onClick={() => setDeleteTarget({ symbol: String(row.symbol) })}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: 13, padding: '2px 6px',
                          }}
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                  {(!candles?.rows || (candles.rows as unknown[]).length === 0) && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, opacity: 0.5 }}>
                        Aucune bougie — importez des données
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Supprimer des données</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Supprimer toutes les bougies d'un symbole (optionellement un timeframe spécifique).
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                placeholder="Symbole (ex: BTCUSDT)"
                style={{ flex: 1, minWidth: 140, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}
                onKeyDown={e => {
                  const val = (e.target as HTMLInputElement).value.toUpperCase().trim();
                  if (e.key === 'Enter' && val) setDeleteTarget({ symbol: val });
                }}
                onChange={e => {
                  const val = e.target.value.toUpperCase().trim();
                  if (val) setDeleteTarget({ symbol: val });
                }}
              />
              <button
                className="btn btn-danger"
                disabled={!deleteTarget?.symbol || deleting}
                onClick={handleDelete}
                style={{ whiteSpace: 'nowrap' }}
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {deleteTarget && !deleting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div className="card" style={{ maxWidth: 400, width: '90%', textAlign: 'center' }}>
            <h3 style={{ marginBottom: 12 }}>Confirmer la suppression</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Supprimer toutes les bougies de <strong>{deleteTarget.symbol}</strong>
              {deleteTarget.tf ? ` (${deleteTarget.tf})` : ' (tous les timeframes)'}?
              <br />Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={handleDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
