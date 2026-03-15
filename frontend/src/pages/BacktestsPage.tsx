import React, { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { AdminPage } from '../types';
import type { BacktestResult, ProcessStatus, Signal } from '../services/api';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function num(n: number, d = 2) { return n.toFixed(d); }
function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toFixed(2);
  if (n >= 1)     return n.toFixed(4);
  return n.toFixed(6);
}
function qualityBadge(wr: number, pf: number, dd: number) {
  const score = (wr >= 0.55 ? 2 : wr >= 0.45 ? 1 : 0)
              + (pf >= 1.5 ? 2 : pf >= 1.1 ? 1 : 0)
              + (dd <= 0.08 ? 2 : dd <= 0.15 ? 1 : 0);
  if (score >= 5) return { label: 'Excellent',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (score >= 3) return { label: 'Bon',          color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  if (score >= 2) return { label: 'Attention',    color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  return            { label: 'Insuffisant',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}
function colorFor(val: number, goodAbove: number, warnAbove: number) {
  return val >= goodAbove ? 'var(--accent-green)' : val >= warnAbove ? 'var(--accent-yellow)' : 'var(--accent-red)';
}

/* ── ExpandedSignals ─────────────────────────────────────────────────────── */
function ExpandedSignals({ r }: { r: BacktestResult }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSignals([]);
    const firstSymbol = r.symbol.split(',')[0].trim();
    api.signalsForBacktest(r.pipeline_run_id, firstSymbol)
      .then(res => { if (!cancelled) setSignals(res.rows); })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [r.pipeline_run_id, r.symbol]);

  if (loading) return (
    <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Chargement des signaux…</div>
  );
  if (error) return (
    <div style={{ padding: '12px 20px', color: 'var(--accent-red)', fontSize: 12 }}>{error}</div>
  );
  if (signals.length === 0) return (
    <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Aucun signal accepté pour ce backtest.</div>
  );

  return (
    <div style={{ padding: '12px 20px 16px', background: 'rgba(6,9,15,0.6)', borderTop: '1px solid rgba(59,130,246,0.15)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            {['Timestamp','Symbole','Direction','Outcome','R','Entry','SL','TP'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map(sig => {
            const dC = sig.direction === 'LONG' ? '#22c55e' : sig.direction === 'SHORT' ? '#ef4444' : '#9ca3af';
            const oC = sig.bt_outcome === 'win' ? '#22c55e' : sig.bt_outcome === 'loss' ? '#ef4444' : '#eab308';
            const oL = sig.bt_outcome === 'win' ? '✓ Win' : sig.bt_outcome === 'loss' ? '✗ Loss' : sig.bt_outcome === 'timeout' ? '⏱ TO' : '—';
            const rVal = sig.bt_r_multiple ?? 0;
            return (
              <tr key={sig.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                  {sig.timestamp ? new Date(sig.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{sig.symbol}</td>
                <td style={{ padding: '4px 8px', color: dC, fontWeight: 600 }}>{sig.direction || '—'}</td>
                <td style={{ padding: '4px 8px', color: oC, fontWeight: 600 }}>{oL}</td>
                <td style={{ padding: '4px 8px', color: rVal > 0 ? '#22c55e' : rVal < 0 ? '#ef4444' : '#eab308', fontWeight: 700 }}>
                  {rVal > 0 ? '+' : ''}{rVal.toFixed(2)}R
                </td>
                <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {sig.entry_price ? fmtPrice(sig.entry_price) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: '#ef4444', fontFamily: 'monospace' }}>
                  {sig.sl_price ? fmtPrice(sig.sl_price) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: '#22c55e', fontFamily: 'monospace' }}>
                  {sig.tp_price ? fmtPrice(sig.tp_price) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── BacktestRow ─────────────────────────────────────────────────────────── */
function BacktestRow({
  r, selected, onSelect, onOptimize, onCompare,
}: {
  r: BacktestResult;
  selected: boolean;
  onSelect: () => void;
  onOptimize: () => void;
  onCompare: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const q = qualityBadge(r.win_rate, r.profit_factor, r.drawdown);
  const dateRange = r.date_from && r.date_to
    ? `${r.date_from} → ${r.date_to}`
    : new Date(r.timestamp).toLocaleDateString('fr-FR');

  return (
    <>
      <tr
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <td style={{ padding: '10px 8px' }}>
          <input type="checkbox" checked={selected} onChange={onSelect} onClick={e => e.stopPropagation()} />
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }} onClick={() => setExpanded(!expanded)}>
          <span style={{ marginRight: 6, opacity: 0.5 }}>{expanded ? '▾' : '▸'}</span>
          {r.symbol}
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-muted)', fontSize: 11 }} onClick={() => setExpanded(!expanded)}>
          {dateRange}
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }} onClick={() => setExpanded(!expanded)}>
          {r.signal_count ?? '—'}
          {r.step_count ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> / {r.step_count} steps</span> : null}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: colorFor(r.win_rate, 0.5, 0.42), fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {pct(r.win_rate)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: colorFor(r.profit_factor, 1.5, 1.1), fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {num(r.profit_factor)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: r.drawdown <= 0.1 ? '#22c55e' : r.drawdown <= 0.2 ? '#eab308' : '#ef4444', fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {pct(r.drawdown)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={() => setExpanded(!expanded)}>
          <span style={{ padding: '2px 8px', borderRadius: 4, background: q.bg, color: q.color, fontSize: 11, fontWeight: 600 }}>{q.label}</span>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <button onClick={onOptimize} style={{ marginRight: 6, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.4)', background: 'transparent', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>AI</button>
          <button onClick={onCompare} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>Comparer</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <ExpandedSignals r={r} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── ComparePanel ────────────────────────────────────────────────────────── */
function delta(a: number, b: number, higherIsBetter = true) {
  const d = a - b;
  const good = higherIsBetter ? d > 0 : d < 0;
  const sign = d > 0 ? '+' : '';
  return <span style={{ color: good ? '#22c55e' : '#ef4444', fontSize: 11 }}>{sign}{d.toFixed(3)}</span>;
}
function ComparePanel({ a, b, onClose }: { a: BacktestResult; b: BacktestResult; onClose: () => void }) {
  const rows: [string, (r: BacktestResult) => string, boolean][] = [
    ['Win Rate',      r => pct(r.win_rate),      true],
    ['Profit Factor', r => num(r.profit_factor), true],
    ['Drawdown',      r => pct(r.drawdown),      false],
    ['Expectancy',    r => num(r.expectancy, 4), true],
    ['R Multiple',    r => num(r.r_multiple) + 'R', true],
    ['Signals',       r => String(r.signal_count ?? '—'), true],
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: 24, minWidth: 480, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Comparaison</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Métrique</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>{a.symbol}</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>{b.symbol}</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fn, hib]) => {
              const va = fn(a), vb = fn(b);
              const na = parseFloat(va), nb = parseFloat(vb);
              return (
                <tr key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{label}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{va}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{vb}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{!isNaN(na) && !isNaN(nb) ? delta(na, nb, hib) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── OptimizePanel ───────────────────────────────────────────────────────── */
function OptimizePanel({ result, onClose }: { result: BacktestResult; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError(''); setAnalysis(null);
    try {
      const res = await api.optimizeBacktest(result.id);
      setAnalysis(res.analysis as Record<string, unknown>);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: 24, width: 540, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Optimisation IA — {result.symbol}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {!analysis && !loading && (
          <button onClick={run} style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
            Lancer l'analyse GPT-4o
          </button>
        )}
        {loading && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Analyse en cours…</p>}
        {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}
        {analysis && (
          <div>
            {(analysis.summary as string | undefined) && (
              <p style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{analysis.summary as string}</p>
            )}
            {(analysis.recommendations as unknown[] | undefined)?.map((rec, i) => {
              const r = rec as Record<string, unknown>;
              return (
                <div key={i} style={{ padding: '10px 12px', marginBottom: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6, borderLeft: '3px solid rgba(59,130,246,0.5)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{r.title as string}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{r.description as string}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── BacktestProcessCard ─────────────────────────────────────────────────── */
function BacktestProcessCard({ onDone }: { onDone?: () => void }) {
  const [processes, setProcesses] = useState<ProcessStatus[]>([]);
  const [stopping, setStopping] = useState(false);

  const load = () => {
    api.systemProcesses().then(d => {
      const prev = processes;
      const bt = d.processes.filter(p => p.type === 'backtest' || p.type === 'import');
      setProcesses(bt);
      const wasRunning = prev.some(p => p.status === 'running');
      const nowDone    = bt.every(p => p.status !== 'running');
      if (wasRunning && nowDone && onDone) onDone();
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, []);

  const handleStop = async () => {
    setStopping(true);
    try { await api.autonomousStop(); } catch { /**/ }
    setTimeout(() => { load(); setStopping(false); }, 1000);
  };

  const running = processes.filter(p => p.status === 'running');
  if (processes.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: running.length > 0 ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: running.length > 0 ? '#a855f7' : 'var(--text-muted)',
            boxShadow: running.length > 0 ? '0 0 8px #a855f7' : 'none',
            animation: running.length > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: running.length > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
            {running.length > 0 ? `Backtest en cours (${running.length})` : 'Processus terminé'}
          </span>
        </div>
        {running.length > 0 && (
          <button
            onClick={handleStop}
            disabled={stopping}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              border: '1px solid rgba(239,68,68,0.45)',
              background: stopping ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.13)',
              color: 'var(--accent-red)', cursor: stopping ? 'default' : 'pointer',
              opacity: stopping ? 0.6 : 1,
            }}
          >
            {stopping ? 'Arrêt…' : '⏹ Arrêter'}
          </button>
        )}
      </div>

      {processes.map(p => {
        const isRunning = p.status === 'running';
        return (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderTop: '1px solid rgba(168,85,247,0.12)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: isRunning ? 'var(--text)' : 'var(--text-muted)' }}>
                {p.label}
              </div>
              {p.detail && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.detail}
                </div>
              )}
              {p.pct_done !== undefined && (
                <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'rgba(168,85,247,0.15)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.4s ease',
                    width: `${p.pct_done ?? 0}%`,
                    background: p.status === 'error' ? 'var(--accent-red)' : '#a855f7',
                  }} />
                </div>
              )}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
              background: isRunning ? 'rgba(168,85,247,0.15)' : 'rgba(100,116,139,0.12)',
              color: isRunning ? '#a855f7' : 'var(--text-muted)',
            }}>
              {isRunning ? 'En cours' : p.status === 'error' ? 'Erreur' : 'Terminé'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── LaunchForm ──────────────────────────────────────────────────────────── */
const DURATIONS = ['1m', '3m', '6m', '1y', '2y'];

function LaunchForm({ onLaunched }: { onLaunched: () => void }) {
  const { data: symbolsData } = useApi(() => api.symbols());
  const { data: profilesData } = useApi(() => api.strategyProfiles());

  const btUniverse: string[] = Array.isArray(symbolsData) ? symbolsData.filter((s: string) => s.endsWith('USDT')) : [];
  const profiles: Array<Record<string, unknown>> = (profilesData?.rows as Array<Record<string, unknown>> | undefined) ?? [];

  const [selected, setSelected] = useState<string[]>(['FETUSDT']);
  const [duration, setDuration] = useState('1y');
  const [profileId, setProfileId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError]   = useState('');

  const toggle = (s: string) => setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const launch = async () => {
    if (selected.length === 0) { setError('Sélectionnez au moins 1 symbole.'); return; }
    setRunning(true); setResult(null); setError('');
    try {
      const body: Record<string, unknown> = { symbols: selected, duration };
      if (profileId) body.profile_id = parseInt(profileId, 10);
      const res = await api.runBacktest(body);
      const n = (res.signal_count as number | undefined) ?? 0;
      setResult(`✓ Backtest terminé — ${n} signal${n !== 1 ? 's' : ''} accepté${n !== 1 ? 's' : ''}`);
      onLaunched();
    } catch (e) { setError(String(e)); }
    finally { setRunning(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, fontSize: 14 }}>Nouveau backtest walk-forward</div>

      {/* Symbols grid */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>
          Symboles — {selected.length} sélectionné(s)
          <button onClick={() => setSelected([...btUniverse])} style={{ marginLeft: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>Tous</button>
          <button onClick={() => setSelected([])} style={{ marginLeft: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>Aucun</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {btUniverse.map(s => {
            const on = selected.includes(s);
            return (
              <button key={s} onClick={() => toggle(s)} style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: on ? 700 : 400,
                background: on ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${on ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: on ? 'var(--accent)' : 'var(--text-muted)',
              }}>{s.replace('USDT', '')}</button>
            );
          })}
        </div>
      </div>

      {/* Durée + Profil */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>Durée</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DURATIONS.map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                background: duration === d ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${duration === d ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: duration === d ? 'var(--accent)' : 'var(--text-muted)', fontWeight: duration === d ? 700 : 400,
              }}>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>Profil stratégie</div>
          <select value={profileId} onChange={e => setProfileId(e.target.value)} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
            color: 'var(--text-primary)', fontSize: 12, padding: '5px 10px',
          }}>
            <option value=''>Défaut (SMC/Wyckoff)</option>
            {profiles.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {result && <div style={{ color: '#22c55e', fontSize: 12, marginBottom: 10 }}>{result}</div>}

      <button onClick={launch} disabled={running} style={{
        padding: '9px 28px', borderRadius: 6, fontSize: 13, cursor: running ? 'default' : 'pointer', fontWeight: 700,
        background: running ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.25)',
        border: '1px solid rgba(59,130,246,0.5)', color: running ? 'var(--text-muted)' : 'var(--accent)',
        opacity: running ? 0.7 : 1,
      }}>
        {running ? 'Backtest en cours…' : 'Lancer le backtest'}
      </button>
    </div>
  );
}

/* ── BacktestsPage ───────────────────────────────────────────────────────── */
export function BacktestsPage({ onNavigate: _onNavigate }: { onNavigate?: (page: AdminPage) => void } = {}) {
  const { data, reload } = useApi(() => api.backtests('?limit=100&order=-timestamp'));
  const rows: BacktestResult[] = (data?.rows ?? []) as BacktestResult[];

  const [compareA, setCompareA]       = useState<BacktestResult | null>(null);
  const [compareB, setCompareB]       = useState<BacktestResult | null>(null);
  const [optimizeTarget, setOptimize] = useState<BacktestResult | null>(null);
  const [compareQueue, setCompareQueue] = useState<number[]>([]);

  const handleCompare = (r: BacktestResult) => {
    if (compareQueue.includes(r.id)) {
      setCompareQueue(q => q.filter(id => id !== r.id));
      return;
    }
    const next = [...compareQueue, r.id];
    if (next.length >= 2) {
      const [idA, idB] = next;
      const a = rows.find(x => x.id === idA);
      const b = rows.find(x => x.id === idB);
      if (a && b) { setCompareA(a); setCompareB(b); }
      setCompareQueue([]);
    } else {
      setCompareQueue(next);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)', fontWeight: 800 }}>Backtests</h1>
        <button onClick={reload} style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          Rafraîchir
        </button>
      </div>

      <LaunchForm onLaunched={reload} />

      <BacktestProcessCard onDone={reload} />

      {compareQueue.length === 1 && (
        <div style={{ padding: '8px 14px', marginBottom: 12, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, color: '#eab308', fontSize: 12 }}>
          Cliquez sur "Comparer" d'un second backtest pour voir la comparaison.
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun backtest enregistré. Lancez un premier backtest ci-dessus.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(59,130,246,0.07)', color: 'var(--text-muted)', fontSize: 11 }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 28 }}></th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Symboles</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Période</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Signaux</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>WR%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>PF</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>DD%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Qualité</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <BacktestRow
                  key={r.id}
                  r={r}
                  selected={compareQueue.includes(r.id)}
                  onSelect={() => handleCompare(r)}
                  onOptimize={() => setOptimize(r)}
                  onCompare={() => handleCompare(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compareA && compareB && (
        <ComparePanel a={compareA} b={compareB} onClose={() => { setCompareA(null); setCompareB(null); }} />
      )}
      {optimizeTarget && (
        <OptimizePanel result={optimizeTarget} onClose={() => setOptimize(null)} />
      )}
    </div>
  );
}
