import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { PipelineEntry, PipelineStep, PipelineRunRecord } from '../services/api';
import { TIMEFRAMES } from '../constants';
import { nowTime, fmtSym, fmtDateTime } from '../utils/dateUtils';
import { PipelineRunDetailModal } from '../components/PipelineRunDetail';

const STEP_LABELS_SHORT = ['LIQ', 'SWEEP', 'WYK', 'DISP', 'BOS', 'EXP', 'FIB'];
const STEP_FULL = [
  'Liquidité',
  'Sweep',
  'Spring / UTAD',
  'Displacement',
  'BOS',
  'Expansion vers liquidité',
  'Fib Retracement (0.5 / 0.618 / 0.705)',
];

type Mode = 'paper' | 'live';

function StepDot({ step, index }: { step: PipelineStep; index: number }) {
  const [hover, setHover] = useState(false);
  const colors: Record<string, string> = {
    pending:  'var(--text-muted)',
    checking: '#f0b429',
    passed:   'var(--accent-green)',
    failed:   'var(--accent-red)',
  };
  const bg: Record<string, string> = {
    pending:  'rgba(120,120,140,0.15)',
    checking: 'rgba(240,180,41,0.18)',
    passed:   'rgba(63,185,80,0.15)',
    failed:   'rgba(248,81,73,0.15)',
  };
  const icon: Record<string, string> = {
    pending:  '○',
    checking: '◉',
    passed:   '✓',
    failed:   '✗',
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{
        width: 28, height: 28, borderRadius: '50%',
        background: bg[step.status],
        border: `2px solid ${colors[step.status]}`,
        color: colors[step.status],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
        animation: step.status === 'checking' ? 'pulse 0.9s ease-in-out infinite' : 'none',
        transition: 'all 0.2s',
        cursor: step.detail ? 'help' : 'default',
        flexShrink: 0,
      }}>
        {icon[step.status]}
      </span>
      <span style={{ fontSize: 9, color: colors[step.status], fontWeight: 600, letterSpacing: '0.03em' }}>
        {STEP_LABELS_SHORT[index]}
      </span>
      {hover && step.detail && (
        <span style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface3, #1c2128)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
          whiteSpace: 'nowrap', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          color: 'var(--text)', pointerEvents: 'none',
          minWidth: 160, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{STEP_FULL[index]}</div>
          {step.detail}
        </span>
      )}
    </span>
  );
}

function SymbolRow({ entry }: { entry: PipelineEntry }) {
  const sym = fmtSym(entry.symbol);
  const isRunning  = entry.final_status === null;
  const isAccepted = entry.final_status === 'accepted';
  const isRejected = entry.final_status === 'rejected';
  const checking   = entry.steps.findIndex(s => s.status === 'checking');
  const progress   = isRunning
    ? entry.steps.filter(s => s.status !== 'pending').length
    : entry.steps.length;

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10, marginBottom: 10, transition: 'all 0.3s',
      border: `1px solid ${isAccepted ? 'rgba(63,185,80,0.35)' : isRejected ? 'rgba(248,81,73,0.25)' : 'var(--border)'}`,
      background: isAccepted ? 'rgba(63,185,80,0.06)' : isRejected ? 'rgba(248,81,73,0.04)' : 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 90 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{sym}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.timeframe}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flex: 1, flexWrap: 'wrap' }}>
          {entry.steps.map((step, i) => <StepDot key={i} step={step} index={i} />)}
        </div>
        <div style={{ minWidth: 120, textAlign: 'right' }}>
          {isRunning && (
            <div style={{ color: '#f0b429', fontSize: 12, fontWeight: 600 }}>
              🔄 Étape {progress}/7
              {checking >= 0 && (
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                  {STEP_FULL[checking]}…
                </div>
              )}
            </div>
          )}
          {isAccepted && (
            <div>
              <div style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: 14 }}>
                ✅ {entry.final_direction}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Signal validé</div>
            </div>
          )}
          {isRejected && (
            <div>
              <div style={{ color: 'var(--accent-red)', fontWeight: 700, fontSize: 14 }}>❌ Rejeté</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{entry.final_reason}</div>
            </div>
          )}
          {entry.final_status === 'error' && (
            <div style={{ color: 'var(--accent-red)', fontSize: 12 }}>⚠ Erreur</div>
          )}
        </div>
      </div>
      {isRunning && (
        <div style={{ marginTop: 8, height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, var(--accent), #f0b429)',
            width: `${(progress / 7) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}
    </div>
  );
}

export function PipelinePage() {
  const { data: byQuote }  = useApi(() => api.symbolsByQuote());
  const { data: profiles } = useApi(() => api.strategyProfiles());

  const [quote, setQuote]   = useState('USDT');
  const quotes              = Object.keys(byQuote ?? { USDT: [] });
  const universe            = (byQuote ?? {})[quote] ?? [];

  const [selected, setSelected]   = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState('1h');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [mode, setMode]           = useState<Mode>('paper');

  const [state, setState]   = useState<Record<string, PipelineEntry>>({});
  const [stats, setStats]   = useState({ in_progress: 0, accepted: 0, rejected: 0, total: 0 });
  const [running, setRunning]   = useState(false);
  const [lastRun, setLastRun]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [liveConfirm, setLiveConfirm]         = useState(false);
  const [liveStatus, setLiveStatus]           = useState<string | null>(null);
  const [liveSubmitting, setLiveSubmitting]   = useState(false);

  const [history, setHistory]           = useState<PipelineRunRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [historyPage, setHistoryPage]   = useState(0);
  const [detailRunId, setDetailRunId]   = useState<string | null>(null);
  const HISTORY_PAGE_SIZE = 20;

  const profileRows = (profiles?.rows as Array<Record<string, unknown>> | undefined) ?? [];

  useEffect(() => {
    if (profileId === null && profileRows.length > 0) setProfileId(Number(profileRows[0].id));
  }, [profileRows.length]);

  const selectedProfile = profileRows.find(p => Number(p.id) === profileId);
  const profileParams: Record<string, unknown> = (() => {
    try { return JSON.parse(String(selectedProfile?.parameters ?? '{}')); } catch { return {}; }
  })();
  const profileAllowsWeekend = Boolean(profileParams.allow_weekend_trading ?? false);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const poll = async () => {
    try {
      const res = await api.getPipeline();
      setState(res.pipeline);
      setStats({ in_progress: res.in_progress, accepted: res.accepted, rejected: res.rejected, total: res.total });
      if (res.in_progress === 0 && res.total > 0) {
        setRunning(false);
        stopPolling();
        fetchHistory();
        if (mode === 'live' && res.accepted > 0) setLiveConfirm(true);
      }
    } catch { /* network hiccup */ }
  };

  const launch = async () => {
    if (selected.length === 0) return;
    setRunning(true);
    setLastRun(nowTime());
    setState({});
    setStats({ in_progress: 0, accepted: 0, rejected: 0, total: 0 });
    setLiveConfirm(false);
    setLiveStatus(null);
    stopPolling();
    try {
      await api.runPipeline({ symbols: selected, timeframe, profile_id: profileId, mode });
      pollRef.current = setInterval(poll, 500);
    } catch {
      setRunning(false);
    }
  };

  const submitLiveOrders = async () => {
    setLiveSubmitting(true);
    try {
      const res = await api.startBot({
        symbols: selected,
        timeframe,
        strategy_profile_id: profileId,
        mode: 'live',
        execute_orders: true,
        risk_approved: true,
        expansion_to_next_liquidity: true,
      });
      if (res.ok) {
        setLiveStatus(`✅ ${String(res.orders_submitted ?? 0)} ordre(s) soumis au marché.`);
      } else {
        setLiveStatus(`⛔ Bloqué : ${String(res.reason ?? 'erreur inconnue')}`);
      }
    } catch {
      setLiveStatus('⛔ Erreur réseau lors de la soumission.');
    } finally {
      setLiveSubmitting(false);
      setLiveConfirm(false);
    }
  };

  const fetchHistory = (page = historyPage) => {
    const offset = page * HISTORY_PAGE_SIZE;
    api.pipelineRuns(`?limit=${HISTORY_PAGE_SIZE}&offset=${offset}`).then(data => {
      setHistory(data.rows);
      setHistoryTotal(data.total);
    }).catch(() => {});
  };

  useEffect(() => { fetchHistory(0); }, []);

  useEffect(() => () => stopPolling(), []);

  const toggleSymbol = (sym: string) => {
    setSelected(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);
  };

  const entries = Object.values(state);
  const allDone = stats.total > 0 && stats.in_progress === 0;
  const acceptedEntries = entries.filter(e => e.final_status === 'accepted');

  return (
    <section>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Pipeline Live</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Validation en temps réel des setups SMC/Wyckoff — séquence obligatoire 7 étapes
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastRun && <span className="muted" style={{ fontSize: 12 }}>Dernier scan : {lastRun}</span>}
          <button
            className={`btn ${mode === 'live' ? 'btn-danger' : 'btn-primary'}`}
            onClick={launch}
            disabled={running || selected.length === 0}
            style={{ minWidth: 180, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            {running
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Analyse…</>
              : mode === 'live' ? '⚡ Analyser (mode LIVE)' : '▶ Lancer en Paper'}
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Config card */}
        <div className="card">
          <h3>Configuration</h3>

          {/* Mode Paper / Live */}
          <div className="form-group">
            <label>Mode d'exécution</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['paper', 'live'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setLiveConfirm(false); setLiveStatus(null); }}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', transition: 'all 0.2s',
                    border: mode === m
                      ? `2px solid ${m === 'live' ? 'var(--accent-red)' : 'var(--accent)'}`
                      : '2px solid var(--border)',
                    background: mode === m
                      ? m === 'live' ? 'rgba(248,81,73,0.15)' : 'rgba(88,166,255,0.15)'
                      : 'var(--surface2)',
                    color: mode === m
                      ? m === 'live' ? 'var(--accent-red)' : 'var(--accent)'
                      : 'var(--text-muted)',
                  }}
                >
                  {m === 'paper' ? '📄 Paper' : '⚡ Live'}
                </button>
              ))}
            </div>
            {mode === 'paper' && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Simulation — aucun ordre réel envoyé, résultats enregistrés en DB.
              </p>
            )}
            {mode === 'live' && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--accent-red)', fontWeight: 600 }}>
                Mode LIVE — ordres réels sur Binance après confirmation explicite.
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label} — {tf.desc}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
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
            <select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— aucun profil —</option>
              {profileRows.map(p => {
                let pp: Record<string, unknown> = {};
                try { pp = JSON.parse(String(p.parameters ?? '{}')); } catch { /**/ }
                const we = Boolean(pp.allow_weekend_trading);
                return (
                  <option key={String(p.id)} value={String(p.id)}>
                    {we ? '✅ ' : '⛔ '}{String(p.name)}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Crypto selector */}
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Cryptos à analyser ({selected.length} sélectionnées)</h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {quotes.map(q => (
              <button key={q} onClick={() => setQuote(q)}
                style={{
                  padding: '3px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${quote === q ? 'var(--accent)' : 'var(--border)'}`,
                  background: quote === q ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                  color: quote === q ? 'var(--accent)' : 'var(--text-muted)',
                }}>{q}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
            {universe.map(sym => {
              const isOn  = selected.includes(sym);
              const entry = state[sym];
              const dot   = entry?.final_status === 'accepted' ? '🟢'
                          : entry?.final_status === 'rejected' ? '🔴'
                          : entry ? '🟡' : null;
              return (
                <button key={sym} onClick={() => toggleSymbol(sym)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: isOn ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                    border: `1px solid ${isOn ? 'var(--accent)' : 'var(--border)'}`,
                    color: isOn ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {dot && <span style={{ marginRight: 4 }}>{dot}</span>}
                  {fmtSym(sym)}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setSelected(prev => [...new Set([...prev, ...universe])])}>
              Tout sélect. ({quote})
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setSelected(prev => prev.filter(s => !universe.includes(s)))}>
              Tout désélect.
            </button>
            {selected.length > 0 && (
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setSelected([])}>
                Effacer tout
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total',     value: stats.total,       color: 'var(--accent)' },
            { label: 'En cours',  value: stats.in_progress, color: '#f0b429' },
            { label: 'Acceptés',  value: stats.accepted,    color: 'var(--accent-green)' },
            { label: 'Rejetés',   value: stats.rejected,    color: 'var(--accent-red)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div className="muted" style={{ fontSize: 12 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Paper — résultats validés */}
      {allDone && stats.accepted > 0 && mode === 'paper' && (
        <div style={{
          marginBottom: 16, padding: 16, borderRadius: 10,
          background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.3)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-green)', marginBottom: 8 }}>
            ✅ {stats.accepted} signal{stats.accepted > 1 ? 's' : ''} paper validé{stats.accepted > 1 ? 's' : ''} — enregistrés en base
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {acceptedEntries.map(e => (
              <div key={e.symbol} style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.4)',
              }}>
                <strong>{fmtSym(e.symbol)}</strong>
                <span style={{ marginLeft: 8, color: 'var(--accent-green)', fontWeight: 700 }}>{e.final_direction}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live — panneau de confirmation */}
      {liveConfirm && mode === 'live' && acceptedEntries.length > 0 && (
        <div style={{
          marginBottom: 16, padding: 20, borderRadius: 10,
          background: 'rgba(248,81,73,0.08)', border: '2px solid rgba(248,81,73,0.5)',
        }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--accent-red)', marginBottom: 10 }}>
            ⚡ {acceptedEntries.length} signal{acceptedEntries.length > 1 ? 's' : ''} validé{acceptedEntries.length > 1 ? 's' : ''} — confirmation requise
          </div>

          {/* Signaux à envoyer */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {acceptedEntries.map(e => (
              <div key={e.symbol} style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.4)',
              }}>
                <strong>{fmtSym(e.symbol)}</strong>
                <span style={{
                  marginLeft: 8, fontWeight: 700,
                  color: e.final_direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  {e.final_direction}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            padding: '10px 14px', borderRadius: 8, background: 'rgba(248,81,73,0.1)',
            fontSize: 12, color: 'var(--accent-red)', fontWeight: 600, marginBottom: 14,
          }}>
            ⚠ Ces ordres seront envoyés en <strong>LIVE sur Binance</strong> avec de l'argent réel.
            Vérifie ton profil, ton levier et ta gestion du risque avant de confirmer.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-danger"
              onClick={submitLiveOrders}
              disabled={liveSubmitting}
              style={{ fontWeight: 700 }}
            >
              {liveSubmitting ? '⟳ Envoi en cours…' : `✅ Confirmer ${acceptedEntries.length} ordre(s) LIVE`}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setLiveConfirm(false); setLiveStatus(null); }}
              disabled={liveSubmitting}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Live — résultat de la soumission */}
      {liveStatus && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 10,
          background: liveStatus.startsWith('✅') ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
          border: `1px solid ${liveStatus.startsWith('✅') ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
          fontWeight: 600,
          color: liveStatus.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)',
        }}>
          {liveStatus}
        </div>
      )}

      {/* Placeholder vide */}
      {entries.length === 0 && !running && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔬</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Pipeline prêt</div>
          <div className="muted" style={{ maxWidth: 420, margin: '0 auto' }}>
            Sélectionne tes cryptos, choisis le mode <strong>Paper</strong> ou <strong>Live</strong>,
            puis clique sur le bouton de lancement pour voir la validation des 7 étapes en direct.
          </div>
        </div>
      )}

      {/* Résultats */}
      {entries.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '4px 16px' }}>
            <div style={{ minWidth: 90, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>CRYPTO</div>
            <div style={{ flex: 1, display: 'flex', gap: 8, paddingLeft: 4 }}>
              {STEP_LABELS_SHORT.map((s, i) => (
                <div key={i} style={{ width: 28, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{s}</div>
              ))}
            </div>
            <div style={{ minWidth: 120, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>STATUT</div>
          </div>
          {entries
            .sort((a, b) => {
              const order = { accepted: 0, rejected: 2, null: 1, error: 3 };
              return (order[String(a.final_status) as keyof typeof order] ?? 1) - (order[String(b.final_status) as keyof typeof order] ?? 1);
            })
            .map(entry => <SymbolRow key={entry.symbol} entry={entry} />)}
        </div>
      )}

      {detailRunId && <PipelineRunDetailModal runId={detailRunId} onClose={() => setDetailRunId(null)} />}

      {/* Historique */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => setHistoryOpen(!historyOpen)}
          style={{
            padding: '12px 16px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            borderBottom: historyOpen ? '1px solid var(--border)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Historique des runs</span>
            <span className="tag" style={{ fontSize: 10 }}>{historyTotal}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: historyOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
        </div>
        {historyOpen && (
          <div>
            <div style={{ maxHeight: 350, overflowY: 'auto' }}>
              {history.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Aucun run enregistré
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-mid)' }}>
                      {['RUN', 'DATE', 'MODE', 'TF', 'SYMBOLES', 'OK', 'KO', 'DURÉE'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(r => {
                      let syms: string[] = [];
                      try { syms = JSON.parse(r.symbols_json); } catch { /**/ }
                      const dur = r.completed_at
                        ? Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                        : null;
                      const shortId = `#${r.run_id.slice(0, 6)}`;
                      return (
                        <tr
                          key={r.run_id}
                          onClick={() => setDetailRunId(r.run_id)}
                          style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{shortId}</span>
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.started_at)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: r.mode === 'live' ? 'rgba(248,81,73,0.15)' : 'rgba(59,130,246,0.12)',
                              color: r.mode === 'live' ? 'var(--accent-red)' : 'var(--accent)',
                            }}>{r.mode}</span>
                          </td>
                          <td style={{ padding: '8px 10px' }}><span className="tag" style={{ fontSize: 10 }}>{r.timeframe}</span></td>
                          <td style={{ padding: '8px 10px', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {syms.map(s => fmtSym(s)).join(', ')}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontWeight: 700, color: r.accepted_count > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                              {r.accepted_count}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontWeight: 700, color: r.rejected_count > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                              {r.rejected_count}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                            {dur !== null ? `${dur}s` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {historyTotal > HISTORY_PAGE_SIZE && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Page {historyPage + 1} / {Math.ceil(historyTotal / HISTORY_PAGE_SIZE)} ({historyTotal} runs)
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    disabled={historyPage === 0}
                    onClick={() => { const p = historyPage - 1; setHistoryPage(p); fetchHistory(p); }}
                  >
                    ← Préc.
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal}
                    onClick={() => { const p = historyPage + 1; setHistoryPage(p); fetchHistory(p); }}
                  >
                    Suiv. →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Légende */}
      <div style={{ marginTop: 20, padding: 14, borderRadius: 8, background: 'var(--surface2)', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Légende des étapes</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['○', 'var(--text-muted)',    'En attente'],
            ['◉', '#f0b429',             'Analyse en cours'],
            ['✓', 'var(--accent-green)', 'Passé'],
            ['✗', 'var(--accent-red)',   'Échoué (stop)'],
          ].map(([icon, color, label]) => (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: color as string, fontWeight: 700 }}>{icon}</span>
              <span className="muted">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
          Survole une étape pour voir le détail. 7 étapes obligatoires dans l'ordre.
          RSI / MACD / EMA : jamais déclencheurs, sessions et weekend : filtres uniquement.
        </div>
      </div>
    </section>
  );
}
