import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function PositionsPage() {
  const { data, loading, error } = useApi(() => api.positions());

  const totalPnl  = data ? data.reduce((s, p) => s + p.unrealized_pnl, 0) : 0;
  const totalSize = data ? data.reduce((s, p) => s + p.quantity * p.entry_price, 0) : 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Positions</h2>
        {data && (
          <span className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`} style={{ fontSize: 20 }}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USD unrealized
          </span>
        )}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}

      {data && data.length === 0 && <p className="muted">No open positions.</p>}

      {data && data.length > 0 && (
        <>
          <div className="grid-3 mb-16">
            <div className="card">
              <div className="stat-value">{data.length}</div>
              <div className="stat-label">Open positions</div>
            </div>
            <div className="card">
              <div className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
              </div>
              <div className="stat-label">Total unrealized PnL</div>
            </div>
            <div className="card">
              <div className="stat-value">{totalSize.toFixed(2)}</div>
              <div className="stat-label">Total notional (USD)</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th><th>Qty</th><th>Entry price</th>
                  <th>Current price</th><th>Change</th><th>Unrealized PnL</th>
                </tr>
              </thead>
              <tbody>
                {data.map(p => {
                  const pct = ((p.current_price - p.entry_price) / p.entry_price) * 100;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.symbol}</strong></td>
                      <td>{p.quantity}</td>
                      <td>{p.entry_price.toFixed(2)}</td>
                      <td>{p.current_price.toFixed(2)}</td>
                      <td className={pct >= 0 ? 'green' : 'red'}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </td>
                      <td className={p.unrealized_pnl >= 0 ? 'green' : 'red'}>
                        {p.unrealized_pnl >= 0 ? '+' : ''}{p.unrealized_pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
