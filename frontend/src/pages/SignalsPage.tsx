import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function SignalsPage() {
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const params =
    filter === 'accepted' ? '?accepted=true' :
    filter === 'rejected' ? '?accepted=false' : '';

  const { data, loading, error } = useApi(() => api.signals(params), [filter]);

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Signals</h2>
        <div className="flex gap-8">
          {(['all', 'accepted', 'rejected'] as const).map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}

      {data && (
        <>
          <p className="muted mb-16">{data.total.toLocaleString()} total signals</p>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Symbol</th><th>TF</th><th>Setup</th>
                  <th>Liq. zone</th><th>Sweep</th><th>BOS</th><th>Fib</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(s => (
                  <tr key={s.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(s.timestamp).toLocaleDateString()}
                    </td>
                    <td>{s.symbol}</td>
                    <td><span className="tag">{s.timeframe}</span></td>
                    <td>{s.setup_type}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{s.liquidity_zone}</td>
                    <td>{s.sweep_level.toFixed(2)}</td>
                    <td>{s.bos_level.toFixed(2)}</td>
                    <td>{s.fib_zone}</td>
                    <td>
                      <span className={`badge ${s.accepted ? 'badge-green' : 'badge-gray'}`}>
                        {s.accepted ? 'Accepted' : 'Rejected'}
                      </span>
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
