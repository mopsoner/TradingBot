import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function BacktestsPage() {
  const { data, loading, error } = useApi(() => api.backtests());

  const avgWinRate = data && data.rows.length
    ? data.rows.reduce((s, b) => s + b.win_rate, 0) / data.rows.length
    : 0;
  const avgPF = data && data.rows.length
    ? data.rows.reduce((s, b) => s + b.profit_factor, 0) / data.rows.length
    : 0;
  const avgDD = data && data.rows.length
    ? data.rows.reduce((s, b) => s + b.drawdown, 0) / data.rows.length
    : 0;

  return (
    <section>
      <h2>Backtests</h2>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}

      {data && (
        <>
          <div className="grid-3 mb-16">
            <div className="card">
              <div className={`stat-value ${avgWinRate >= 0.5 ? 'green' : 'red'}`}>
                {(avgWinRate * 100).toFixed(1)}%
              </div>
              <div className="stat-label">Avg win rate</div>
            </div>
            <div className="card">
              <div className={`stat-value ${avgPF >= 1.5 ? 'green' : 'yellow'}`}>
                {avgPF.toFixed(2)}
              </div>
              <div className="stat-label">Avg profit factor</div>
            </div>
            <div className="card">
              <div className={`stat-value ${avgDD <= 0.08 ? 'green' : 'red'}`}>
                {(avgDD * 100).toFixed(1)}%
              </div>
              <div className="stat-label">Avg max drawdown</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Symbol</th><th>TF</th><th>Version</th>
                  <th>Win rate</th><th>Profit factor</th><th>Expectancy</th>
                  <th>Drawdown</th><th>R multiple</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(b => (
                  <tr key={b.id}>
                    <td className="muted">{new Date(b.timestamp).toLocaleDateString()}</td>
                    <td>{b.symbol}</td>
                    <td><span className="tag">{b.timeframe}</span></td>
                    <td><span className="tag">{b.strategy_version}</span></td>
                    <td className={b.win_rate >= 0.5 ? 'green' : 'red'}>
                      {(b.win_rate * 100).toFixed(1)}%
                    </td>
                    <td className={b.profit_factor >= 1.5 ? 'green' : 'yellow'}>
                      {b.profit_factor.toFixed(2)}
                    </td>
                    <td className={b.expectancy >= 0 ? 'green' : 'red'}>
                      {b.expectancy.toFixed(4)}
                    </td>
                    <td className={b.drawdown <= 0.08 ? 'green' : 'red'}>
                      {(b.drawdown * 100).toFixed(1)}%
                    </td>
                    <td className="blue">{b.r_multiple.toFixed(2)}R</td>
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
