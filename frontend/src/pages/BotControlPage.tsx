import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { fmtSym } from '../utils/dateUtils';

type StrategyProfile = {
  id: number;
  name: string;
  mode: string;
  approved_for_live: boolean;
  last_backtest_win_rate?: number;
  parameters?: string;
};

type AutoStatus = {
  running: boolean;
  symbols: string[];
  timeframe: string;
  profile_id: number | null;
  interval_minutes: number;
  next_run_at: string | null;
  last_run_at: string | null;
  run_count: number;
  last_signals: number;
  last_run_results: Array<{
    symbol: string; status: string; signal: string; session: string; details: string; ts: string;
  }>;
  seconds_to_next: number | null;
};

const INTERVALS = [
  { value: 1,   label: '1 min',  desc: 'Test rapide' },
  { value: 5,   label: '5 min',  desc: 'Actif' },
  { value: 15,  label: '15 min', desc: 'Standard' },
  { value: 30,  label: '30 min', desc: 'Modéré' },
  { value: 60,  label: '1h',     desc: 'Long terme' },
];

function fmtCountdown(sec: number | null): string {
  if (sec === null || sec < 0) return '—';
  if (sec === 0) return 'En cours…';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  return `il y a ${Math.floor(diff / 3600)}h`;
}

export function BotControlPage() {
  const { data: byQuote }  = useApi(() => api.symbolsByQuote());
  const { data: profiles } = useApi(() => api.strategyProfiles());

  const [quote, setQuote]             = useState('USDT');
  const quoteTabs                     = Object.keys(byQuote ?? { USDT: [] });
  const universe                      = (byQuote ?? {})[quote] ?? [];
  const profileRows                   = (profiles?.rows as StrategyProfile[] | undefined) ?? [];

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [profileId, setProfileId]     = useState<number | null>(null);
  const [interval, setInterval]       = useState(15);
  const [timeframe, setTimeframe]     = useState('1h');

  const [autoStatus, setAutoStatus]   = useState<AutoStatus | null>(null);
  const [autoError, setAutoError]     = useState('');
  const [ticker, setTicker]           = useState(0);

  const [manualResult, setManualResult] = useState<Record<string, unknown> | null>(null);
  const { data: botStatus, reload: refreshBot } = useApi(() => api.botStatus());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!profileId && profileRows.length > 0) {
      setProfileId(profileRows[0].id);
    }
  }, [profileRows.length]);

  const refreshAuto = async () => {
    try {
      const s = await api.autonomousStatus() as unknown as AutoStatus;
      setAutoStatus(s);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refreshAuto();
    pollRef.current = window.setInterval(() => {
      refreshAuto();
      refreshBot();
      setTicker(t => t + 1);
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const isRunning = autoStatus?.running ?? false;

  const startAuto = async () => {
    if (selectedSymbols.length === 0) { setAutoError('Sélectionne au moins 1 crypto.'); return; }
    setAutoError('');
    const res = await api.autonomousStart({
      symbols: selectedSymbols,
      timeframe,
      profile_id: profileId,
      interval_minutes: interval,
    }) as Record<string, unknown>;
    if (!res.ok) setAutoError(String(res.reason ?? 'Erreur'));
    await refreshAuto();
  };

  const stopAuto = async () => {
    await api.autonomousStop();
    await refreshAuto();
  };

  const startManual = async () => {
    const result = await api.startBot({
      symbols: selectedSymbols,
      mode: 'paper',
      risk_approved: false,
      execute_orders: false,
      timeframe,
      strategy_profile_id: profileId,
    });
    setManualResult(result as Record<string, unknown>);
    refreshBot();
  };

  const selectedProfile = useMemo(
    () => profileRows.find(p => p.id === profileId) ?? null,
    [profileRows, profileId],
  );

  const profileParams: Record<string, unknown> = useMemo(() => {
    try { return JSON.parse(selectedProfile?.parameters ?? '{}'); } catch { return {}; }
  }, [selectedProfile]);

  const profileAllowsWeekend = Boolean(profileParams.allow_weekend_trading);

  const recentEvents = (botStatus?.recent_events as Array<Record<string, unknown>> | undefined) ?? [];
  const lastRunResults = autoStatus?.last_run_results ?? [];

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>Live Cockpit — Mode Autonome</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Surveillance continue en paper (aucun ordre réel). Signaux SMC/Wyckoff en temps réel.
      </p>

      {/* ── Configuration ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Crypto selection */}
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Cryptos à surveiller</h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {quoteTabs.map(q => (
              <button key={q} onClick={() => { setQuote(q); setSelectedSymbols([]); }}
                style={{
                  padding: '3px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${quote === q ? 'var(--accent)' : 'var(--border)'}`,
                  background: quote === q ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                  color: quote === q ? 'var(--accent)' : 'var(--text-muted)',
                }}>{q}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            {selectedSymbols.length} sélectionnée(s) sur {universe.length}
            {selectedSymbols.length > 0 && (
              <button onClick={() => setSelectedSymbols([])}
                style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer' }}>
                tout décocher
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
            {universe.map((s: string) => {
              const sel = selectedSymbols.includes(s);
              return (
                <label key={s} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                  borderRadius: 5, cursor: 'pointer', fontSize: 11, userSelect: 'none',
                  background: sel ? 'rgba(88,166,255,0.12)' : 'transparent',
                  border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                  <input type="checkbox" checked={sel} style={{ width: 'auto', margin: 0 }}
                    onChange={() => setSelectedSymbols(prev =>
                      sel ? prev.filter(x => x !== s) : [...prev, s]
                    )} />
                  {fmtSym(s).split('/')[0]}
                </label>
              );
            })}
          </div>
          <button
            style={{ marginTop: 8, fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text-muted)', cursor: 'pointer' }}
            onClick={() => setSelectedSymbols(universe as string[])}>
            tout sélectionner
          </button>
        </div>

        {/* Settings */}
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Paramètres</h3>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Profil stratégie
              {profileId !== null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                  background: profileAllowsWeekend ? 'rgba(63,185,80,0.2)' : 'rgba(240,180,41,0.2)',
                  color: profileAllowsWeekend ? 'var(--accent-green)' : 'var(--accent-yellow)',
                  border: `1px solid ${profileAllowsWeekend ? 'var(--accent-green)' : 'var(--accent-yellow)'}`,
                }}>
                  WE {profileAllowsWeekend ? 'ON' : 'OFF'}
                </span>
              )}
            </label>
            <select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}
              disabled={isRunning}>
              <option value="">— aucun —</option>
              {profileRows.map(p => {
                let pp: Record<string, unknown> = {};
                try { pp = JSON.parse(p.parameters ?? '{}'); } catch { /**/ }
                return (
                  <option key={p.id} value={p.id}>
                    {Boolean(pp.allow_weekend_trading) ? '✅ ' : '⛔ '}{p.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label>Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} disabled={isRunning}>
              {['1m','5m','15m','1h','4h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Intervalle de scan</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {INTERVALS.map(iv => (
                <button key={iv.value}
                  onClick={() => !isRunning && setInterval(iv.value)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isRunning ? 'not-allowed' : 'pointer',
                    border: `1px solid ${interval === iv.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: interval === iv.value ? 'rgba(88,166,255,0.18)' : 'var(--surface2)',
                    color: interval === iv.value ? 'var(--accent)' : 'var(--text-muted)',
                    opacity: isRunning ? 0.6 : 1,
                  }}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>

          {selectedProfile && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              WR: {selectedProfile.last_backtest_win_rate
                ? `${(selectedProfile.last_backtest_win_rate * 100).toFixed(1)}%`
                : 'n/a'}
              {selectedProfile.approved_for_live && <span style={{ marginLeft: 8, color: 'var(--accent-green)' }}>✅ Approuvé live</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Autonomous control panel ────────────────────────────────────── */}
      <div className="card" style={{
        marginBottom: 16,
        border: `2px solid ${isRunning ? 'var(--accent-green)' : 'var(--border)'}`,
        background: isRunning ? 'rgba(63,185,80,0.04)' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: isRunning ? 'var(--accent-green)' : 'var(--text-muted)',
              boxShadow: isRunning ? '0 0 8px var(--accent-green)' : 'none',
              flexShrink: 0,
              animation: isRunning ? 'pulse 2s infinite' : 'none',
            }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {isRunning ? 'Surveillance active' : 'Surveillance arrêtée'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {isRunning
                  ? `${autoStatus?.symbols.length ?? 0} cryptos · toutes les ${autoStatus?.interval_minutes}min · ${autoStatus?.run_count ?? 0} scan(s) effectué(s)`
                  : 'Sélectionne tes cryptos et démarre'}
              </div>
            </div>
          </div>

          {/* Countdown + stats */}
          {isRunning && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {fmtCountdown(autoStatus?.seconds_to_next ?? null)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>prochain scan</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-yellow)' }}>
                  {autoStatus?.last_signals ?? 0}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>signaux (dernier)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {fmtAgo(autoStatus?.last_run_at ?? null)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>dernier scan</div>
              </div>
            </div>
          )}

          {/* Start / Stop */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isRunning ? (
              <button className="btn btn-primary"
                onClick={startAuto}
                disabled={selectedSymbols.length === 0}
                style={{ fontSize: 14, padding: '8px 20px', fontWeight: 700 }}>
                ▶ Démarrer la surveillance
              </button>
            ) : (
              <button
                onClick={stopAuto}
                style={{
                  fontSize: 14, padding: '8px 20px', fontWeight: 700, cursor: 'pointer',
                  borderRadius: 8, border: '1px solid var(--accent-red)',
                  background: 'rgba(248,81,73,0.15)', color: 'var(--accent-red)',
                }}>
                ⏹ Arrêter
              </button>
            )}
            {/* Manual trigger while running */}
            {isRunning && (
              <button
                onClick={startManual}
                disabled={selectedSymbols.length === 0}
                style={{
                  fontSize: 12, padding: '6px 14px', cursor: 'pointer',
                  borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text-muted)',
                }}>
                ⚡ Scan immédiat
              </button>
            )}
          </div>
        </div>

        {autoError && (
          <p style={{ marginTop: 10, color: 'var(--accent-red)', fontSize: 12 }}>⚠ {autoError}</p>
        )}

        {/* Active symbols pills */}
        {isRunning && (autoStatus?.symbols.length ?? 0) > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {autoStatus!.symbols.map(sym => (
              <span key={sym} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(88,166,255,0.12)', color: 'var(--accent)',
                border: '1px solid rgba(88,166,255,0.3)',
              }}>{fmtSym(sym)}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Last scan results ───────────────────────────────────────────── */}
      {lastRunResults.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>
            Résultats du dernier scan
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              {fmtAgo(autoStatus?.last_run_at ?? null)}
            </span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {lastRunResults.map((r, i) => {
              const hasSignal = r.status === 'SIGNAL_DETECTED';
              return (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: hasSignal ? 'rgba(63,185,80,0.1)' : 'var(--surface2)',
                  border: `1px solid ${hasSignal ? 'var(--accent-green)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>{fmtSym(r.symbol)}</strong>
                    {hasSignal && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                        background: r.signal === 'LONG' ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)',
                        color: r.signal === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}>{r.signal}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {r.details.slice(0, 50)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.session}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Signal feed (all recent) ────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>
          Signal feed global
          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            mis à jour toutes les 2s
          </span>
        </h3>
        {recentEvents.length === 0 && (
          <p className="muted">Aucun signal enregistré. Démarre la surveillance pour voir les résultats ici.</p>
        )}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {recentEvents.slice(0, 30).map((ev, i) => {
            const isSignal = String(ev.status) === 'SIGNAL_DETECTED';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--border)', padding: '7px 0',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isSignal ? 'var(--accent-green)' : 'var(--text-muted)',
                }} />
                <strong style={{ fontSize: 12, minWidth: 80 }}>{fmtSym(String(ev.symbol))}</strong>
                <span className="tag" style={{ fontSize: 10 }}>{String(ev.session_name)}</span>
                <span className="tag" style={{ fontSize: 10 }}>{String(ev.timeframe ?? '—')}</span>
                {isSignal && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                    background: String(ev.signal) === 'LONG' ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)',
                    color: String(ev.signal) === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>{String(ev.signal)}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                  {String(ev.details ?? '').slice(0, 70)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scan manuel (secondaire) ────────────────────────────────────── */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: '6px 0' }}>
          Scan manuel ponctuel (avancé)
        </summary>
        <div className="card" style={{ marginTop: 8 }}>
          <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
            Lance un scan unique immédiat avec les cryptos et le profil sélectionnés ci-dessus.
          </p>
          <button className="btn btn-secondary" onClick={startManual} disabled={selectedSymbols.length === 0}>
            Lancer un scan ponctuel
          </button>
          {manualResult && (
            <p className="muted" style={{ marginTop: 8 }}>
              {manualResult.ok
                ? `✅ ${String(manualResult.signals_detected)} signal(s) détecté(s)`
                : `❌ Bloqué : ${String(manualResult.reason)}`}
            </p>
          )}
        </div>
      </details>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}
