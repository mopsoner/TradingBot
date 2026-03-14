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
  const risk = configDraft ? (configDraft.risk as Record<string, unknown>) : null;

  const setGroup = (group: 'system' | 'trading' | 'risk', key: string, value: unknown) => {
    if (!configDraft) return;
    const current = configDraft[group] as Record<string, unknown>;
    setConfigDraft({ ...configDraft, [group]: { ...current, [key]: value } });
  };

  const save = async () => {
    if (!configDraft) return;
    await api.updateConfig(configDraft);
    setStatus('Admin settings sauvegardés.');
  };

  return (
    <section>
      <h2>Admin</h2>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="red">Error: {error}</p>}

      {system && trading && risk && (
        <div className="grid-2">
          <div className="card">
            <h3>System & exécution</h3>
            <div className="form-group"><label>Mode</label><select value={String(system.mode)} onChange={e => setGroup('system', 'mode', e.target.value)}><option value="research">research</option><option value="paper">paper</option><option value="live">live</option></select></div>
            <div className="form-group"><label>API key</label><input value={String(system.api_key ?? '')} onChange={e => setGroup('system', 'api_key', e.target.value)} /></div>
            <div className="form-group"><label>API secret</label><input value={String(system.api_secret ?? '')} onChange={e => setGroup('system', 'api_secret', e.target.value)} /></div>
            <div className="form-group"><label>Execution mode actuel</label><input value={String(endpoints?.execution_mode ?? 'paper')} disabled /></div>
          </div>

          <div className="card">
            <h3>Trading universe & isolated margin</h3>
            <div className="form-group"><label>Enabled symbols (CSV)</label><input value={String((trading.enabled_symbols as string[]).join(','))} onChange={e => setGroup('trading', 'enabled_symbols', e.target.value.split(',').map(v => v.trim()).filter(Boolean))} /></div>
            <div className="form-group"><label>Timeframe</label><input value={String(trading.timeframe)} onChange={e => setGroup('trading', 'timeframe', e.target.value)} /></div>
            <div className="form-group"><label>Max concurrent trades</label><input type="number" value={Number(trading.max_concurrent_trades)} onChange={e => setGroup('trading', 'max_concurrent_trades', Number(e.target.value))} /></div>
            <div className="form-group"><label>Capital allocation</label><input type="number" step="0.01" value={Number(trading.capital_allocation)} onChange={e => setGroup('trading', 'capital_allocation', Number(e.target.value))} /></div>
          </div>

          <div className="card">
            <h3>Risk manager</h3>
            <div className="form-group"><label>Risk per trade</label><input type="number" step="0.001" value={Number(risk.risk_per_trade)} onChange={e => setGroup('risk', 'risk_per_trade', Number(e.target.value))} /></div>
            <div className="form-group"><label>Max open positions</label><input type="number" value={Number(risk.max_open_positions)} onChange={e => setGroup('risk', 'max_open_positions', Number(e.target.value))} /></div>
            <div className="form-group"><label>Daily loss limit</label><input type="number" step="0.001" value={Number(risk.daily_loss_limit)} onChange={e => setGroup('risk', 'daily_loss_limit', Number(e.target.value))} /></div>
            <div className="form-group"><label>Weekly loss limit</label><input type="number" step="0.001" value={Number(risk.weekly_loss_limit)} onChange={e => setGroup('risk', 'weekly_loss_limit', Number(e.target.value))} /></div>
          </div>

          <div className="card">
            <h3>Endpoints isolated margin</h3>
            {Object.entries((endpoints?.endpoints as Record<string, string>) ?? {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">{k}</span>
                <code>{v}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={save}>Sauvegarder Admin</button>
      {status && <p className="green" style={{ marginTop: 10 }}>{status}</p>}
    </section>
  );
}
