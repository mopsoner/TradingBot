import { useApi } from '../hooks/useApi';
import { api, type Trade } from '../services/api';

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtDate(ts: string) { return new Date(ts).toLocaleDateString(); }

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'CLOSED_WIN' ? 'badge badge-green' :
    status === 'CLOSED_LOSS' ? 'badge badge-red' :
    status === 'OPEN' ? 'badge badge-blue' : 'badge badge-gray';
  return <span className={cls}>{status.replace('CLOSED_', '')}</span>;
}

export function DashboardPage() {
  const { data, loading, error } = useApi(() => api.dashboard());

  if (loading) return <section><h2>Dashboard</h2><p className="muted">Loading…</p></section>;
  if (error)   return <section><h2>Dashboard</h2><p className="red">Error: {error}</p></section>;
  if (!data)   return null;

  const acceptance = data.total_signals > 0
    ? ((data.accepted_signals / data.total_signals) * 100).toFixed(1)
    : '0';

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <span className={`badge ${data.mode === 'live' ? 'badge-green' : 'badge-yellow'}`}>
          {data.mode.toUpperCase()} MODE
        </span>
      </div>

      <div className="grid-4 mb-16">
        <div className="card">
          <div className="stat-value blue">{data.total_signals.toLocaleString()}</div>
          <div className="stat-label">Signals scanned</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {acceptance}% acceptance rate
          </div>
        </div>
        <div className="card">
          <div className={`stat-value ${data.win_rate >= 0.5 ? 'green' : 'red'}`}>
            {(data.win_rate * 100).toFixed(1)}%
          </div>
          <div className="stat-label">Win rate</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {data.wins}W / {data.losses}L
          </div>
        </div>
        <div className="card">
          <div className="stat-value">{data.open_positions}</div>
          <div className="stat-label">Open positions</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {data.open_trades} open trades
          </div>
        </div>
        <div className="card">
          <div className={`stat-value ${data.total_pnl >= 0 ? 'green' : 'red'}`}>
            {data.total_pnl >= 0 ? '+' : ''}{fmt(data.total_pnl)} USD
          </div>
          <div className="stat-label">Unrealized PnL</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            across {data.open_positions} positions
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Recent trades</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Side</th>
              <th>Entry</th><th>Stop</th><th>Target</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_trades.map((t: Trade) => (
              <tr key={t.id}>
                <td className="muted">{fmtDate(t.timestamp)}</td>
                <td>{t.symbol}</td>
                <td className={t.side === 'LONG' ? 'green' : 'red'}>{t.side}</td>
                <td>{fmt(t.entry)}</td>
                <td className="red">{fmt(t.stop)}</td>
                <td className="green">{fmt(t.target)}</td>
                <td><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
