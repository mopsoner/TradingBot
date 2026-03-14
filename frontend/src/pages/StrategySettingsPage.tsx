import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function StrategySettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const strategy = data ? (data.strategy as Record<string, unknown>) : null;

  return (
    <section>
      <h2>Strategy settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}
      {strategy && (
        <div className="grid-2">
          <div className="card">
            <h3>SMC / Wyckoff parameters</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="flex items-center justify-between">
                <span className="muted">Spring detection</span>
                <span className={`badge ${strategy.enable_spring ? 'badge-green' : 'badge-gray'}`}>
                  {strategy.enable_spring ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">UTAD detection</span>
                <span className={`badge ${strategy.enable_utad ? 'badge-green' : 'badge-gray'}`}>
                  {strategy.enable_utad ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Displacement threshold</span>
                <strong>{String(strategy.displacement_threshold)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">BOS sensitivity</span>
                <strong>{String(strategy.bos_sensitivity)}</strong>
              </div>
              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="muted">Fib retracement levels</span>
                </div>
                <div className="flex gap-8">
                  {(strategy.fib_levels as number[]).map(f => (
                    <span key={f} className="badge badge-blue">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Signal sequence required</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {[
                { step: 1, label: 'Liquidity zone identified' },
                { step: 2, label: 'Sweep of liquidity' },
                { step: 3, label: 'Spring (bullish) or UTAD (bearish) formed' },
                { step: 4, label: `Displacement > ${strategy.displacement_threshold}` },
                { step: 5, label: 'Break of structure (BOS) confirmed' },
                { step: 6, label: 'Fib retracement to entry zone' },
              ].map(({ step, label }) => (
                <div key={step} className="flex items-center gap-8">
                  <span className="badge badge-blue" style={{ minWidth: 24, textAlign: 'center' }}>{step}</span>
                  <span className="muted">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
