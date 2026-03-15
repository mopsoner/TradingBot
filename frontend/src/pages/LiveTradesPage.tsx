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
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Historique des trades</h2>
          <p className="page-description">
            Tous les trades paper et live · Surveillances depuis <strong>Live Cockpit</strong>
          </p>
        </div>
        <button className="btn btn-secondary" onClick={reload} style={{ fontSize: 12 }}>
          ↺ Rafraîchir
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="stat-card stat-card-accent-blue">
          <div className="stat-num" style={{ color: 'var(--accent)' }}>{open}</div>
          <div className="stat-lbl">Ouverts</div>
        </div>
        <div className="stat-card stat-card-accent-green">
          <div className="stat-num" style={{ color: 'var(--accent-green)' }}>{wins}</div>
          <div className="stat-lbl">Gagnants</div>
        </div>
        <div className="stat-card stat-card-accent-red">
          <div className="stat-num" style={{ color: 'var(--accent-red)' }}>{losses}</div>
          <div className="stat-lbl">Perdants</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--border-strong)' }}>
          <div className="stat-num" style={{ color: 'var(--text-soft)' }}>{trades.length}</div>
          <div className="stat-lbl">Total</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 10, padding: 3, gap: 2, border: '1px solid var(--border)', width: 'fit-content', marginBottom: 16 }}>
        {STATUS_OPTIONS.map(s => (
          <button key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: statusFilter === s ? 'var(--accent)' : 'transparent',
              color: statusFilter === s ? '#fff' : 'var(--text-muted)',
              border: 'none',
            }}>
            {s === 'All' ? 'Tous' : s.replace('CLOSED_', '')}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Chargement…</p>}
      {error   && <p style={{ color: 'var(--accent-red)' }}>Erreur : {error}</p>}

      {trades.length === 0 && !loading && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">Aucun trade pour ce filtre</div>
            <div className="empty-state-desc">Lance une surveillance depuis <strong>Live Cockpit</strong> pour générer des signaux paper.</div>
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
