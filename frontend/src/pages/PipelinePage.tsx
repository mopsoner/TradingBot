import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { PipelineEntry, PipelineStep } from '../services/api';
import { TIMEFRAMES } from '../constants';
import { nowTime, fmtSym } from '../utils/dateUtils';

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
  const isRunning = entry.final_status === null;
  const isAccepted = entry.final_status === 'accepted';
  const isRejected = entry.final_status === 'rejected';
  const checking = entry.steps.findIndex(s => s.status === 'checking');
  const progress = isRunning
    ? entry.steps.filter(s => s.status !== 'pending').length
    : entry.steps.length;

  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 10,
      border: `1px solid ${isAccepted ? 'rgba(63,185,80,0.35)' : isRejected ? 'rgba(248,81,73,0.25)' : 'var(--border)'}`,
      background: isAccepted ? 'rgba(63,185,80,0.06)' : isRejected ? 'rgba(248,81,73,0.04)' : 'var(--surface)',
      transition: 'all 0.3s',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 90 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{sym}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.timeframe}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flex: 1, flexWrap: 'wrap' }}>
          {entry.steps.map((step, i) => (
            <StepDot key={i} step={step} index={i} />
          ))}
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {entry.final_reason}
              </div>
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
  const { data: symbolsData } = useApi(() => api.isolatedSymbols());
  const { data: profiles } = useApi(() => api.strategyProfiles());

  const [selected, setSelected] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT']);
  const [timeframe, setTimeframe] = useState('1h');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [state, setState] = useState<Record<string, PipelineEntry>>({});
  const [stats, setStats] = useState({ in_progress: 0, accepted: 0, rejected: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const availableSymbols = symbolsData ?? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

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
      }
    } catch { /* network hiccup — ignore */ }
  };

  const launch = async () => {
    if (selected.length === 0) return;
    setRunning(true);
    setLastRun(nowTime());
    setState({});
    setStats({ in_progress: 0, accepted: 0, rejected: 0, total: 0 });
    stopPolling();
    try {
      await api.runPipeline({ symbols: selected, timeframe, profile_id: profileId });
      pollRef.current = setInterval(poll, 500);
    } catch {
      setRunning(false);
    }
  };

  useEffect(() => () => stopPolling(), []);

  const toggleSymbol = (sym: string) => {
    setSelected(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);
  };

  const entries = Object.values(state);
  const allDone = stats.total > 0 && stats.in_progress === 0;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Pipeline Live</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Validation en temps réel des setups SMC/Wyckoff — séquence obligatoire 7 étapes (RSI/MACD jamais déclencheurs)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastRun && <span className="muted" style={{ fontSize: 12 }}>Dernier scan : {lastRun}</span>}
          <button
            className="btn btn-primary"
            onClick={launch}
            disabled={running || selected.length === 0}
            style={{ minWidth: 160, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            {running
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Analyse…</>
              : '▶ Lancer le pipeline'}
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3>Configuration</h3>
          <div className="form-group">
            <label>Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label} — {tf.desc}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Profil stratégie (optionnel)</label>
            <select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Profil par défaut</option>
              {(profiles?.rows as Array<Record<string, unknown>> | undefined)?.map(p => (
                <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <h3>Cryptos à analyser ({selected.length} sélectionnées)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
            {availableSymbols.map(sym => {
              const isOn = selected.includes(sym);
              const entry = state[sym];
              const dot = entry?.final_status === 'accepted' ? '🟢'
                : entry?.final_status === 'rejected' ? '🔴'
                : entry ? '🟡' : null;
              return (
                <button
                  key={sym}
                  onClick={() => toggleSymbol(sym)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: isOn ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                    border: `1px solid ${isOn ? 'var(--accent)' : 'var(--border)'}`,
                    color: isOn ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {dot && <span style={{ marginRight: 4 }}>{dot}</span>}
                  {sym}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setSelected(availableSymbols)}>Tout sélect.</button>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setSelected([])}>Tout désélect.</button>
          </div>
        </div>
      </div>

      {stats.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)' }}>{stats.total}</div>
            <div className="muted" style={{ fontSize: 12 }}>Total</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#f0b429' }}>{stats.in_progress}</div>
            <div className="muted" style={{ fontSize: 12 }}>En cours</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-green)' }}>{stats.accepted}</div>
            <div className="muted" style={{ fontSize: 12 }}>Acceptés</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-red)' }}>{stats.rejected}</div>
            <div className="muted" style={{ fontSize: 12 }}>Rejetés</div>
          </div>
        </div>
      )}

      {allDone && stats.accepted > 0 && (
        <div style={{
          marginBottom: 16, padding: 16, borderRadius: 10,
          background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.3)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-green)', marginBottom: 8 }}>
            ✅ {stats.accepted} signal{stats.accepted > 1 ? 's' : ''} validé{stats.accepted > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {entries.filter(e => e.final_status === 'accepted').map(e => (
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

      {entries.length === 0 && !running && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔬</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Pipeline prêt</div>
          <div className="muted" style={{ maxWidth: 400, margin: '0 auto' }}>
            Sélectionnez vos cryptos et cliquez sur <strong>Lancer le pipeline</strong> pour voir en direct
            comment chaque setup est validé ou rejeté étape par étape.
          </div>
        </div>
      )}

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

      <div style={{ marginTop: 20, padding: 14, borderRadius: 8, background: 'var(--surface2)', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Légende des étapes</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['○', 'var(--text-muted)', 'En attente'],
            ['◉', '#f0b429', 'Analyse en cours'],
            ['✓', 'var(--accent-green)', 'Passé'],
            ['✗', 'var(--accent-red)', 'Échoué (stop)'],
          ].map(([icon, color, label]) => (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: color as string, fontWeight: 700 }}>{icon}</span>
              <span className="muted">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
          Survolez une étape pour voir le détail. Un setup est validé seulement si les 7 étapes passent dans l'ordre. RSI / MACD / EMA : jamais des déclencheurs, sessions et weekend : filtres uniquement.
        </div>
      </div>
    </section>
  );
}
