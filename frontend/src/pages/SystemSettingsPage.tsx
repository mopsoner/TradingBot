import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function SystemSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const { data: endpoints } = useApi(() => api.marginEndpoints());
  const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => { if (data) setConfigDraft(data); }, [data]);
  const system = configDraft ? (configDraft.system as Record<string, unknown>) : null;
  const trading = configDraft ? (configDraft.trading as Record<string, unknown>) : null;

  const setSystem = (key: string, value: unknown) => {
    if (!configDraft || !system) return;
    setConfigDraft({ ...configDraft, system: { ...system, [key]: value } });
  };

  const save = async () => {
    if (!configDraft) return;
    await api.updateConfig(configDraft);
    setStatus('System settings saved.');
  };

  return (
    <section>
      <h2>System settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="red">Error: {error}</p>}
      {system && trading && (
        <div className="grid-2">
          <div className="card">
            <h3>Execution mode & credentials</h3>
            <div className="form-group">
              <label>Mode</label>
              <select value={String(system.mode)} onChange={e => setSystem('mode', e.target.value)}>
                <option value="research">research</option>
                <option value="paper">paper</option>
                <option value="live">live</option>
              </select>
            </div>
            <div className="form-group"><label>API key</label><input value={String(system.api_key ?? '')} onChange={e => setSystem('api_key', e.target.value)} /></div>
            <div className="form-group"><label>API secret</label><input value={String(system.api_secret ?? '')} onChange={e => setSystem('api_secret', e.target.value)} /></div>
            <button className="btn btn-primary" onClick={save}>Save system</button>
            {status && <p className="green" style={{ marginTop: 12 }}>{status}</p>}
          </div>
          <div className="card">
            <h3>Binance isolated margin endpoints</h3>
            <p className="muted" style={{ marginBottom: 8 }}>Current execution mode: {String(endpoints?.execution_mode ?? 'paper')}</p>
            {Object.entries((endpoints?.endpoints as Record<string, string>) ?? {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">{k}</span>
                <code>{v}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
