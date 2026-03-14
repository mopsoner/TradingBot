import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { fmtDateTime, fmtSym } from '../utils/dateUtils';

const STATUS_OPTIONS = ['All', 'OPEN', 'CLOSED_WIN', 'CLOSED_LOSS'];

const rr = (entry: number, stop: number, target: number) => {
  const risk   = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return risk > 0 ? (reward / risk).toFixed(1) : '—';
};

export function LiveTradesPage() {
  const [statusFilter, setStatusFilter] = useState('All');
  const params = statusFilter !== 'All' ? `?status=${statusFilter}` : '';
  const { data, loading, error, reload } = useApi(() => api.trades(params), [statusFilter]);

  const trades = (data?.rows as Array<Record<string, unknown>> | undefined) ?? [];
  const open   = trades.filter(t => t.status === 'OPEN').length;
  const wins   = trades.filter(t => t.status === 'CLOSED_WIN').length;
  const losses = trades.filter(t => t.status === 'CLOSED_LOSS').length;

  return (
    <section>
      <h2>Historique des trades</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Tous les trades enregistrés par le scanner (paper et live).
        Pour démarrer une surveillance, utilise la page <strong>Live Cockpit</strong>.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Ouverts',  value: open,          color: 'var(--accent)' },
          { label: 'Gagnants', value: wins,           color: 'var(--accent-green)' },
          { label: 'Perdants', value: losses,         color: 'var(--accent-red)' },
          { label: 'Total',    value: trades.length,  color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ minWidth: 100, textAlign: 'center', padding: '10px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_OPTIONS.map(s => (
          <button key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter(s)}>
            {s === 'All' ? 'Tous' : s.replace('CLOSED_', '')}
          </button>
        ))}
        <button className="btn btn-secondary" onClick={reload} style={{ marginLeft: 'auto' }}>
          ↻ Rafraîchir
        </button>
      </div>

      {loading && <p className="muted">Chargement…</p>}
      {error   && <p style={{ color: 'var(--accent-red)' }}>Erreur : {error}</p>}

      {trades.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div className="muted">Aucun trade pour ce filtre.</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Lance une surveillance depuis <strong>Live Cockpit</strong> pour générer des signaux paper.
          </div>
        </div>
      )}

      {trades.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbole</th>
                <th>Direction</th>
                <th>Entrée</th>
                <th>Stop</th>
                <th>Cible</th>
                <th>R:R</th>
                <th>Mode</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={String(t.id)}>
                  <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                    {fmtDateTime(String(t.timestamp))}
                  </td>
                  <td><strong>{fmtSym(String(t.symbol))}</strong></td>
                  <td>
                    <span style={{
                      fontWeight: 700, fontSize: 12,
                      color: t.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}>
                      {String(t.side)}
                    </span>
                  </td>
                  <td>{Number(t.entry).toFixed(4)}</td>
                  <td style={{ color: 'var(--accent-red)' }}>{Number(t.stop).toFixed(4)}</td>
                  <td style={{ color: 'var(--accent-green)' }}>{Number(t.target).toFixed(4)}</td>
                  <td className="muted">{rr(Number(t.entry), Number(t.stop), Number(t.target))}</td>
                  <td><span className="tag">{String(t.mode)}</span></td>
                  <td>
                    <span className={`badge ${
                      t.status === 'CLOSED_WIN'  ? 'badge-green' :
                      t.status === 'CLOSED_LOSS' ? 'badge-red'   :
                      t.status === 'OPEN'        ? 'badge-blue'  : 'badge-gray'
                    }`}>
                      {String(t.status).replace('CLOSED_', '')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
