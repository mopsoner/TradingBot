import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

type StrategyProfile = {
  id: number;
  name: string;
  mode: string;
  approved_for_live: boolean;
  last_backtest_win_rate?: number;
  last_backtest_profit_factor?: number;
};

export function StrategySettingsPage() {
  const { data: profilesData, refresh } = useApi(() => api.strategyProfiles());
  const [name, setName] = useState('SMC Wyckoff ETH/BTC');
  const [enableSpring, setEnableSpring] = useState(true);
  const [enableUtad, setEnableUtad] = useState(true);
  const [allowLong, setAllowLong] = useState(true);
  const [allowShort, setAllowShort] = useState(true);
  const [displacementThreshold, setDisplacementThreshold] = useState(0.35);
  const [bosSensitivity, setBosSensitivity] = useState(3);
  const [fibLevels, setFibLevels] = useState('0.5,0.618,0.705');
  const [status, setStatus] = useState('');

  const saveProfile = async () => {
    const parsedFib = fibLevels
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => !Number.isNaN(v));

    const res = await api.saveStrategyProfile({
      name,
      mode: 'research',
      parameters: {
        setup: ['liquidity-zone', 'liquidity-sweep', 'spring-utad', 'displacement', 'bos'],
        enable_spring: enableSpring,
        enable_utad: enableUtad,
        allow_long: allowLong,
        allow_short: allowShort,
        displacement_threshold: displacementThreshold,
        bos_sensitivity: bosSensitivity,
        fib_levels: parsedFib,
      },
    });

    setStatus(res.ok ? 'Profil stratégie sauvegardé.' : `Erreur: ${String(res.reason)}`);
    refresh();
  };

  const backtestAndApprove = async (profile: StrategyProfile) => {
    const bt = await api.backtestStrategyProfile(profile.id);
    if (!bt.ok) {
      setStatus(`Backtest impossible: ${String(bt.reason)}`);
      return;
    }
    const approve = await api.approveStrategyProfile(profile.id, { approved: true, approved_by: 'strategy-settings' });
    if (!approve.ok) {
      setStatus(`Backtest OK, approbation live refusée: ${String(approve.reason)}`);
      refresh();
      return;
    }
    setStatus(`Profil ${profile.name} backtesté et approuvé live.`);
    refresh();
  };

  return (
    <section>
      <h2>Strategy settings</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Paramétrage stratégie</h3>
          <div className="form-group">
            <label>Nom du profil</label>
            <input value={name} onChange={e => setName(e.target.value)} />
            <small className="muted">Nom versionné du setup pour retrouver facilement les rapports/backtests.</small>
          </div>
          <div className="form-group">
            <label>Enable spring</label>
            <input type="checkbox" checked={enableSpring} onChange={e => setEnableSpring(e.target.checked)} style={{ width: 'auto' }} />
            <small className="muted">Active les entrées LONG après sweep bas + Spring + BOS haussier.</small>
          </div>
          <div className="form-group">
            <label>Enable UTAD</label>
            <input type="checkbox" checked={enableUtad} onChange={e => setEnableUtad(e.target.checked)} style={{ width: 'auto' }} />
            <small className="muted">Active les entrées SHORT après sweep haut + UTAD + BOS baissier.</small>
          </div>
          <div className="form-group">
            <label>Directions autorisées</label>
            <div className="flex gap-8">
              <label><input type="checkbox" checked={allowLong} onChange={e => setAllowLong(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />LONG</label>
              <label><input type="checkbox" checked={allowShort} onChange={e => setAllowShort(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />SHORT</label>
            </div>
            <small className="muted">Le bot prendra en compte LONG et SHORT selon ces cases.</small>
          </div>
          <div className="form-group">
            <label>Displacement threshold</label>
            <input type="number" step="0.01" value={displacementThreshold} onChange={e => setDisplacementThreshold(Number(e.target.value))} />
            <small className="muted">Force minimale du mouvement impulsif après Spring/UTAD.</small>
          </div>
          <div className="form-group">
            <label>BOS sensitivity</label>
            <input type="number" value={bosSensitivity} onChange={e => setBosSensitivity(Number(e.target.value))} />
            <small className="muted">Sensibilité de cassure de structure (BOS): plus haut = confirmation plus stricte.</small>
          </div>
          <div className="form-group">
            <label>Fib levels (csv)</label>
            <input value={fibLevels} onChange={e => setFibLevels(e.target.value)} />
            <small className="muted">Niveaux de retracement autorisés (ex: 0.5, 0.618, 0.705).</small>
          </div>
          <button className="btn btn-primary" onClick={saveProfile}>Sauvegarder la stratégie</button>
          {status && <p className="green" style={{ marginTop: 10 }}>{status}</p>}
        </div>

        <div className="card">
          <h3>Profils sauvegardés</h3>
          {(profilesData?.rows as StrategyProfile[] | undefined)?.map((p) => (
            <div key={String(p.id)} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
              <strong>{String(p.name)}</strong> • <span className="tag">{String(p.mode)}</span>
              <div className="muted">live-approved: {String(p.approved_for_live ? 'yes' : 'no')}</div>
              <div className="muted">win-rate: {p.last_backtest_win_rate ? `${(p.last_backtest_win_rate * 100).toFixed(1)}%` : 'n/a'} • PF: {p.last_backtest_profit_factor?.toFixed(2) ?? 'n/a'}</div>
              <div className="flex gap-8" style={{ marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => backtestAndApprove(p)}>Backtester + approuver live</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
