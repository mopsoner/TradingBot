import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

type StrategyProfile = {
  id: number;
  name: string;
  mode: string;
  approved_for_live: boolean;
  approved_by?: string;
  last_backtest_win_rate?: number;
  last_backtest_profit_factor?: number;
  last_backtest_drawdown?: number;
  parameters: string;
};

export function StrategySettingsPage() {
  const { data: config } = useApi(() => api.config());
  const { data: profilesData, refresh } = useApi(() => api.strategyProfiles());
  const [name, setName] = useState('SMC ETH/BTC v1');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const profiles = useMemo(() => (profilesData?.rows ?? []) as StrategyProfile[], [profilesData]);

  useEffect(() => {
    if (!selectedId && profiles.length) setSelectedId(profiles[0].id);
  }, [profiles, selectedId]);

  const selected = useMemo(() => profiles.find((p) => p.id === selectedId) ?? null, [profiles, selectedId]);

  const saveProfile = async () => {
    const strategy = (config?.strategy ?? {}) as Record<string, unknown>;
    await api.saveStrategyProfile({ name, mode: 'research', parameters: strategy });
    setStatus('Profil sauvegardé.');
    refresh();
  };

  const backtest = async () => {
    if (!selectedId) return;
    const result = await api.backtestStrategyProfile(selectedId);
    setStatus(result.approved_for_live ? 'Backtest validé pour live.' : 'Backtest fait, critères live non atteints.');
    refresh();
  };

  const approveLive = async () => {
    if (!selectedId) return;
    const result = await api.approveStrategyProfile(selectedId, { approved: true, approved_by: 'desk-user' });
    setStatus(result.ok ? 'Profil approuvé pour live.' : `Refusé: ${String(result.reason)}`);
    refresh();
  };

  return (
    <section>
      <h2>Strategy lab</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Construire & sauvegarder</h3>
          <p className="muted mb-8">Pipeline imposé: liquidity zone → sweep → Spring/UTAD → displacement → BOS → fib 0.5/0.618/0.705.</p>
          <div className="form-group">
            <label>Nom du profil</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveProfile}>Sauvegarder profil</button>
        </div>

        <div className="card">
          <h3>Backtest → validation live</h3>
          <div className="form-group">
            <label>Profil</label>
            <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="row">
            <button className="btn btn-secondary" onClick={backtest}>Lancer backtest</button>
            <button className="btn btn-success" onClick={approveLive}>Approuver live</button>
          </div>
          {selected && (
            <div style={{ marginTop: 12 }}>
              <p><span className="muted">PF:</span> {selected.last_backtest_profit_factor?.toFixed(2) ?? 'n/a'}</p>
              <p><span className="muted">Win rate:</span> {selected.last_backtest_win_rate ? `${(selected.last_backtest_win_rate * 100).toFixed(1)}%` : 'n/a'}</p>
              <p><span className="muted">DD:</span> {selected.last_backtest_drawdown ? `${(selected.last_backtest_drawdown * 100).toFixed(1)}%` : 'n/a'}</p>
              <p><span className="muted">Live status:</span> {selected.approved_for_live ? 'approved' : 'pending'}</p>
            </div>
          )}
          {status && <p className="green" style={{ marginTop: 12 }}>{status}</p>}
        </div>
      </div>
    </section>
  );
}
