import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function RiskSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => { if (data) setConfigDraft(data); }, [data]);
  const risk = configDraft ? (configDraft.risk as Record<string, unknown>) : null;

  const setRisk = (key: string, value: unknown) => {
    if (!configDraft || !risk) return;
    setConfigDraft({ ...configDraft, risk: { ...risk, [key]: value } });
  };

  const save = async () => {
    if (!configDraft) return;
    await api.updateConfig(configDraft);
    setStatus('Risk settings saved.');
  };

  return (
    <section>
      <h2>Risk settings</h2>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="red">Error: {error}</p>}
      {risk && (
        <div className="card">
          <h3>Editable limits</h3>
          <div className="grid-2">
            <div className="form-group"><label>Risk per trade</label><input type="number" step="0.001" value={Number(risk.risk_per_trade)} onChange={e => setRisk('risk_per_trade', Number(e.target.value))} /></div>
            <div className="form-group"><label>Max open positions</label><input type="number" value={Number(risk.max_open_positions)} onChange={e => setRisk('max_open_positions', Number(e.target.value))} /></div>
            <div className="form-group"><label>Daily loss limit</label><input type="number" step="0.001" value={Number(risk.daily_loss_limit)} onChange={e => setRisk('daily_loss_limit', Number(e.target.value))} /></div>
            <div className="form-group"><label>Weekly loss limit</label><input type="number" step="0.001" value={Number(risk.weekly_loss_limit)} onChange={e => setRisk('weekly_loss_limit', Number(e.target.value))} /></div>
          </div>
          <button className="btn btn-primary" onClick={save}>Save risk</button>
          {status && <p className="green" style={{ marginTop: 12 }}>{status}</p>}
        </div>
      )}
    </section>
  );
}
