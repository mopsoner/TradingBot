import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

type StrategyProfile = {
  id: number;
  name: string;
  mode: string;
  approved_for_live: boolean;
  last_backtest_win_rate?: number;
};

export function BotControlPage() {
  const { data: byQuote } = useApi(() => api.symbolsByQuote());
  const [quote, setQuote] = useState('USDT');
  const quoteTabs = Object.keys(byQuote ?? { USDT: [] });
  const universe = (byQuote ?? {})[quote] ?? [];
  const { data: profiles, reload: refreshProfiles } = useApi(() => api.strategyProfiles());
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [mode, setMode] = useState<'paper' | 'live' | 'research'>('paper');
  const [riskApproved, setRiskApproved] = useState(false);
  const [executeOrders, setExecuteOrders] = useState(false);
  const [strategyProfileId, setStrategyProfileId] = useState<number | null>(null);
  const [startResult, setStartResult] = useState<Record<string, unknown> | null>(null);
  const { data: status, reload: refreshStatus } = useApi(() => api.botStatus());

  useEffect(() => {
    const id = window.setInterval(() => refreshStatus(), 4000);
    return () => window.clearInterval(id);
  }, [refreshStatus]);

  useEffect(() => {
    if (!strategyProfileId && profiles?.rows?.length) {
      setStrategyProfileId(profiles.rows[0].id as number);
    }
  }, [profiles, strategyProfileId]);

  const selectedProfile = useMemo(() => {
    const rows = (profiles?.rows ?? []) as StrategyProfile[];
    return rows.find((p) => p.id === strategyProfileId) ?? null;
  }, [profiles, strategyProfileId]);

  const startBot = async () => {
    const result = await api.startBot({
      symbols: selectedSymbols,
      mode,
      risk_approved: riskApproved,
      execute_orders: executeOrders,
      timeframe: '15m',
      strategy_profile_id: strategyProfileId,
    });
    setStartResult(result);
    refreshStatus();
    refreshProfiles();
  };

  return (
    <section>
      <h2>Live cockpit</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Run temps réel (signal early)</h3>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Quote asset</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {quoteTabs.map(q => (
                <button key={q} onClick={() => { setQuote(q); setSelectedSymbols([]); }}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${quote === q ? 'var(--accent)' : 'var(--border)'}`,
                    background: quote === q ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                    color: quote === q ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
                  }}>{q}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              {selectedSymbols.length} sélectionné(s) sur {universe.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {universe.map(s => {
                const sel = selectedSymbols.includes(s);
                return (
                  <label key={s} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                    borderRadius: 5, cursor: 'pointer', fontSize: 11, userSelect: 'none',
                    background: sel ? 'rgba(88,166,255,0.12)' : 'transparent',
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                    <input type="checkbox" checked={sel} style={{ width: 'auto', margin: 0 }}
                      onChange={() => setSelectedSymbols(prev => sel ? prev.filter(x => x !== s) : [...prev, s])} />
                    {s.replace(/USDT$|USDC$|BTC$/, '')}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label>Strategy profile</label>
            <select value={strategyProfileId ?? ''} onChange={e => setStrategyProfileId(Number(e.target.value))}>
              {(profiles?.rows as StrategyProfile[] | undefined)?.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.approved_for_live ? '✅' : '⏳'}</option>
              ))}
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
            <label><input type="checkbox" checked={executeOrders} onChange={e => setExecuteOrders(e.target.checked)} style={{ width: 'auto', marginRight: 8 }} />Activer buy/sell</label>
          </div>
          <button className="btn btn-primary" onClick={startBot} disabled={selectedSymbols.length === 0}>Lancer</button>
          {startResult && (
            <p className="muted" style={{ marginTop: 10 }}>
              {startResult.ok ? `OK • ${String(startResult.signals_detected)} signaux • ${String(startResult.orders_submitted)} ordres` : `Bloqué: ${String(startResult.reason)}`}
            </p>
          )}
        </div>

        <div className="card">
          <h3>Validation live</h3>
          {!selectedProfile && <p className="muted">Crée un profil dans Strategy lab.</p>}
          {selectedProfile && (
            <>
              <p><span className="muted">Profil:</span> {selectedProfile.name}</p>
              <p><span className="muted">Backtest ready:</span> {selectedProfile.approved_for_live ? 'oui' : 'non'}</p>
              <p><span className="muted">Win rate:</span> {selectedProfile.last_backtest_win_rate ? `${(selectedProfile.last_backtest_win_rate * 100).toFixed(1)}%` : 'n/a'}</p>
              <p className="muted">Le mode live est bloqué sans profil backtesté + approuvé.</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Signal feed live</h3>
        {(status?.recent_events as Array<Record<string, unknown>> | undefined)?.slice(0, 12).map((ev, i) => (
          <div key={`${String(ev.symbol)}-${i}`} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
            <strong>{String(ev.symbol)}</strong> • <span className="tag">{String(ev.session_name)}</span> • <span className="badge badge-blue">{String(ev.status)}</span>
            <div className="muted">{String(ev.details)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
