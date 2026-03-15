import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, type ServiceStatus, type Trade } from '../services/api';
import { fmtDate, fmtDateTime, fmtTimeSec } from '../utils/dateUtils';

function fmt(n: number, dec = 2) { return n.toFixed(dec); }

const SVC_STYLE: Record<string, { dot: string; pill: string; label: string }> = {
  running:   { dot: '#22c55e', pill: 'pill-green',  label: 'En ligne'   },
  scheduled: { dot: '#3b82f6', pill: 'pill-blue',   label: 'Programmé'  },
  idle:      { dot: '#eab308', pill: 'pill-yellow',  label: 'En attente' },
  stopped:   { dot: '#ef4444', pill: 'pill-red',    label: 'Arrêté'     },
};

function ServiceCard({ svc }: { svc: ServiceStatus }) {
  const s = SVC_STYLE[svc.status] ?? SVC_STYLE.idle;
  return (
    <div className="service-row">
      <span
        className="service-dot"
        style={{
          background: s.dot,
          boxShadow: svc.status === 'running' ? `0 0 7px ${s.dot}` : 'none',
          animation: svc.status === 'running' ? 'pulse 2s infinite' : 'none',
        }}
      />
      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{svc.name}</span>
      <span className={`pill ${s.pill}`}>{svc.status_label}</span>
      {svc.detail && (
        <span className="muted" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {svc.detail}
        </span>
      )}
      {svc.next_run && (
        <span className="pill" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>⏳ {svc.next_run}</span>
      )}
    </div>
  );
}

function ServicesPanel() {
  const [data, setData] = useState<{ services: ServiceStatus[]; refreshed_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try { setData(await api.services()); } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 10_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const counts = {
    running:   data?.services.filter(s => s.status === 'running').length   ?? 0,
    scheduled: data?.services.filter(s => s.status === 'scheduled').length ?? 0,
    idle:      data?.services.filter(s => s.status === 'idle').length       ?? 0,
    stopped:   data?.services.filter(s => s.status === 'stopped').length   ?? 0,
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Services back-end</h3>
          <div style={{ display: 'flex', gap: 5 }}>
            {counts.running   > 0 && <span className="pill pill-green">{counts.running} en ligne</span>}
            {counts.scheduled > 0 && <span className="pill pill-blue">{counts.scheduled} programmé{counts.scheduled > 1 ? 's' : ''}</span>}
            {counts.idle      > 0 && <span className="pill pill-yellow">{counts.idle} en attente</span>}
            {counts.stopped   > 0 && <span className="pill pill-red">{counts.stopped} arrêté{counts.stopped > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>
          {loading ? 'Chargement…' : `${data ? fmtTimeSec(data.refreshed_at) : '—'} · ⟳ 10s`}
        </span>
      </div>

      {loading ? (
        <p className="muted" style={{ fontSize: 13, padding: '12px 0' }}>Chargement des services…</p>
      ) : (data?.services ?? []).length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>Aucun service détecté.</p>
      ) : (
        <div>
          {(data?.services ?? []).map(svc => <ServiceCard key={svc.id} svc={svc} />)}
        </div>
      )}
    </div>
  );
}

function TradeRow({ t }: { t: Trade }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {fmtDateTime(t.timestamp)}
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13 }}>{t.symbol}</td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 9px', borderRadius: 6,
          fontSize: 11, fontWeight: 800,
          background: t.side === 'LONG' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
          color: t.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
        }}>
          {t.side}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>{fmt(t.entry)}</td>
      <td style={{ padding: '10px 12px', color: 'var(--accent-red)', fontWeight: 600, fontSize: 13 }}>{fmt(t.stop)}</td>
      <td style={{ padding: '10px 12px', color: 'var(--accent-green)', fontWeight: 600, fontSize: 13 }}>{fmt(t.target)}</td>
      <td style={{ padding: '10px 12px' }}>
        <span className={`badge ${t.status === 'CLOSED_WIN' ? 'badge-green' : t.status === 'CLOSED_LOSS' ? 'badge-red' : t.status === 'OPEN' ? 'badge-blue' : 'badge-gray'}`}>
          {t.status.replace('CLOSED_', '')}
        </span>
      </td>
    </tr>
  );
}

export function DashboardPage() {
  const { data, loading, error } = useApi(() => api.dashboard());

  if (loading) return (
    <section>
      <div className="page-header-row">
        <div><h2>Tableau de bord</h2></div>
      </div>
      <div className="card"><p className="muted" style={{ padding: '24px 0' }}>Chargement…</p></div>
    </section>
  );
  if (error) return (
    <section>
      <div className="page-header-row"><div><h2>Tableau de bord</h2></div></div>
      <div className="card"><p className="red" style={{ padding: '16px 0' }}>Erreur: {error}</p></div>
    </section>
  );
  if (!data) return null;

  const acceptance = data.total_signals > 0
    ? ((data.accepted_signals / data.total_signals) * 100).toFixed(1)
    : '0';

  const winColor  = data.win_rate >= 0.5 ? 'var(--accent-green)' : 'var(--accent-red)';
  const pnlColor  = data.total_pnl >= 0   ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <section>
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Tableau de bord</h2>
          <p className="page-description">Vue en temps réel de votre activité de trading</p>
        </div>
        <span className={`badge ${data.mode === 'live' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: 12, padding: '5px 14px' }}>
          {data.mode.toUpperCase()} MODE
        </span>
      </div>

      {/* ── KPI CARDS ──────────────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card stat-card-accent-blue">
          <div className="stat-num" style={{ color: 'var(--accent)' }}>
            {data.total_signals.toLocaleString()}
          </div>
          <div className="stat-lbl">Signaux scannés</div>
          <div className="stat-sub">
            <span style={{ color: 'var(--accent)' }}>{acceptance}%</span>
            taux d'acceptation
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: `3px solid ${winColor}` }}>
          <div className="stat-num" style={{ color: winColor }}>
            {(data.win_rate * 100).toFixed(1)}%
          </div>
          <div className="stat-lbl">Win rate</div>
          <div className="stat-sub">
            <span style={{ color: 'var(--accent-green)' }}>{data.wins}W</span>
            &nbsp;/&nbsp;
            <span style={{ color: 'var(--accent-red)' }}>{data.losses}L</span>
          </div>
        </div>

        <div className="stat-card stat-card-accent-yellow">
          <div className="stat-num" style={{ color: 'var(--accent-yellow)' }}>
            {data.open_positions}
          </div>
          <div className="stat-lbl">Positions ouvertes</div>
          <div className="stat-sub">
            {data.open_trades} trade{data.open_trades !== 1 ? 's' : ''} actif{data.open_trades !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: `3px solid ${pnlColor}` }}>
          <div className="stat-num" style={{ color: pnlColor, fontSize: 26 }}>
            {data.total_pnl >= 0 ? '+' : ''}{fmt(data.total_pnl)}
          </div>
          <div className="stat-lbl">PnL non réalisé (USD)</div>
          <div className="stat-sub">sur {data.open_positions} position{data.open_positions !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <ServicesPanel />

      {/* ── RECENT TRADES ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Trades récents</h3>
        </div>
        {data.recent_trades.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Aucun trade pour l'instant</div>
            <div className="empty-state-desc">Les trades apparaîtront ici une fois que le scanner aura détecté des setups.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Symbole', 'Sens', 'Entrée', 'Stop', 'Target', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_trades.map((t: Trade) => <TradeRow key={t.id} t={t} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
