import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function BotControlPage() {
  const { data: symbols } = useApi(() => api.symbols());
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['ETHUSDT', 'BTCUSDT']);
  const [mode, setMode] = useState<'paper' | 'live' | 'research'>('paper');
  const [riskApproved, setRiskApproved] = useState(false);
  const [executeOrders, setExecuteOrders] = useState(false);
  const [startResult, setStartResult] = useState<Record<string, unknown> | null>(null);
  const { data: status, refresh } = useApi(() => api.botStatus());

  useEffect(() => {
    const id = window.setInterval(() => refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const startBot = async () => {
    const result = await api.startBot({ symbols: selectedSymbols, mode, risk_approved: riskApproved, execute_orders: executeOrders, timeframe: '15m' });
    setStartResult(result);
    refresh();
  };

  return (
    <section>
      <h2>Bot control & suivi live</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Lancer un scan bot (live/paper/research)</h3>
          <div className="form-group">
            <label>Symboles</label>
            <select multiple value={selectedSymbols} onChange={e => setSelectedSymbols(Array.from(e.target.selectedOptions).map(o => o.value))} style={{ minHeight: 130 }}>
              {(symbols ?? ['ETHUSDT', 'BTCUSDT']).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as 'paper' | 'live' | 'research')}>
              <option value="research">research</option>
              <option value="paper">paper</option>
              <option value="live">live</option>
            </select>
          </div>
          <div className="form-group">
            <label><input type="checkbox" checked={riskApproved} onChange={e => setRiskApproved(e.target.checked)} style={{ width: 'auto', marginRight: 8 }} />Risk approval</label>
            <label><input type="checkbox" checked={executeOrders} onChange={e => setExecuteOrders(e.target.checked)} style={{ width: 'auto', marginRight: 8 }} />Exécuter achat/vente</label>
          </div>
          <button className="btn btn-primary" onClick={startBot} disabled={selectedSymbols.length === 0}>Démarrer</button>
          {startResult && (
            <p className="muted" style={{ marginTop: 10 }}>
              {startResult.ok ? `OK • ${String(startResult.signals_detected)} signaux • ${String(startResult.orders_submitted)} ordres` : `Bloqué: ${String(startResult.reason)}`}
            </p>
          )}
        </div>

        <div className="card">
          <h3>Progression en direct</h3>
          {!status && <p className="muted">Chargement…</p>}
          {status?.live_progress && (
            <>
              <p><span className="muted">Jobs traités:</span> {String(status.live_progress.jobs_processed)}</p>
              <p><span className="muted">Signaux détectés:</span> {String(status.live_progress.signals_detected)}</p>
              <p><span className="muted">Tradeable now:</span> {String(status.is_tradeable_now ? 'oui' : 'non')}</p>
              <div className="grid-2" style={{ marginTop: 8 }}>
                {Object.entries(status.live_progress.session_breakdown as Record<string, unknown>).map(([name, count]) => (
                  <div key={name} className="tag">{name}: {String(count)}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Événements live (dernier scan)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(status?.recent_events as Array<Record<string, unknown>> | undefined)?.map((ev, i) => (
            <div key={`${String(ev.symbol)}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <strong>{String(ev.symbol)}</strong> • <span className="muted">{String(ev.session_name)}</span> • <span className="badge badge-blue">{String(ev.status)}</span>
              <div className="muted" style={{ marginTop: 4 }}>{String(ev.details)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
