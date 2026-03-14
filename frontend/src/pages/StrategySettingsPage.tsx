import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function StrategySettingsPage() {
  const { data: profilesData, refresh } = useApi(() => api.strategyProfiles());
  const [name, setName] = useState('SMC Wyckoff ETH/BTC');
  const [enableSpring, setEnableSpring] = useState(true);
  const [enableUtad, setEnableUtad] = useState(true);
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
        displacement_threshold: displacementThreshold,
        bos_sensitivity: bosSensitivity,
        fib_levels: parsedFib,
      },
    });

    setStatus(res.ok ? 'Profil stratégie sauvegardé.' : `Erreur: ${String(res.reason)}`);
    refresh();
  };

  return (
    <section>
      <h2>Strategy settings</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Paramétrage stratégie</h3>
          <div className="form-group"><label>Nom du profil</label><input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-group"><label>Enable spring</label><input type="checkbox" checked={enableSpring} onChange={e => setEnableSpring(e.target.checked)} style={{ width: 'auto' }} /></div>
          <div className="form-group"><label>Enable UTAD</label><input type="checkbox" checked={enableUtad} onChange={e => setEnableUtad(e.target.checked)} style={{ width: 'auto' }} /></div>
          <div className="form-group"><label>Displacement threshold</label><input type="number" step="0.01" value={displacementThreshold} onChange={e => setDisplacementThreshold(Number(e.target.value))} /></div>
          <div className="form-group"><label>BOS sensitivity</label><input type="number" value={bosSensitivity} onChange={e => setBosSensitivity(Number(e.target.value))} /></div>
          <div className="form-group"><label>Fib levels (csv)</label><input value={fibLevels} onChange={e => setFibLevels(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={saveProfile}>Sauvegarder la stratégie</button>
          {status && <p className="green" style={{ marginTop: 10 }}>{status}</p>}
        </div>

        <div className="card">
          <h3>Profils sauvegardés</h3>
          {(profilesData?.rows as Array<Record<string, unknown>> | undefined)?.map((p) => (
            <div key={String(p.id)} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
              <strong>{String(p.name)}</strong> • <span className="tag">{String(p.mode)}</span>
              <div className="muted">live-approved: {String(p.approved_for_live ? 'yes' : 'no')}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
