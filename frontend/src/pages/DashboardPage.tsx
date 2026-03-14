import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, type ServiceStatus, type Trade } from '../services/api';
import { fmtDate, fmtDateTime, fmtTimeSec } from '../utils/dateUtils';

function fmt(n: number, dec = 2) { return n.toFixed(dec); }

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'CLOSED_WIN'  ? 'badge badge-green' :
    status === 'CLOSED_LOSS' ? 'badge badge-red'   :
    status === 'OPEN'        ? 'badge badge-blue'   : 'badge badge-gray';
  return <span className={cls}>{status.replace('CLOSED_', '')}</span>;
}

const SERVICE_STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  running:   { dot: '#22c55e', label: 'En ligne'   },
  scheduled: { dot: '#3b82f6', label: 'Programmé'  },
  idle:      { dot: '#f59e0b', label: 'En attente' },
  stopped:   { dot: '#ef4444', label: 'Arrêté'     },
};

function ServiceRow({ svc }: { svc: ServiceStatus }) {
  const style = SERVICE_STATUS_STYLE[svc.status] ?? SERVICE_STATUS_STYLE.idle;
  return (
    <tr>
      <td style={{ width: 10, padding: '6px 8px' }}>
        <span style={{
          display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
          background: style.dot,
          boxShadow: svc.status === 'running' ? `0 0 6px ${style.dot}` : 'none',
        }} />
      </td>
      <td style={{ padding: '6px 8px', fontWeight: 500, fontSize: 13 }}>
        {svc.name}
      </td>
      <td style={{ padding: '6px 8px' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
          background: svc.status === 'running'   ? 'rgba(34,197,94,.15)'   :
                      svc.status === 'scheduled' ? 'rgba(59,130,246,.15)'  :
                      svc.status === 'idle'      ? 'rgba(245,158,11,.15)'  :
                                                   'rgba(239,68,68,.15)',
          color: style.dot,
        }}>
          {svc.status_label}
        </span>
      </td>
      <td className="muted" style={{ padding: '6px 8px', fontSize: 12 }}>
        {svc.detail}
      </td>
      <td className="muted" style={{ padding: '6px 8px', fontSize: 11, whiteSpace: 'nowrap' }}>
        {svc.last_activity ? `Dernière activité: ${svc.last_activity}` : '—'}
      </td>
      <td className="muted" style={{ padding: '6px 8px', fontSize: 11, whiteSpace: 'nowrap' }}>
        {svc.next_run ? `⏳ ${svc.next_run}` : ''}
      </td>
    </tr>
  );
}

function ServicesPanel() {
  const [data, setData] = useState<{ services: ServiceStatus[]; refreshed_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const res = await api.services();
      setData(res);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 10_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const running   = data?.services.filter(s => s.status === 'running').length ?? 0;
  const scheduled = data?.services.filter(s => s.status === 'scheduled').length ?? 0;
  const stopped   = data?.services.filter(s => s.status === 'stopped').length ?? 0;
  const idle      = data?.services.filter(s => s.status === 'idle').length ?? 0;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flex items-center justify-between mb-16" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Services &amp; tâches en arrière-plan</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {running > 0 && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(34,197,94,.15)', color: '#22c55e', fontWeight: 600 }}>
                {running} en ligne
              </span>
            )}
            {scheduled > 0 && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(59,130,246,.15)', color: '#3b82f6', fontWeight: 600 }}>
                {scheduled} programmé{scheduled > 1 ? 's' : ''}
              </span>
            )}
            {idle > 0 && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontWeight: 600 }}>
                {idle} en attente
              </span>
            )}
            {stopped > 0 && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(239,68,68,.15)', color: '#ef4444', fontWeight: 600 }}>
                {stopped} arrêté{stopped > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>
          {loading ? 'Chargement…' : `Actualisé à ${data ? fmtTimeSec(data.refreshed_at) : '—'} · auto ⟳ 10s`}
        </span>
      </div>

      {loading ? (
        <p className="muted" style={{ fontSize: 13 }}>Chargement des services…</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '4px 8px', width: 20 }}></th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Service</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Statut</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Détails</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Activité</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Prochaine exéc.</th>
            </tr>
          </thead>
          <tbody>
            {(data?.services ?? []).map(svc => (
              <ServiceRow key={svc.id} svc={svc} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { data, loading, error } = useApi(() => api.dashboard());

  if (loading) return <section><h2>Tableau de bord</h2><p className="muted">Chargement…</p></section>;
  if (error)   return <section><h2>Tableau de bord</h2><p className="red">Erreur: {error}</p></section>;
  if (!data)   return null;

  const acceptance = data.total_signals > 0
    ? ((data.accepted_signals / data.total_signals) * 100).toFixed(1)
    : '0';

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Tableau de bord</h2>
        <span className={`badge ${data.mode === 'live' ? 'badge-green' : 'badge-yellow'}`}>
          {data.mode.toUpperCase()} MODE
        </span>
      </div>

      <div className="grid-4 mb-16">
        <div className="card">
          <div className="stat-value blue">{data.total_signals.toLocaleString()}</div>
          <div className="stat-label">Signaux scannés</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {acceptance}% taux d'acceptation
          </div>
        </div>
        <div className="card">
          <div className={`stat-value ${data.win_rate >= 0.5 ? 'green' : 'red'}`}>
            {(data.win_rate * 100).toFixed(1)}%
          </div>
          <div className="stat-label">Win rate</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {data.wins}W / {data.losses}L
          </div>
        </div>
        <div className="card">
          <div className="stat-value">{data.open_positions}</div>
          <div className="stat-label">Positions ouvertes</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {data.open_trades} trades actifs
          </div>
        </div>
        <div className="card">
          <div className={`stat-value ${data.total_pnl >= 0 ? 'green' : 'red'}`}>
            {data.total_pnl >= 0 ? '+' : ''}{fmt(data.total_pnl)} USD
          </div>
          <div className="stat-label">PnL non réalisé</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            sur {data.open_positions} positions
          </div>
        </div>
      </div>

      <ServicesPanel />

      <div className="card">
        <h3>Trades récents</h3>
        {data.recent_trades.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Aucun trade pour l'instant.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Symbole</th><th>Sens</th>
                <th>Entrée</th><th>Stop</th><th>Target</th><th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_trades.map((t: Trade) => (
                <tr key={t.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.timestamp)}</td>
                  <td>{t.symbol}</td>
                  <td className={t.side === 'LONG' ? 'green' : 'red'}>{t.side}</td>
                  <td>{fmt(t.entry)}</td>
                  <td className="red">{fmt(t.stop)}</td>
                  <td className="green">{fmt(t.target)}</td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
