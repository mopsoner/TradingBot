import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/dateUtils';

const STATUS_OPTIONS = ['All', 'OPEN', 'CLOSED_WIN', 'CLOSED_LOSS'];

type StrategyProfile = { id: number; name: string; approved_for_live: boolean };

export function LiveTradesPage() {
  const [statusFilter, setStatusFilter] = useState('All');
  const params = statusFilter !== 'All' ? `?status=${statusFilter}` : '';
  const { data, loading, error, reload } = useApi(() => api.trades(params), [statusFilter]);
  const { data: profiles } = useApi(() => api.strategyProfiles());
  const { data: byQuote } = useApi(() => api.symbolsByQuote());
  const [profileId, setProfileId] = useState<number | null>(null);
  const [runStatus, setRunStatus] = useState('');

  useEffect(() => {
    const rows = (profiles?.rows as StrategyProfile[] | undefined) ?? [];
    if (!profileId && rows.length) {
      const approved = rows.find((p) => p.approved_for_live);
      setProfileId((approved ?? rows[0]).id);
    }
  }, [profiles, profileId]);

  const startLiveAutotrade = async () => {
    const defaultSymbols = (byQuote?.['USDT'] ?? []).slice(0, 5);
    const res = await api.startBot({
      symbols: defaultSymbols.length ? defaultSymbols : ['ETHUSDT', 'BTCUSDT'],
      mode: 'live',
      risk_approved: true,
      execute_orders: true,
      timeframe: '15m',
      strategy_profile_id: profileId,
    });
    setRunStatus(res.ok ? `Auto-trade lancé: ${String(res.orders_submitted)} ordres.` : `Bloqué: ${String(res.reason)}`);
    reload();
  };

  const rr = (entry: number, stop: number, target: number) => {
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    return risk > 0 ? (reward / risk).toFixed(1) : '—';
  };

  return (
    <section>
      <h2>Live trades</h2>
      <div className="card">
        <h3>Trading live automatique sur signaux</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Strategy profile approuvé</label>
            <select value={profileId ?? ''} onChange={e => setProfileId(Number(e.target.value))}>
              {(profiles?.rows as StrategyProfile[] | undefined)?.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.approved_for_live ? '✅' : '⏳'}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-success" onClick={startLiveAutotrade}>Lancer live auto</button>
        </div>
        {runStatus && <p className="muted" style={{ marginTop: 8 }}>{runStatus}</p>}
      </div>

      <div className="flex items-center justify-between mb-16">
        <div className="flex gap-8">
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s)}>
              {s.replace('CLOSED_', '')}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="red">Error: {error}</p>}

      {data && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Mode</th><th>Status</th></tr></thead>
            <tbody>
              {data.rows.map(t => (
                <tr key={t.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.timestamp)}</td>
                  <td>{t.symbol}</td>
                  <td className={t.side === 'LONG' ? 'green' : 'red'}>{t.side}</td>
                  <td>{t.entry.toFixed(2)}</td>
                  <td className="red">{t.stop.toFixed(2)}</td>
                  <td className="green">{t.target.toFixed(2)}</td>
                  <td className="muted">{rr(t.entry, t.stop, t.target)}</td>
                  <td><span className="tag">{t.mode}</span></td>
                  <td><span className={`badge ${t.status === 'CLOSED_WIN' ? 'badge-green' : t.status === 'CLOSED_LOSS' ? 'badge-red' : t.status === 'OPEN' ? 'badge-blue' : 'badge-gray'}`}>{t.status.replace('CLOSED_', '')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
