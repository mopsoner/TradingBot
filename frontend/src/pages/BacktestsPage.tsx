import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { AdminPage } from '../types';
import type { BacktestResult, ReplayStatusResponse, ReplayTrade } from '../services/api';

function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function num(n: number, d = 2) { return n.toFixed(d); }
function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
function qualityBadge(wr: number, pf: number, dd: number) {
  const score = (wr >= 0.55 ? 2 : wr >= 0.45 ? 1 : 0)
    + (pf >= 1.5 ? 2 : pf >= 1.1 ? 1 : 0)
    + (dd <= 0.08 ? 2 : dd <= 0.15 ? 1 : 0);
  if (score >= 5) return { label: 'Excellent', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (score >= 3) return { label: 'Bon', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  if (score >= 2) return { label: 'Attention', color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  return { label: 'Insuffisant', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: '1 1 140px', padding: '14px 16px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

function biasBadge(bias: string | undefined) {
  if (!bias || bias === 'neutral') return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>;
  const c = bias === 'LONG' ? '#22c55e' : '#ef4444';
  return <span style={{ color: c, fontWeight: 700, fontSize: 10 }}>{bias}</span>;
}

function TradesTable({ trades }: { trades: ReplayTrade[] }) {
  if (trades.length === 0) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>Aucun trade.</div>
  );
  const hasMultiTf = trades.some(t => t.htf_bias !== undefined);
  const headers = ['#', 'Date', 'Dir', 'Entry', 'SL', 'TP', 'Res', 'R',
    ...(hasMultiTf ? ['4H Biais', '1H Struct'] : [])];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '8px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const dirColor = t.direction === 'LONG' ? '#22c55e' : '#ef4444';
            const resColor = t.result === 'TP' ? '#22c55e' : t.result === 'SL' ? '#ef4444' : '#eab308';
            const rColor = t.r_multiple > 0 ? '#22c55e' : t.r_multiple < 0 ? '#ef4444' : 'var(--text-muted)';
            return (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{i + 1}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
                  {t.timestamp ? new Date(t.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                </td>
                <td style={{ padding: '6px 8px', color: dirColor, fontWeight: 700 }}>{t.direction}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{fmtPrice(t.entry_price)}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#ef4444' }}>{fmtPrice(t.sl_price)}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#22c55e' }}>{fmtPrice(t.tp_price)}</td>
                <td style={{ padding: '6px 8px', color: resColor, fontWeight: 700 }}>{t.result}</td>
                <td style={{ padding: '6px 8px', color: rColor, fontWeight: 700, fontFamily: 'monospace' }}>
                  {t.r_multiple > 0 ? '+' : ''}{t.r_multiple.toFixed(2)}R
                </td>
                {hasMultiTf && <td style={{ padding: '6px 8px' }}>{biasBadge(t.htf_bias)}</td>}
                {hasMultiTf && <td style={{ padding: '6px 8px' }}>{biasBadge(t.tf_1h_structure)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReplayLauncher({ onCompleted }: { onCompleted: () => void }) {
  const { data: loadedData } = useApi(() => api.loadedSymbols());
  const { data: profilesData } = useApi(() => api.strategyProfiles());
  const loaded = Array.isArray(loadedData) ? loadedData : [];
  const availableSymbols = loaded.map(s => s.symbol);
  const profiles: { id: number; name: string }[] = Array.isArray((profilesData as { rows?: unknown[] })?.rows)
    ? ((profilesData as { rows: { id: number; name: string }[] }).rows)
    : [];

  const [symbol, setSymbol] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReplayStatusResponse | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (availableSymbols.length > 0 && !symbol) {
      setSymbol(availableSymbols[0]);
    }
  }, [availableSymbols]);

  useEffect(() => {
    if (loaded.length > 0 && symbol) {
      const info = loaded.find(s => s.symbol === symbol);
      if (info?.min_ts && !dateStart) setDateStart(info.min_ts);
      if (info?.max_ts && !dateEnd) setDateEnd(info.max_ts);
    }
  }, [symbol, loaded]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback((sid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.replayStatus(sid);
        if (!res.ok) {
          stopPolling();
          setRunning(false);
          setStatus({ ok: false, status: 'FAILED', error: res.reason || 'Session perdue.' } as ReplayStatusResponse);
          return;
        }
        setStatus(res);
        if (res.status === 'COMPLETED' || res.status === 'FAILED') {
          stopPolling();
          setRunning(false);
          if (res.status === 'COMPLETED') onCompleted();
        }
      } catch {
        stopPolling();
        setRunning(false);
        setError('Erreur de communication avec le serveur.');
      }
    }, 2000);
  }, [stopPolling, onCompleted]);

  const launch = async () => {
    if (!symbol || !dateStart || !dateEnd) {
      setError('Remplissez tous les champs.');
      return;
    }
    setRunning(true);
    setError('');
    setStatus(null);
    setSessionId(null);
    try {
      const res = await api.replayStart({ symbol, date_start: dateStart, date_end: dateEnd, profile_id: profileId });
      if (!res.ok || !res.session_id) {
        setError(res.reason || 'Erreur au lancement.');
        setRunning(false);
        return;
      }
      setSessionId(res.session_id);
      setStatus({ ok: true, session_id: res.session_id, status: 'RUNNING', candles_processed: 0, total_candles: 0 } as ReplayStatusResponse);
      pollStatus(res.session_id);
    } catch (e) {
      setError(String(e));
      setRunning(false);
    }
  };

  const reset = () => {
    setSessionId(null);
    setStatus(null);
    setError('');
    setRunning(false);
  };

  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status === 'FAILED';
  const isRunningStatus = status?.status === 'RUNNING';
  const progress = status?.total_candles
    ? Math.round((status.candles_processed || 0) / status.total_candles * 100)
    : 0;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Nouveau backtest (replay)</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)',
          letterSpacing: '0.04em',
        }}>4H / 1H / 15m</span>
      </div>

      {!sessionId && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: '1 1 180px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>Symbole</div>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '6px 10px',
              }}>
                {availableSymbols.length === 0 && <option value=''>Aucune donnée</option>}
                {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>Date debut</div>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '5px 8px',
              }} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>Date fin</div>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '5px 8px',
              }} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>Profil</div>
              <select
                value={profileId ?? ''}
                onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '6px 10px',
                }}
              >
                <option value=''>Profil actif (défaut)</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {error && <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

          <button onClick={launch} disabled={running} style={{
            padding: '9px 28px', borderRadius: 6, fontSize: 13, cursor: running ? 'default' : 'pointer', fontWeight: 700,
            background: running ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.25)',
            border: '1px solid rgba(59,130,246,0.5)', color: running ? 'var(--text-muted)' : 'var(--accent)',
            opacity: running ? 0.7 : 1,
          }}>
            Lancer le backtest
          </button>
        </>
      )}

      {isRunningStatus && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 18, height: 18, border: '3px solid rgba(59,130,246,0.3)',
              borderTop: '3px solid var(--accent)', borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
              En cours...
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {status.symbol} {status.timeframe} — {status.candles_processed || 0} / {status.total_candles || '?'} bougies
          </div>
          <div style={{ width: '100%', maxWidth: 400, height: 6, borderRadius: 3, background: 'rgba(59,130,246,0.15)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, background: 'var(--accent)',
              width: `${progress}%`, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {isFailed && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ color: 'var(--accent-red)', fontWeight: 700, marginBottom: 8 }}>Backtest echoue</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>{status?.error || 'Erreur inconnue.'}</div>
          <button onClick={reset} style={{
            padding: '7px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)',
          }}>Recommencer</button>
        </div>
      )}

      {isCompleted && status?.metrics && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>Backtest termine</span>
              {(() => {
                const q = qualityBadge(status.metrics!.win_rate, status.metrics!.profit_factor, status.metrics!.max_drawdown);
                return <span style={{ padding: '2px 8px', borderRadius: 4, background: q.bg, color: q.color, fontSize: 11, fontWeight: 600 }}>{q.label}</span>;
              })()}
            </div>
            <button onClick={reset} style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)',
            }}>Nouveau backtest</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <MetricCard label="Win Rate" value={pct(status.metrics.win_rate)}
              color={status.metrics.win_rate >= 0.5 ? '#22c55e' : status.metrics.win_rate >= 0.42 ? '#eab308' : '#ef4444'} />
            <MetricCard label="Profit Factor" value={num(status.metrics.profit_factor)}
              color={status.metrics.profit_factor >= 1.5 ? '#22c55e' : status.metrics.profit_factor >= 1.1 ? '#eab308' : '#ef4444'} />
            <MetricCard label="Max Drawdown" value={pct(status.metrics.max_drawdown)}
              color={status.metrics.max_drawdown <= 0.1 ? '#22c55e' : status.metrics.max_drawdown <= 0.2 ? '#eab308' : '#ef4444'} />
            <MetricCard label="Expectancy" value={num(status.metrics.expectancy, 4) + 'R'} />
            <MetricCard label="Trades" value={String(status.metrics.total_trades)} />
            <MetricCard label="Total R" value={(status.metrics.total_r > 0 ? '+' : '') + num(status.metrics.total_r) + 'R'}
              color={status.metrics.total_r > 0 ? '#22c55e' : '#ef4444'} />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {status.metrics.wins} wins / {status.metrics.losses} losses
          </div>

          {status.trades && status.trades.length > 0 && (
            <div style={{
              background: 'rgba(6,9,15,0.5)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, overflow: 'hidden', maxHeight: 400, overflowY: 'auto',
            }}>
              <TradesTable trades={status.trades} />
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function HistoryRow({ r }: { r: BacktestResult }) {
  const [expanded, setExpanded] = useState(false);
  const q = qualityBadge(r.win_rate, r.profit_factor, r.drawdown);
  const dateRange = r.date_from && r.date_to ? `${r.date_from} → ${r.date_to}` : new Date(r.timestamp).toLocaleDateString('fr-FR');

  let trades: ReplayTrade[] = [];
  if (expanded && r.trades_json) {
    try { trades = JSON.parse(r.trades_json); } catch { /**/ }
  }

  const wins = trades.filter(t => t.result === 'TP').length;
  const losses = trades.filter(t => t.result === 'SL').length;
  const totalR = trades.reduce((s, t) => s + (t.r_multiple || 0), 0);

  return (
    <>
      <tr
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.15s' }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
          <span style={{ marginRight: 6, opacity: 0.5 }}>{expanded ? '▾' : '▸'}</span>
          {r.symbol}
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-muted)', fontSize: 11 }}>{r.timeframe}</td>
        <td style={{ padding: '10px 8px', color: 'var(--text-muted)', fontSize: 11 }}>{dateRange}</td>
        <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.strategy_version || '—'}</td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{r.signal_count ?? '-'}</td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: r.win_rate >= 0.5 ? '#22c55e' : r.win_rate >= 0.42 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{pct(r.win_rate)}</td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: r.profit_factor >= 1.5 ? '#22c55e' : r.profit_factor >= 1.1 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{num(r.profit_factor)}</td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: r.drawdown <= 0.1 ? '#22c55e' : r.drawdown <= 0.2 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{pct(r.drawdown)}</td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
          <span style={{ padding: '2px 8px', borderRadius: 4, background: q.bg, color: q.color, fontSize: 11, fontWeight: 600 }}>{q.label}</span>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
          {r.status && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: r.status === 'COMPLETED' ? 'rgba(34,197,94,0.12)' : r.status === 'FAILED' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
              color: r.status === 'COMPLETED' ? '#22c55e' : r.status === 'FAILED' ? '#ef4444' : '#eab308',
            }}>
              {r.status}
            </span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={10} style={{ padding: 0, background: 'rgba(6,9,15,0.55)', borderTop: '1px solid rgba(59,130,246,0.2)', borderBottom: '1px solid rgba(59,130,246,0.1)' }}>
            <div style={{ padding: '14px 16px' }}>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { label: 'Win Rate', value: pct(r.win_rate), color: r.win_rate >= 0.5 ? '#22c55e' : r.win_rate >= 0.42 ? '#eab308' : '#ef4444' },
                  { label: 'Profit Factor', value: num(r.profit_factor), color: r.profit_factor >= 1.5 ? '#22c55e' : r.profit_factor >= 1.1 ? '#eab308' : '#ef4444' },
                  { label: 'Max Drawdown', value: pct(r.drawdown), color: r.drawdown <= 0.1 ? '#22c55e' : r.drawdown <= 0.2 ? '#eab308' : '#ef4444' },
                  { label: 'Expectancy', value: num(r.expectancy, 4) + 'R', color: r.expectancy > 0 ? '#22c55e' : '#ef4444' },
                  { label: 'Total R', value: (r.r_multiple > 0 ? '+' : '') + num(r.r_multiple) + 'R', color: r.r_multiple > 0 ? '#22c55e' : '#ef4444' },
                  { label: 'Signaux', value: String(r.signal_count ?? '—'), color: 'var(--text-secondary)' },
                  ...(trades.length > 0 ? [
                    { label: 'Trades', value: String(trades.length), color: 'var(--text-secondary)' },
                    { label: 'Wins / Losses', value: `${wins} / ${losses}`, color: wins > losses ? '#22c55e' : '#eab308' },
                    { label: 'Total R (trades)', value: (totalR > 0 ? '+' : '') + totalR.toFixed(2) + 'R', color: totalR > 0 ? '#22c55e' : '#ef4444' },
                  ] : []),
                ].map(m => (
                  <div key={m.label} style={{
                    padding: '8px 12px', borderRadius: 6, minWidth: 90,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: m.color, fontFamily: 'monospace' }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {r.strategy_version && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Stratégie : <span style={{ color: 'var(--text-secondary)' }}>{r.strategy_version}</span>
                  {r.pipeline_run_id && <span style={{ marginLeft: 12 }}>Run ID : <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{r.pipeline_run_id.slice(0, 12)}…</span></span>}
                </div>
              )}

              {trades.length > 0 ? (
                <div style={{
                  background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Trades ({trades.length})</span>
                    <span style={{ fontSize: 10, color: '#22c55e' }}>{wins}W</span>
                    <span style={{ fontSize: 10, color: '#ef4444' }}>{losses}L</span>
                    <span style={{ fontSize: 10, color: totalR > 0 ? '#22c55e' : '#ef4444', marginLeft: 4 }}>
                      {totalR > 0 ? '+' : ''}{totalR.toFixed(2)}R total
                    </span>
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <TradesTable trades={trades} />
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '12px 14px', borderRadius: 6, fontSize: 11,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>ℹ️</span>
                  <span>Détails de trades non disponibles — ce backtest (walk-forward) stocke uniquement les métriques agrégées. Lancez un <strong style={{ color: 'var(--text-secondary)' }}>Replay</strong> pour voir les trades individuels.</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type RankEntry = {
  id: number; symbol: string; wr: number; pf: number;
  dd: number; expectancy: number; approved: boolean;
};

type SortKey = 'dd' | 'pf' | 'wr' | 'expectancy';

const MEDALS: Record<number, { icon: string; color: string }> = {
  0: { icon: '🥇', color: '#fbbf24' },
  1: { icon: '🥈', color: '#94a3b8' },
  2: { icon: '🥉', color: '#c2855e' },
};

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9 }}>⇅</span>;
  return <span style={{ fontSize: 9 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

function PairsRankingPanel() {
  const { data: profilesData } = useApi(() => api.strategyProfiles());
  const [rankings, setRankings] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('dd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [collapsed, setCollapsed] = useState(false);

  const usdcProfiles: { id: number; name: string }[] = useMemo(() =>
    Array.isArray((profilesData as { rows?: unknown[] })?.rows)
      ? (profilesData as { rows: { id: number; name: string }[] }).rows.filter(
          p => p.name.includes('USDC') && p.name.includes('Dual-Optimized')
        )
      : [],
  [profilesData]);

  const symbolFromName = (name: string) => {
    const m = name.match(/^([A-Z]+USDC)/);
    return m ? m[1] : name.replace('-SMC-Dual-Optimized', '');
  };

  const runSimulations = useCallback(async () => {
    if (usdcProfiles.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        usdcProfiles.map(async p => {
          const symbol = symbolFromName(p.name);
          try {
            const res = await api.simulateStrategyProfile(p.id, symbol);
            const m = (res as { metrics?: Record<string, number>; approved_for_live?: boolean });
            const met = m.metrics || {};
            return {
              id: p.id, symbol,
              wr: (met.win_rate as number) || 0,
              pf: (met.profit_factor as number) || 0,
              dd: (met.drawdown as number) || 0,
              expectancy: (met.expectancy as number) || 0,
              approved: Boolean(m.approved_for_live),
            } as RankEntry;
          } catch {
            return { id: p.id, symbol, wr: 0, pf: 0, dd: 0, expectancy: 0, approved: false } as RankEntry;
          }
        })
      );
      setRankings(results.sort((a, b) => a.dd - b.dd));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [usdcProfiles]);

  useEffect(() => {
    if (usdcProfiles.length > 0 && !loaded && !loading) {
      runSimulations();
    }
  }, [usdcProfiles.length, loaded, loading, runSimulations]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'dd' ? 'asc' : 'desc');
    }
  };

  const sorted = [...rankings].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === 'asc' ? diff : -diff;
  });

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11,
    color: sortKey === key ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  });

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid rgba(251,191,36,0.25)',
      borderRadius: 10, marginBottom: 24, overflow: 'hidden',
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', cursor: 'pointer',
          background: 'rgba(251,191,36,0.04)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(251,191,36,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Classement — Paires USDC Dual-Mode
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
            border: '1px solid rgba(251,191,36,0.3)',
          }}>
            {usdcProfiles.length} paires · bull RR 4.0 / bear RR 2.0
          </span>
          {loaded && !loading && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Simulation Monte Carlo
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!collapsed && (
            <button
              onClick={e => { e.stopPropagation(); runSimulations(); }}
              disabled={loading}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11, cursor: loading ? 'default' : 'pointer',
                background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                color: loading ? 'var(--text-muted)' : '#fbbf24', fontWeight: 600,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Calcul...' : 'Actualiser'}
            </button>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '24px 0' }}>
              <div style={{
                width: 16, height: 16, border: '2px solid rgba(251,191,36,0.2)',
                borderTop: '2px solid #fbbf24', borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Simulation en cours pour {usdcProfiles.length} paires...
              </span>
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(251,191,36,0.04)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Rang</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Paire</th>
                    <th style={{ ...thStyle('wr'), textAlign: 'right' }} onClick={() => toggleSort('wr')}>
                      WR% <SortArrow active={sortKey === 'wr'} dir={sortDir} />
                    </th>
                    <th style={thStyle('pf')} onClick={() => toggleSort('pf')}>
                      PF <SortArrow active={sortKey === 'pf'} dir={sortDir} />
                    </th>
                    <th style={thStyle('dd')} onClick={() => toggleSort('dd')}>
                      MaxDD <SortArrow active={sortKey === 'dd'} dir={sortDir} />
                    </th>
                    <th style={thStyle('expectancy')} onClick={() => toggleSort('expectancy')}>
                      Expect. <SortArrow active={sortKey === 'expectancy'} dir={sortDir} />
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, fontSize: 11 }}>Live</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const medal = MEDALS[i];
                    const isNew = r.symbol === 'FETUSDC';
                    const ddOk = r.dd <= 0.012;
                    const wrColor = r.wr >= 0.75 ? '#22c55e' : r.wr >= 0.65 ? '#86efac' : 'var(--text-secondary)';
                    const pfColor = r.pf >= 10 ? '#22c55e' : r.pf >= 7 ? '#86efac' : 'var(--text-secondary)';
                    const ddColor = r.dd <= 0.008 ? '#22c55e' : r.dd <= 0.012 ? '#86efac' : '#eab308';
                    const exColor = r.expectancy >= 1.5 ? '#22c55e' : r.expectancy >= 1.2 ? '#86efac' : 'var(--text-secondary)';
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderTop: '1px solid rgba(255,255,255,0.04)',
                          background: isNew ? 'rgba(251,191,36,0.03)' : medal ? `rgba(${medal.color},0.02)` : undefined,
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: medal?.color || 'var(--text-muted)', fontSize: 13 }}>
                          {medal ? medal.icon : <span style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.symbol}</span>
                            {isNew && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                                border: '1px solid rgba(251,191,36,0.35)', letterSpacing: '0.03em',
                              }}>NOUVEAU</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>#{r.id}</div>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: wrColor, fontFamily: 'monospace' }}>
                          {(r.wr * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: pfColor, fontFamily: 'monospace' }}>
                          {r.pf.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: ddColor, fontFamily: 'monospace' }}>
                          {(r.dd * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: exColor, fontFamily: 'monospace' }}>
                          {r.expectancy.toFixed(3)}R
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            background: r.approved ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            color: r.approved ? '#22c55e' : '#ef4444',
                            border: `1px solid ${r.approved ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                          }}>
                            {r.approved ? 'YES' : 'NO'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{
                padding: '8px 14px', fontSize: 10, color: 'var(--text-muted)',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', gap: 20,
              }}>
                <span>Cliquer sur les colonnes pour trier</span>
                <span>
                  {sorted.filter(r => r.approved).length}/{sorted.length} approuvées live
                </span>
                <span>
                  Top WR: {sorted.slice().sort((a, b) => b.wr - a.wr)[0]?.symbol} ({(sorted.slice().sort((a, b) => b.wr - a.wr)[0]?.wr * 100).toFixed(1)}%)
                </span>
                <span>
                  Meilleur PF: {sorted.slice().sort((a, b) => b.pf - a.pf)[0]?.symbol} ({sorted.slice().sort((a, b) => b.pf - a.pf)[0]?.pf.toFixed(2)})
                </span>
              </div>
            </div>
          )}

          {!loading && sorted.length === 0 && loaded && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun profil USDC Dual-Optimized trouve.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SIGNAL_MODES = ['Tous', 'backtest', 'research', 'paper', 'live'] as const;
const SIGNAL_FILTERS = ['Tous', 'Acceptés', 'Rejetés'] as const;

function SignauxPanel() {
  const { data: profilesData } = useApi(() => api.strategyProfiles());
  const [collapsed, setCollapsed] = useState(true);
  const [symbol, setSymbol] = useState('');
  const [mode, setMode] = useState<string>('Tous');
  const [filter, setFilter] = useState<string>('Tous');
  const [page, setPage] = useState(0);
  const limit = 50;

  const allProfiles = Array.isArray((profilesData as { rows?: unknown[] })?.rows)
    ? (profilesData as { rows: { name: string }[] }).rows
    : [];
  const symbolList = Array.from(new Set(
    allProfiles
      .map(p => { const m = p.name.match(/^([A-Z]+USDC|[A-Z]+USDT)/); return m ? m[1] : null; })
      .filter(Boolean) as string[]
  )).sort();

  const params = [
    `limit=${limit}`,
    `offset=${page * limit}`,
    symbol ? `symbol=${symbol}` : '',
    mode !== 'Tous' ? `mode=${mode}` : '',
    filter === 'Acceptés' ? 'accepted=true' : filter === 'Rejetés' ? 'accepted=false' : '',
  ].filter(Boolean).join('&');

  const { data, reload: reloadSig } = useApi(
    () => (collapsed ? Promise.resolve({ total: 0, rows: [] }) : api.signals(`?${params}`)),
    [collapsed, params]
  );
  const signals: Signal[] = (data?.rows ?? []) as Signal[];
  const total: number = (data?.total ?? 0) as number;

  const dirColor = (d?: string | null) => d === 'LONG' ? '#22c55e' : d === 'SHORT' ? '#ef4444' : 'var(--text-muted)';
  const outcomeColor = (o?: string | null) => o === 'win' ? '#22c55e' : o === 'loss' ? '#ef4444' : 'var(--text-muted)';

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.2)',
      borderRadius: 10, marginBottom: 16, overflow: 'hidden',
    }}>
      <div
        onClick={() => { setCollapsed(c => !c); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', cursor: 'pointer', background: 'rgba(139,92,246,0.04)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(139,92,246,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Signaux</span>
          {!collapsed && total > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(139,92,246,0.12)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.3)',
            }}>{total.toLocaleString()} total</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!collapsed && (
            <button onClick={e => { e.stopPropagation(); reloadSig(); }} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
              color: '#a78bfa', fontWeight: 600,
            }}>Actualiser</button>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <select value={symbol} onChange={e => { setSymbol(e.target.value); setPage(0); }} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 5, color: 'var(--text-primary)', fontSize: 11, padding: '5px 8px',
            }}>
              <option value=''>Tous les symboles</option>
              {symbolList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 0, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              {SIGNAL_MODES.map(m => (
                <button key={m} onClick={() => { setMode(m); setPage(0); }} style={{
                  padding: '5px 10px', fontSize: 11, cursor: 'pointer', border: 'none',
                  background: mode === m ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                  color: mode === m ? '#a78bfa' : 'var(--text-muted)', fontWeight: mode === m ? 700 : 400,
                }}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 0, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              {SIGNAL_FILTERS.map(f => (
                <button key={f} onClick={() => { setFilter(f); setPage(0); }} style={{
                  padding: '5px 10px', fontSize: 11, cursor: 'pointer', border: 'none',
                  background: filter === f ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: filter === f ? '#a78bfa' : 'var(--text-muted)', fontWeight: filter === f ? 700 : 400,
                }}>{f}</button>
              ))}
            </div>
          </div>

          {signals.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun signal pour ces filtres.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'rgba(20,20,35,0.97)', color: 'var(--text-muted)' }}>
                    {['Date', 'Symbole', 'TF', 'Dir', 'Setup', 'Wyckoff', 'Mode', 'Statut', 'Raison rejet', 'BT Résultat'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map(s => (
                    <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(s.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.symbol}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{s.timeframe}</td>
                      <td style={{ padding: '6px 8px', color: dirColor(s.direction), fontWeight: 700 }}>{s.direction || '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.setup_type || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.wyckoff_event || '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {s.mode && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                            background: s.mode === 'backtest' ? 'rgba(139,92,246,0.15)' : s.mode === 'paper' ? 'rgba(234,179,8,0.12)' : s.mode === 'live' ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
                            color: s.mode === 'backtest' ? '#a78bfa' : s.mode === 'paper' ? '#eab308' : s.mode === 'live' ? '#22c55e' : '#60a5fa',
                          }}>{s.mode}</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: s.accepted ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                          color: s.accepted ? '#22c55e' : '#f87171',
                        }}>{s.accepted ? 'ACCEPTÉ' : 'REJETÉ'}</span>
                      </td>
                      <td style={{ padding: '6px 8px', color: '#f87171', fontSize: 10, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.reject_reason || ''}
                      </td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                        {s.bt_outcome ? (
                          <span style={{ color: outcomeColor(s.bt_outcome), fontWeight: 700 }}>
                            {s.bt_outcome.toUpperCase()} {s.bt_r_multiple != null ? `${s.bt_r_multiple > 0 ? '+' : ''}${s.bt_r_multiple.toFixed(2)}R` : ''}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > limit && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: page === 0 ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', opacity: page === 0 ? 0.4 : 1,
              }}>← Préc.</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Page {page + 1} / {Math.ceil(total / limit)} · {total.toLocaleString()} signaux
              </span>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: (page + 1) * limit >= total ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: (page + 1) * limit >= total ? 'var(--text-muted)' : 'var(--text-primary)',
                opacity: (page + 1) * limit >= total ? 0.4 : 1,
              }}>Suiv. →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TRADE_STATUSES = ['Tous', 'OPEN', 'CLOSED_WIN', 'CLOSED_LOSS'] as const;

function TradesPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const [status, setStatus] = useState<string>('Tous');
  const [page, setPage] = useState(0);
  const limit = 50;

  const params = [
    `limit=${limit}`,
    `offset=${page * limit}`,
    status !== 'Tous' ? `status=${status}` : '',
  ].filter(Boolean).join('&');

  const { data, reload: reloadTrades } = useApi(
    () => (collapsed ? Promise.resolve({ total: 0, rows: [] }) : api.trades(`?${params}`)),
    [collapsed, params]
  );
  const trades: Trade[] = (data?.rows ?? []) as Trade[];
  const total: number = (data?.total ?? 0) as number;

  const sideColor = (side: string) => side === 'LONG' || side === 'BUY' ? '#22c55e' : '#ef4444';
  const statusColor = (st: string) =>
    st === 'OPEN' ? '#60a5fa' : st === 'CLOSED_WIN' ? '#22c55e' : st === 'CLOSED_LOSS' ? '#ef4444' : 'var(--text-muted)';
  const modeColor = (m: string) =>
    m === 'live' ? '#22c55e' : m === 'paper' ? '#eab308' : '#a78bfa';

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.18)',
      borderRadius: 10, marginBottom: 16, overflow: 'hidden',
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', cursor: 'pointer', background: 'rgba(34,197,94,0.03)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(34,197,94,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Trades</span>
          {!collapsed && total > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(34,197,94,0.1)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.25)',
            }}>{total.toLocaleString()} total</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!collapsed && (
            <button onClick={e => { e.stopPropagation(); reloadTrades(); }} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              color: '#22c55e', fontWeight: 600,
            }}>Actualiser</button>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              {TRADE_STATUSES.map(s => (
                <button key={s} onClick={() => { setStatus(s); setPage(0); }} style={{
                  padding: '5px 12px', fontSize: 11, cursor: 'pointer', border: 'none',
                  background: status === s ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                  color: status === s ? '#22c55e' : 'var(--text-muted)', fontWeight: status === s ? 700 : 400,
                }}>{s}</button>
              ))}
            </div>
          </div>

          {trades.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun trade pour ce filtre.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'rgba(20,20,35,0.97)', color: 'var(--text-muted)' }}>
                    {['Date', 'Symbole', 'Côté', 'Entry', 'Stop', 'Target', 'Statut', 'Mode'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(t.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.symbol}</td>
                      <td style={{ padding: '6px 8px', color: sideColor(t.side), fontWeight: 700 }}>{t.side}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{fmtPrice(t.entry)}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#ef4444' }}>{fmtPrice(t.stop)}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#22c55e' }}>{fmtPrice(t.target)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                          background: `${statusColor(t.status)}18`,
                          color: statusColor(t.status),
                          border: `1px solid ${statusColor(t.status)}35`,
                        }}>{t.status}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: `${modeColor(t.mode)}18`, color: modeColor(t.mode),
                        }}>{t.mode}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > limit && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: page === 0 ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', opacity: page === 0 ? 0.4 : 1,
              }}>← Préc.</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Page {page + 1} / {Math.ceil(total / limit)} · {total.toLocaleString()} trades
              </span>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: (page + 1) * limit >= total ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: (page + 1) * limit >= total ? 'var(--text-muted)' : 'var(--text-primary)',
                opacity: (page + 1) * limit >= total ? 0.4 : 1,
              }}>Suiv. →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BacktestsPage({ onNavigate: _onNavigate }: { onNavigate?: (page: AdminPage) => void } = {}) {
  const { data, reload } = useApi(() => api.backtests('?limit=100'));
  const rows: BacktestResult[] = (data?.rows ?? []) as BacktestResult[];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)', fontWeight: 800 }}>Backtests</h1>
        <button onClick={reload} style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          Rafraichir
        </button>
      </div>

      <ReplayLauncher onCompleted={reload} />

      <PairsRankingPanel />

      <SignauxPanel />
      <TradesPanel />

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun backtest enregistre. Lancez un premier backtest ci-dessus.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(59,130,246,0.07)', color: 'var(--text-muted)', fontSize: 11 }}>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Symbole</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>TF</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Periode</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Profil</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Trades</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>WR%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>PF</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>DD%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Qualite</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <HistoryRow key={r.id} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
