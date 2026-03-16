import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const loaded = Array.isArray(loadedData) ? loadedData : [];
  const availableSymbols = loaded.map(s => s.symbol);

  const [symbol, setSymbol] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
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
      const res = await api.replayStart({ symbol, date_start: dateStart, date_end: dateEnd });
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
      {expanded && trades.length > 0 && (
        <tr>
          <td colSpan={10} style={{ padding: 0, background: 'rgba(6,9,15,0.6)', borderTop: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <TradesTable trades={trades} />
            </div>
          </td>
        </tr>
      )}
    </>
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
