import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { Signal } from '../services/api';
import { fmtDate, fmtDateTime } from '../utils/dateUtils';
import { useSortable } from '../hooks/useSortable';

function SignalDetailModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const fields: [string, unknown][] = [
    ['ID', signal.id],
    ['Date', fmtDateTime(signal.timestamp)],
    ['Symbole', signal.symbol],
    ['Timeframe', signal.timeframe],
    ['Setup type', signal.setup_type],
    ['Zone de liquidité', signal.liquidity_zone],
    ['Niveau sweep', signal.sweep_level],
    ['Niveau BOS', signal.bos_level],
    ['Zone Fibonacci', signal.fib_zone],
    ['Statut', signal.accepted ? '✅ Accepté' : '❌ Rejeté'],
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #1a1f2e)', border: '1px solid var(--border, #2a2f45)',
          borderRadius: 12, padding: 32, minWidth: 420, maxWidth: 560,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Rapport signal #{signal.id}</h3>
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 12px', fontSize: 13 }}
            onClick={onClose}
          >
            ✕ Fermer
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          {fields.map(([label, value]) => (
            <div key={String(label)}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.5, marginBottom: 2 }}>{String(label)}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{String(value)}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border, #2a2f45)' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.5, marginBottom: 8 }}>Séquence SMC/Wyckoff</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Liquidité', 'Sweep', 'Spring/UTAD', 'Displacement', 'BOS', 'Fib Retrace'].map((step, i) => (
              <span
                key={step}
                className={`badge ${signal.accepted || i < 4 ? 'badge-green' : 'badge-gray'}`}
                style={{ fontSize: 11 }}
              >
                {i + 1}. {step}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Signals</h2>
        <div className="flex gap-8">
          {(['all', 'accepted', 'rejected'] as const).map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Tous' : f === 'accepted' ? 'Acceptés' : 'Rejetés'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Chargement…</p>}
      {error   && <p className="red">Erreur : {error}</p>}

      {data && (
        <>
          <p className="muted mb-16">{data.total.toLocaleString()} signal{data.total !== 1 ? 's' : ''}</p>

          {data.total === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, opacity: 0.6 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
              <p>Aucun signal en base.<br />Lance un scan depuis le <strong>Data manager</strong> ou le <strong>Market Scanner</strong>.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <Th col="timestamp">Date / Heure</Th>
                    <Th col="symbol">Symbole</Th>
                    <Th col="timeframe">TF</Th>
                    <th>Setup</th>
                    <th>Liq. zone</th>
                    <Th col="sweep_level">Sweep</Th>
                    <Th col="bos_level">BOS</Th>
                    <th>Fib</th>
                    <Th col="accepted">Statut</Th>
                    <th>Rapport</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(s => (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(s)}>
                      <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                        {fmtDateTime(s.timestamp)}
                      </td>
                      <td><strong>{s.symbol}</strong></td>
                      <td><span className="tag">{s.timeframe}</span></td>
                      <td>{s.setup_type}</td>
                      <td className="muted" style={{ fontSize: 11 }}>{s.liquidity_zone}</td>
                      <td>{s.sweep_level.toFixed(2)}</td>
                      <td>{s.bos_level.toFixed(2)}</td>
                      <td>{s.fib_zone}</td>
                      <td>
                        <span className={`badge ${s.accepted ? 'badge-green' : 'badge-gray'}`}>
                          {s.accepted ? 'Accepté' : 'Rejeté'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 10px', fontSize: 12 }}
                          onClick={e => { e.stopPropagation(); setSelected(s); }}
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
