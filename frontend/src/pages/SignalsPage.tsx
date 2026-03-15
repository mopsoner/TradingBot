import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { PipelineState, Signal } from '../services/api';
import { fmtDateTime, fmtSym } from '../utils/dateUtils';
import { useSortable } from '../hooks/useSortable';
import { PipelineRunDetailModal } from '../components/PipelineRunDetail';

function fmtZonePrice(n: number): string {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toFixed(2);
  if (n >= 1)     return n.toFixed(4);
  return n.toFixed(6);
}

function fmtZone(name: string, low?: number | null, high?: number | null): string {
  if (!name || name === 'N/A') return '—';
  if (low != null && high != null && low > 0) {
    return `${name} [${fmtZonePrice(low)} – ${fmtZonePrice(high)}]`;
  }
  return name;
}

const STEPS = [
  { id: 1, label: 'Liquidité',     desc: 'Zone de liquidité identifiée' },
  { id: 2, label: 'Sweep',         desc: 'Balayage de la liquidité' },
  { id: 3, label: 'Spring/UTAD',   desc: 'Rejet du sweep confirmé' },
  { id: 4, label: 'Displacement',  desc: 'ATR + volume anormal' },
  { id: 5, label: 'BOS',           desc: 'Break of Structure' },
  { id: 6, label: 'Expansion',     desc: 'Expansion vers la liquidité' },
  { id: 7, label: 'Fib 0.618',     desc: 'Retracement Fibonacci' },
];

function stepDotColor(status: string): string {
  if (status === 'passed') return 'var(--accent-green)';
  if (status === 'failed') return 'var(--accent-red)';
  if (status === 'checking') return 'var(--accent)';
  return 'rgba(78,98,128,0.35)';
}

type StepState = 'passed' | 'failed' | 'pending';

function inferStepStates(signal: Signal): StepState[] {
  if (signal.accepted) return Array(7).fill('passed');
  const r = (signal.reject_reason ?? '').toLowerCase();

  // Map reject reason → which step index (0-based) FAILED
  let failedAt = 7; // default: all passed but somehow rejected

  if (r.includes('session') || r.includes('pas de marché') || r.includes('hors session')) {
    failedAt = 0; // failed before step 1
  } else if (r.includes('4h neutre') || r.includes('range') || r.includes('multi-tf') || r.includes('pas de biais')) {
    failedAt = 0;
  } else if (r.includes('pas de zone') || r.includes('liquidité identifiable') || r.includes('aucune zone')) {
    failedAt = 0; // step 1
  } else if (r.includes('sweep') || r.includes('sweep liquidity')) {
    failedAt = 1; // step 2
  } else if (r.includes('wyckoff') || r.includes('spring') || r.includes('utad') || r.includes('aucun événement')) {
    failedAt = 2; // step 3
  } else if (r.includes('htf') || r.includes('multi-tf') || r.includes('1h diverge') || r.includes('conflit')) {
    failedAt = 3; // step 4 (HTF alignment, treated as displacement step)
  } else if (r.includes('displacement') || r.includes('atr')) {
    failedAt = 3; // step 4
  } else if (r.includes('bos') || r.includes('volume')) {
    failedAt = 4; // step 5
  } else if (r.includes('expansion')) {
    failedAt = 5; // step 6
  } else if (r.includes('fib') || r.includes('retracement') || r.includes('5m') || r.includes('refinement')) {
    failedAt = 6; // step 7
  } else if (r.includes('risk')) {
    // Risk rejection happens after all 7 steps — treat as passed all
    return Array(7).fill('passed');
  }

  return Array.from({ length: 7 }, (_, i) =>
    i < failedAt ? 'passed' : i === failedAt ? 'failed' : 'pending'
  );
}

/* ── MiniStepBar ─────────────────────────────────────────────────────────── */
function MiniStepBar({ signal }: { signal: Signal }) {
  const states = inferStepStates(signal);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {states.map((st, i) => (
        <div
          key={i}
          title={`${i + 1}. ${STEPS[i].label}: ${st === 'passed' ? '✓' : st === 'failed' ? '✗' : '—'}`}
          style={{
            width: 10, height: 10, borderRadius: 3,
            background: stepDotColor(st),
            opacity: st === 'pending' ? 0.22 : 1,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function SignalDetailModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const accepted = signal.accepted;
  const stepStates = inferStepStates(signal);

  const dir = (signal as Record<string, unknown>)['direction'] as string | undefined;
  const dirLabel = dir ?? (accepted ? 'LONG' : null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: accepted ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {accepted ? '✅' : '❌'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                Signal #{signal.id} · {signal.symbol}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {fmtDateTime(signal.timestamp)} · {signal.timeframe}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirLabel && (
              <span style={{
                padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                background: dirLabel === 'LONG' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: dirLabel === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {dirLabel}
              </span>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Fields */}
          <div className="section-title">Paramètres du signal</div>
          <div className="field-grid" style={{ marginBottom: 24 }}>
            <div className="field-group">
              <div className="field-label">Setup</div>
              <div className="field-value">{signal.setup_type || '—'}</div>
            </div>
            <div className="field-group">
              <div className="field-label">Statut</div>
              <div className="field-value">
                <span className={`badge ${accepted ? 'badge-green' : 'badge-red'}`}>
                  {accepted ? 'Accepté' : 'Rejeté'}
                </span>
              </div>
            </div>
            <div className="field-group">
              <div className="field-label">Zone de liquidité</div>
              <div className="field-value">
                {fmtZone(signal.liquidity_zone, signal.zone_low, signal.zone_high)}
              </div>
            </div>
            <div className="field-group">
              <div className="field-label">Niveau Sweep</div>
              <div className="field-value">
                {signal.sweep_level > 0 ? signal.sweep_level.toFixed(4) : '—'}
              </div>
            </div>
            <div className="field-group">
              <div className="field-label">Niveau BOS</div>
              <div className="field-value">
                {signal.bos_level > 0 ? signal.bos_level.toFixed(2) : '—'}
              </div>
            </div>
            <div className="field-group">
              <div className="field-label">Zone Fibonacci</div>
              <div className="field-value">
                {signal.fib_zone && signal.fib_zone !== 'N/A' ? signal.fib_zone : '—'}
              </div>
            </div>
          </div>

          {/* 7-step sequence */}
          <div className="section-title">Séquence SMC / Wyckoff</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {STEPS.map((step, i) => {
              const st = stepStates[i];
              const passed = st === 'passed';
              const failed = st === 'failed';
              const bgColor = passed ? 'rgba(34,197,94,0.08)' : failed ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.02)';
              const borderColor = passed ? 'rgba(34,197,94,0.25)' : failed ? 'rgba(239,68,68,0.25)' : 'var(--border)';
              const iconBg = passed ? 'var(--accent-green)' : failed ? 'var(--accent-red)' : 'rgba(255,255,255,0.06)';
              const labelColor = passed ? 'var(--accent-green)' : failed ? 'var(--accent-red)' : 'var(--text-muted)';
              return (
                <div key={step.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: bgColor, border: `1px solid ${borderColor}`,
                  opacity: st === 'pending' ? 0.45 : 1,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    background: iconBg,
                    color: (passed || failed) ? '#fff' : 'var(--text-muted)',
                  }}>
                    {passed ? '✓' : failed ? '✗' : step.id}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: labelColor, lineHeight: 1.2 }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

const FILTER_OPTIONS = [
  { id: 'all',      label: 'Tous' },
  { id: 'accepted', label: 'Acceptés' },
  { id: 'rejected', label: 'Rejetés' },
] as const;

type ModeFilter = 'all' | 'backtest' | 'scanner';

export function SignalsPage() {
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [selected, setSelected] = useState<Signal | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineState | null>(null);
  const pollRef = useRef<number | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  const params = (() => {
    const parts: string[] = [];
    if (filter === 'accepted') parts.push('accepted=true');
    if (filter === 'rejected') parts.push('accepted=false');
    if (modeFilter !== 'all') parts.push(`mode=${modeFilter}`);
    if (symbolFilter) parts.push(`symbol=${encodeURIComponent(symbolFilter)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  })();

  const { data, loading, error } = useApi(() => api.signals(params), [filter, modeFilter, symbolFilter]);
  const { sorted: sortedRows, Th } = useSortable<Signal>(data?.rows ?? [], 'timestamp', 'desc');

  useEffect(() => {
    const fetchPipeline = () => {
      api.getPipeline().then(setPipelineData).catch(() => {});
    };
    fetchPipeline();
    pollRef.current = window.setInterval(fetchPipeline, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const activePipeline = pipelineData
    ? Object.entries(pipelineData.pipeline).filter(([, e]) => e.final_status === null)
    : [];
  const completedAccepted = pipelineData
    ? Object.entries(pipelineData.pipeline).filter(([, e]) => e.final_status === 'accepted')
    : [];

  return (
    <section>
      {selected && <SignalDetailModal signal={selected} onClose={() => setSelected(null)} />}
      {detailRunId && <PipelineRunDetailModal runId={detailRunId} onClose={() => setDetailRunId(null)} />}

      {/* ── Page header ───────────────────────────────────── */}
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Signals</h2>
          <p className="page-description">Historique des setups SMC/Wyckoff détectés</p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 10, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: filter === opt.id ? 'var(--accent)' : 'transparent',
                color: filter === opt.id ? '#fff' : 'var(--text-muted)',
                border: 'none',
              }}
            >
              {opt.label}
              {data && opt.id === 'all' && (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>
                  {data.total}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtres mode + crypto ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Mode filter */}
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
          {([
            ['all',      'Tous les modes'],
            ['backtest', '📊 Backtest'],
            ['scanner',  '🔍 Scanner'],
          ] as [ModeFilter, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setModeFilter(id)}
              style={{
                padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: modeFilter === id ? 'var(--surface3, #1c2128)' : 'transparent',
                color: modeFilter === id ? 'var(--text)' : 'var(--text-muted)',
                border: modeFilter === id ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Symbol filter */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 9, fontSize: 12, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔎</span>
          <select
            value={symbolFilter}
            onChange={e => setSymbolFilter(e.target.value)}
            style={{
              paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${symbolFilter ? 'var(--accent)' : 'var(--border)'}`,
              background: symbolFilter ? 'rgba(59,130,246,0.08)' : 'var(--surface2)',
              color: symbolFilter ? 'var(--accent)' : 'var(--text)',
              cursor: 'pointer', minWidth: 140,
            }}
          >
            <option value="">— Toutes cryptos —</option>
            {[...new Set(data?.rows.map(r => r.symbol) ?? [])].sort().map(sym => (
              <option key={sym} value={sym}>{fmtSym(sym)}</option>
            ))}
          </select>
        </div>

        {/* Reset chip */}
        {(modeFilter !== 'all' || symbolFilter) && (
          <button
            onClick={() => { setModeFilter('all'); setSymbolFilter(''); }}
            style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* ── Pipeline actif ────────────────────────────────── */}
      {pipelineData && pipelineData.total > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: activePipeline.length > 0 || completedAccepted.length > 0 ? 10 : 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Scanner
            </span>
            {activePipeline.length > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 700,
                background: 'rgba(59,130,246,0.15)', color: 'var(--accent)',
                border: '1px solid rgba(59,130,246,0.25)',
                animation: 'pulse-sig 1.5s infinite',
              }}>
                ⟳ {activePipeline.length} en cours
              </span>
            )}
            {completedAccepted.length > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 700,
                background: 'rgba(34,197,94,0.12)', color: 'var(--accent-green)',
              }}>
                ✅ {completedAccepted.length} accepté{completedAccepted.length > 1 ? 's' : ''} ce cycle
              </span>
            )}
            {pipelineData.rejected > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10,
                background: 'rgba(78,98,128,0.1)', color: 'var(--text-muted)',
              }}>
                {pipelineData.rejected} rejeté{pipelineData.rejected > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Active pipeline symbols with mini step bars */}
          {(activePipeline.length > 0 || completedAccepted.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...activePipeline, ...completedAccepted].map(([sym, entry]) => {
                const isActive = entry.final_status === null;
                const activeIdx = entry.steps.findIndex(s => s.status === 'checking');
                const passedCount = entry.steps.filter(s => s.status === 'passed').length;
                return (
                  <div key={sym} style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: isActive ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)',
                    border: `1px solid ${isActive ? 'rgba(59,130,246,0.2)' : 'rgba(34,197,94,0.2)'}`,
                    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 800 }}>{fmtSym(sym)}</span>
                      {entry.final_direction && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5,
                          background: entry.final_direction === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                          color: entry.final_direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}>{entry.final_direction}</span>
                      )}
                      {isActive && (
                        <span style={{ fontSize: 9, color: 'var(--accent)' }}>
                          {activeIdx >= 0 ? activeIdx + 1 : passedCount + 1}/7
                        </span>
                      )}
                    </div>
                    {/* Mini step bar */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {entry.steps.map((step, i) => (
                        <div key={i} title={`${i + 1}. ${STEPS[i]?.label ?? ''}: ${step.status}`} style={{
                          width: 10, height: 10, borderRadius: 3,
                          background: stepDotColor(step.status),
                          opacity: step.status === 'pending' ? 0.25 : 1,
                          animation: step.status === 'checking' ? 'pulse-sig 1s infinite' : 'none',
                          flexShrink: 0,
                        }} />
                      ))}
                    </div>
                    {entry.tf_4h_structure && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{entry.tf_4h_structure}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
          <p className="muted">Chargement…</p>
        </div>
      )}
      {error && (
        <div className="card" style={{ padding: '20px' }}>
          <p className="red">Erreur : {error}</p>
        </div>
      )}

      {data && (
        <>
          {data.total === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">📡</div>
                <div className="empty-state-title">Aucun signal trouvé</div>
                <div className="empty-state-desc">
                  Lance un scan depuis le <strong>Data Manager</strong> ou le <strong>Market Scanner</strong> pour générer des signaux.
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {data.total.toLocaleString()} signal{data.total !== 1 ? 's' : ''}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>· Cliquer sur une ligne pour le détail</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-mid)' }}>
                      <Th col="timestamp" style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap' }}>Date</Th>
                      <Th col="symbol"    style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Symbole</Th>
                      <Th col="timeframe" style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>TF</Th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Zone [range]</th>
                      <Th col="sweep_level" style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Sweep</Th>
                      <Th col="bos_level"   style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>BOS</Th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Fib</th>
                      <Th col="accepted"    style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Statut</Th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Steps</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Raison rejet</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(s => {
                      const pEntry = pipelineData?.pipeline[s.symbol];
                      const pActive = pEntry && pEntry.final_status === null;
                      const pAccepted = pEntry && pEntry.final_status === 'accepted';
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelected(s)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {fmtDateTime(s.timestamp)}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>{fmtSym(s.symbol)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span className="tag" style={{ fontSize: 11 }}>{s.timeframe}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{fmtZone(s.liquidity_zone, s.zone_low, s.zone_high)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{s.sweep_level > 0 ? s.sweep_level.toFixed(4) : '—'}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{s.bos_level > 0 ? s.bos_level.toFixed(4) : '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-soft)' }}>{s.fib_zone && s.fib_zone !== 'N/A' ? s.fib_zone : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span className={`badge ${s.accepted ? 'badge-green' : 'badge-gray'}`}>
                              {s.accepted ? 'Accepté' : 'Rejeté'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <MiniStepBar signal={s} />
                          </td>
                          <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                            {!s.accepted && s.reject_reason ? (
                              <span
                                title={s.reject_reason}
                                style={{
                                  fontSize: 11,
                                  display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 190, cursor: 'help',
                                  padding: '2px 6px', borderRadius: 4,
                                  background: 'rgba(248,81,73,0.07)',
                                  border: '1px solid rgba(248,81,73,0.18)',
                                  color: 'var(--accent-red)',
                                }}
                              >
                                {s.reject_reason}
                              </span>
                            ) : s.accepted ? (
                              <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>—</span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }} onClick={e => {
                            if (s.pipeline_run_id) { e.stopPropagation(); setDetailRunId(s.pipeline_run_id); }
                          }}>
                            {s.pipeline_run_id ? (
                              <span
                                style={{
                                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                                  color: 'var(--accent)', cursor: 'pointer',
                                  padding: '2px 8px', borderRadius: 5,
                                  background: 'rgba(59,130,246,0.1)',
                                  border: '1px solid rgba(59,130,246,0.2)',
                                }}
                                title="Voir le run pipeline"
                              >
                                #{s.pipeline_run_id.slice(0, 4)}
                              </span>
                            ) : pActive ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: 'var(--accent)', animation: 'pulse-sig 1.2s infinite',
                                }} />
                                <span style={{ fontSize: 10, color: 'var(--accent)' }}>
                                  En cours
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes pulse-sig {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </section>
  );
}
