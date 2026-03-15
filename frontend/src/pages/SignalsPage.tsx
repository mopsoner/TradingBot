import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { Signal } from '../services/api';
import { fmtDate, fmtDateTime } from '../utils/dateUtils';
import { useSortable } from '../hooks/useSortable';

const STEPS = [
  { id: 1, label: 'Liquidité',     desc: 'Zone de liquidité identifiée' },
  { id: 2, label: 'Sweep',         desc: 'Balayage de la liquidité' },
  { id: 3, label: 'Spring/UTAD',   desc: 'Rejet du sweep confirmé' },
  { id: 4, label: 'Displacement',  desc: 'ATR + volume anormal' },
  { id: 5, label: 'BOS',           desc: 'Break of Structure' },
  { id: 6, label: 'Expansion',     desc: 'Expansion vers la liquidité' },
  { id: 7, label: 'Fib 0.618',     desc: 'Retracement Fibonacci' },
];

function SignalDetailModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const accepted = signal.accepted;
  const passedCount = accepted ? 7 : 4;

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
              <div className="field-value">{signal.liquidity_zone || '—'}</div>
            </div>
            <div className="field-group">
              <div className="field-label">Niveau Sweep</div>
              <div className="field-value">{signal.sweep_level.toFixed(4)}</div>
            </div>
            <div className="field-group">
              <div className="field-label">Niveau BOS</div>
              <div className="field-value">{signal.bos_level.toFixed(4)}</div>
            </div>
            <div className="field-group">
              <div className="field-label">Zone Fibonacci</div>
              <div className="field-value">{signal.fib_zone || '—'}</div>
            </div>
          </div>

          {/* 7-step sequence */}
          <div className="section-title">Séquence SMC / Wyckoff</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {STEPS.map((step, i) => {
              const passed = i < passedCount;
              return (
                <div key={step.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: passed ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${passed ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    background: passed ? 'var(--accent-green)' : 'rgba(255,255,255,0.06)',
                    color: passed ? '#fff' : 'var(--text-muted)',
                  }}>
                    {passed ? '✓' : step.id}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: passed ? 'var(--accent-green)' : 'var(--text-soft)', lineHeight: 1.2 }}>
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

export function SignalsPage() {
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [selected, setSelected] = useState<Signal | null>(null);

  const params =
    filter === 'accepted' ? '?accepted=true' :
    filter === 'rejected' ? '?accepted=false' : '';

  const { data, loading, error } = useApi(() => api.signals(params), [filter]);
  const { sorted: sortedRows, Th } = useSortable<Signal>(data?.rows ?? [], 'timestamp', 'desc');

  return (
    <section>
      {selected && <SignalDetailModal signal={selected} onClose={() => setSelected(null)} />}

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
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Setup</th>
                      <Th col="sweep_level" style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Sweep</Th>
                      <Th col="bos_level"   style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>BOS</Th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Fib</th>
                      <Th col="accepted"    style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', textAlign: 'left' }}>Statut</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(s => (
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
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>{s.symbol}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="tag" style={{ fontSize: 11 }}>{s.timeframe}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-soft)' }}>{s.setup_type || '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{s.sweep_level.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{s.bos_level.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-soft)' }}>{s.fib_zone || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className={`badge ${s.accepted ? 'badge-green' : 'badge-gray'}`}>
                            {s.accepted ? 'Accepté' : 'Rejeté'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
