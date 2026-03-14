import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function StrategySettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (data) setConfigDraft(data);
  }, [data]);

  const strategy = configDraft ? (configDraft.strategy as Record<string, unknown>) : null;

  const setVal = (k: string, v: unknown) => {
    if (!configDraft || !strategy) return;
    setConfigDraft({ ...configDraft, strategy: { ...strategy, [k]: v } });
  };

  const save = async () => {
    if (!configDraft) return;
    await api.updateConfig(configDraft);
    setStatus('Strategy settings saved.');
  };

  return (
    <section>
      <h2>Strategy settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="red">Error: {error}</p>}
      {strategy && (
        <div className="grid-2">
          <div className="card">
            <h3>SMC / Wyckoff parameters</h3>
            <div className="form-group"><label>Enable spring</label><input type="checkbox" checked={Boolean(strategy.enable_spring)} onChange={e => setVal('enable_spring', e.target.checked)} style={{ width: 'auto' }} /></div>
            <div className="form-group"><label>Enable UTAD</label><input type="checkbox" checked={Boolean(strategy.enable_utad)} onChange={e => setVal('enable_utad', e.target.checked)} style={{ width: 'auto' }} /></div>
            <div className="form-group"><label>Displacement threshold</label><input type="number" step="0.01" value={Number(strategy.displacement_threshold)} onChange={e => setVal('displacement_threshold', Number(e.target.value))} /></div>
            <div className="form-group"><label>BOS sensitivity</label><input type="number" value={Number(strategy.bos_sensitivity)} onChange={e => setVal('bos_sensitivity', Number(e.target.value))} /></div>
            <button className="btn btn-primary" onClick={save}>Save strategy</button>
            {status && <p className="green" style={{ marginTop: 12 }}>{status}</p>}
          </div>
          <div className="card">
            <h3>Allowed fib levels</h3>
            <p className="muted">Fixed strategy entries: 0.5 / 0.618 / 0.705.</p>
            <div className="flex gap-8" style={{ marginTop: 8 }}>
              {[0.5, 0.618, 0.705].map(f => <span key={f} className="badge badge-blue">{f}</span>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
