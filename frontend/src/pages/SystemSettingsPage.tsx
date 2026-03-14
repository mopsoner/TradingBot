import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function SystemSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const system  = data ? (data.system  as Record<string, unknown>) : null;
  const trading = data ? (data.trading as Record<string, unknown>) : null;

  return (
    <section>
      <h2>System settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}
      {system && trading && (
        <div className="grid-2">
          <div className="card">
            <h3>Operating mode</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="flex items-center justify-between">
                <span className="muted">Current mode</span>
                <span className={`badge ${system.mode === 'live' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: 13 }}>
                  {String(system.mode).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Timeframe</span>
                <strong>{String(trading.timeframe)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Max concurrent trades</span>
                <strong>{String(trading.max_concurrent_trades)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Capital allocation</span>
                <strong>{(Number(trading.capital_allocation) * 100).toFixed(0)}%</strong>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>API credentials</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="flex items-center justify-between">
                <span className="muted">API key</span>
                <span className={`badge ${system.api_key ? 'badge-green' : 'badge-gray'}`}>
                  {system.api_key ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">API secret</span>
                <span className={`badge ${system.api_secret ? 'badge-green' : 'badge-gray'}`}>
                  {system.api_secret ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <p className="muted" style={{ fontSize: 12 }}>
                  To enable live trading, set API credentials and change mode to <strong>live</strong>. 
                  All trades currently execute in paper mode only.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
