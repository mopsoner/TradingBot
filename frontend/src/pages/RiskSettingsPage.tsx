import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function RiskSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const risk = data ? (data.risk as Record<string, unknown>) : null;

  const pct = (v: unknown) => `${(Number(v) * 100).toFixed(1)}%`;

  return (
    <section>
      <h2>Risk settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}
      {risk && (
        <div className="grid-2">
          <div className="card">
            <h3>Current configuration</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Risk per trade',       value: pct(risk.risk_per_trade),      key: 'risk_per_trade' },
                { label: 'Max open positions',    value: String(risk.max_open_positions), key: 'max_open_positions' },
                { label: 'Daily loss limit',      value: pct(risk.daily_loss_limit),    key: 'daily_loss_limit' },
                { label: 'Weekly loss limit',     value: pct(risk.weekly_loss_limit),   key: 'weekly_loss_limit' },
              ].map(({ label, value, key }) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="muted">{label}</span>
                    <strong>{value}</strong>
                  </div>
                  {key.includes('loss') && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(Number(risk[key]) * 100 / 0.1 * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Risk rules</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <p>• Maximum {pct(risk.risk_per_trade)} of capital risked per trade</p>
              <p>• No more than {String(risk.max_open_positions)} positions open simultaneously</p>
              <p>• Trading halts if daily drawdown exceeds {pct(risk.daily_loss_limit)}</p>
              <p>• Trading halts if weekly drawdown exceeds {pct(risk.weekly_loss_limit)}</p>
              <p>• All trades run in <strong style={{ color: 'var(--accent-yellow)' }}>paper mode</strong> until live is enabled</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
