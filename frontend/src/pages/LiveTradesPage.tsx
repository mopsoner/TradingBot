import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

const STATUS_OPTIONS = ['All', 'OPEN', 'CLOSED_WIN', 'CLOSED_LOSS'];

export function LiveTradesPage() {
  const [statusFilter, setStatusFilter] = useState('All');
  const params = statusFilter !== 'All' ? `?status=${statusFilter}` : '';
  const { data, loading, error } = useApi(() => api.trades(params), [statusFilter]);

  const rr = (entry: number, stop: number, target: number) => {
    const risk   = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    return risk > 0 ? (reward / risk).toFixed(1) : '—';
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Live trades</h2>
        <div className="flex gap-8">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace('CLOSED_', '')}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}

      {data && (
        <>
          <p className="muted mb-16">{data.total.toLocaleString()} trades total</p>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Symbol</th><th>Side</th>
                  <th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th>
                  <th>Mode</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(t => (
                  <tr key={t.id}>
                    <td className="muted">{new Date(t.timestamp).toLocaleDateString()}</td>
                    <td>{t.symbol}</td>
                    <td className={t.side === 'LONG' ? 'green' : 'red'}>{t.side}</td>
                    <td>{t.entry.toFixed(2)}</td>
                    <td className="red">{t.stop.toFixed(2)}</td>
                    <td className="green">{t.target.toFixed(2)}</td>
                    <td className="muted">{rr(t.entry, t.stop, t.target)}</td>
                    <td><span className="tag">{t.mode}</span></td>
                    <td>
                      <span className={`badge ${
                        t.status === 'CLOSED_WIN'  ? 'badge-green' :
                        t.status === 'CLOSED_LOSS' ? 'badge-red'   :
                        t.status === 'OPEN'        ? 'badge-blue'  : 'badge-gray'
                      }`}>{t.status.replace('CLOSED_', '')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
