import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function BacktestsPage() {
  const { data, reload } = useApi(() => api.backtests());
  const { data: profiles } = useApi(() => api.strategyProfiles());
  const { data: symbols } = useApi(() => api.isolatedSymbols());
  const [symbol, setSymbol] = useState('ETHUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [report, setReport] = useState('');
  const [status, setStatus] = useState('');

  const rows = data?.rows ?? [];
  const avgPF = rows.length ? rows.reduce((s, b) => s + b.profit_factor, 0) / rows.length : 0;
  const avgWR = rows.length ? rows.reduce((s, b) => s + b.win_rate, 0) / rows.length : 0;
  const availableSymbols = useMemo(() => symbols ?? ['ETHUSDT', 'BTCUSDT'], [symbols]);

  const runBacktest = async () => {
    const res = await api.runBacktest({ symbol, timeframe, profile_id: profileId, horizon_days: 45 });
    if (res.ok) {
      setStatus('Backtest terminé et rapport généré.');
      setReport(String(res.report));
      reload();
      return;
    }
    setStatus(`Erreur: ${String(res.reason)}`);
  };

  return (
    <section>
      <h2>Backtests</h2>
      <div className="grid-3 mb-16">
        <div className="card"><div className={`stat-value ${avgWR >= 0.5 ? 'green' : 'red'}`}>{(avgWR * 100).toFixed(1)}%</div><div className="stat-label">Avg win rate</div></div>
        <div className="card"><div className={`stat-value ${avgPF >= 1.2 ? 'green' : 'yellow'}`}>{avgPF.toFixed(2)}</div><div className="stat-label">Avg profit factor</div></div>
        <div className="card"><div className="stat-value blue">{rows.length}</div><div className="stat-label">Rapports stockés</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Lancer la stratégie sur une crypto</h3>
          <div className="form-group"><label>Symbol</label><select value={symbol} onChange={e => setSymbol(e.target.value)}>{availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="form-group"><label>Timeframe</label><select value={timeframe} onChange={e => setTimeframe(e.target.value)}><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option></select></div>
          <div className="form-group"><label>Strategy profile</label><select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}><option value="">default-smc</option>{(profiles?.rows as Array<Record<string, unknown>> | undefined)?.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select></div>
          <button className="btn btn-primary" onClick={runBacktest}>Lancer backtest + rapport</button>
          {status && <p className="muted" style={{ marginTop: 10 }}>{status}</p>}
        </div>

        <div className="card">
          <h3>Rapport</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>{report || 'Aucun rapport généré pour le moment.'}</pre>
        </div>
      </div>
    </section>
  );
}
