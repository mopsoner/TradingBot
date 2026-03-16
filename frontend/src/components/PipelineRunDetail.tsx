import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { PipelineRunRecord, Signal } from '../services/api';
import { fmtDateTime, fmtSym } from '../utils/dateUtils';

const STEP_LABELS = ['Liquidité', 'Sweep', 'Spring/UTAD', 'Displacement', 'BOS', 'Expansion', 'Fib Retracement'];

function stepColor(status: string): string {
  if (status === 'passed') return 'var(--accent-green)';
  if (status === 'failed') return 'var(--accent-red)';
  if (status === 'checking') return 'var(--accent)';
  return 'rgba(78,98,128,0.35)';
}

type StepData = { name: string; status: string; detail?: string };
type SymbolResult = { final_status: string; final_direction: string | null; final_reason: string | null; steps: StepData[]; tf_4h_structure?: string | null; tf_1h_validation?: string | null };

export function PipelineRunDetailModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [run, setRun] = useState<PipelineRunRecord | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [results, setResults] = useState<Record<string, { final_status: string; final_direction: string | null; final_reason: string | null; steps: StepData[] }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    api.pipelineRun(runId).then(data => {
      setRun(data.run);
      setSignals(data.signals);
      try {
        setResults(JSON.parse(data.run.results_json));
      } catch {
        setResults({});
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 700, textAlign: 'center', padding: 40 }} onClick={e => e.stopPropagation()}>
          <p className="muted">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 700, textAlign: 'center', padding: 40 }} onClick={e => e.stopPropagation()}>
          <p className="red">Run introuvable</p>
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    );
  }

  const symbols: string[] = (() => {
    try { return JSON.parse(run.symbols_json); } catch { return []; }
  })();

  const isComplete = run.completed_at !== null;
  const duration = isComplete && run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 750 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: isComplete ? 'rgba(63,185,80,0.12)' : 'rgba(59,130,246,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>
              {isComplete ? '✅' : '⟳'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Pipeline Run</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 13 }}>#{run.run_id.slice(0, 4)}</span>
                <span className="tag" style={{ fontSize: 10 }}>{run.timeframe}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {fmtDateTime(run.started_at)}
                {duration !== null && ` · ${duration}s`}
                {' · '}{run.mode} · {run.source}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: run.total_count, color: 'var(--accent)' },
              { label: 'Acceptés', value: run.accepted_count, color: 'var(--accent-green)' },
              { label: 'Rejetés', value: run.rejected_count, color: 'var(--accent-red)' },
              { label: 'Erreurs', value: run.error_count, color: '#f0b429' },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, minWidth: 80, textAlign: 'center', padding: '10px 8px',
                borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="section-title">Résultats par symbole</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {symbols.map(sym => {
              const r = results[sym];
              if (!r) return (
                <div key={sym} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtSym(sym)}</span>
                  <span className="muted" style={{ fontSize: 11 }}>Pas de données</span>
                </div>
              );

              const isAccepted = r.final_status === 'accepted';
              const isRejected = r.final_status === 'rejected';

              return (
                <div key={sym} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: isAccepted ? 'rgba(63,185,80,0.06)' : isRejected ? 'rgba(248,81,73,0.04)' : 'var(--surface2)',
                  border: `1px solid ${isAccepted ? 'rgba(63,185,80,0.3)' : isRejected ? 'rgba(248,81,73,0.2)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 90 }}>{fmtSym(sym)}</span>
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      {(r.steps || []).map((step: StepData, i: number) => (
                        <div key={i} title={`${STEP_LABELS[i] ?? ''}: ${step.status}${step.detail ? ' — ' + step.detail : ''}`} style={{
                          width: 20, height: 20, borderRadius: 5,
                          background: stepColor(step.status),
                          opacity: step.status === 'pending' ? 0.2 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#fff', fontWeight: 700,
                        }}>
                          {step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : ''}
                        </div>
                      ))}
                    </div>
                    <div style={{ minWidth: 120, textAlign: 'right' }}>
                      {isAccepted && (
                        <span style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                          background: r.final_direction === 'LONG' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: r.final_direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}>
                          {r.final_direction}
                        </span>
                      )}
                      {isRejected && (
                        <span style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 600 }}>
                          Rejeté
                        </span>
                      )}
                    </div>
                  </div>
                  {((r as SymbolResult).tf_4h_structure || (r as SymbolResult).tf_1h_validation) && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(r as SymbolResult).tf_4h_structure && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--accent)' }}>4H:</strong> {(r as SymbolResult).tf_4h_structure}
                        </span>
                      )}
                      {(r as SymbolResult).tf_1h_validation && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--accent)' }}>1H:</strong> {(r as SymbolResult).tf_1h_validation}
                        </span>
                      )}
                    </div>
                  )}
                  {isRejected && r.final_reason && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                      {r.final_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {signals.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 20 }}>Signaux liés ({signals.length})</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-mid)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>SYMBOLE</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>TF</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>SETUP</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>STATUT</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>DIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map(sig => (
                      <tr key={sig.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>{fmtSym(sig.symbol)}</td>
                        <td style={{ padding: '6px 10px' }}><span className="tag" style={{ fontSize: 10 }}>{sig.timeframe}</span></td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-soft)' }}>{sig.setup_type || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span className={`badge ${sig.accepted ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                            {sig.accepted ? 'Accepté' : 'Rejeté'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {sig.direction ? (
                            <span style={{
                              fontSize: 10, fontWeight: 800,
                              color: sig.direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}>{sig.direction}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
