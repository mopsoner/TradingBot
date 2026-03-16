import { useState, useEffect, useRef } from 'react';
import type { AdminPage } from '../types';
import { api } from '../services/api';
import type { ProcessStatus } from '../services/api';

type NavItem = { page: AdminPage; icon: JSX.Element; label: string };

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" />
    </Icon>
  ),
  market: (
    <Icon>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </Icon>
  ),
  strategy: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07" />
    </Icon>
  ),
  backtests: (
    <Icon>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Icon>
  ),
  ai: (
    <Icon>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </Icon>
  ),
  pipeline: (
    <Icon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  ),
  signals: (
    <Icon>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.09 3.41 2 2 0 0 1 3.07 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.14a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z" />
    </Icon>
  ),
  trades: (
    <Icon>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </Icon>
  ),
  positions: (
    <Icon>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Icon>
  ),
  journal: (
    <Icon>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Icon>
  ),
  logs: (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
};

const NAV: NavItem[] = [
  { page: 'Tableau de bord',   icon: ICONS.dashboard, label: 'Tableau de bord'  },
  { page: 'Pipeline Live',     icon: ICONS.pipeline,  label: 'Pipeline Live'    },
  { page: 'Signaux',           icon: ICONS.signals,   label: 'Signaux'          },
  { page: 'Trades',            icon: ICONS.trades,    label: 'Trades'           },
  { page: 'Positions',         icon: ICONS.positions, label: 'Positions'        },
  { page: 'Journal Setups',    icon: ICONS.journal,   label: 'Journal Setups'   },
  { page: 'Données de marché', icon: ICONS.market,    label: 'Données'          },
  { page: 'Stratégie',         icon: ICONS.strategy,  label: 'Stratégie'        },
  { page: 'Backtests',         icon: ICONS.backtests, label: 'Backtests'        },
  { page: 'Workshop IA',       icon: ICONS.ai,        label: 'Workshop IA'      },
  { page: 'Journaux',          icon: ICONS.logs,      label: 'Journaux'         },
  { page: 'Paramètres',        icon: ICONS.settings,  label: 'Paramètres'       },
];

const SECTIONS: { title: string; items: AdminPage[] }[] = [
  { title: 'Surveillance', items: ['Tableau de bord', 'Pipeline Live', 'Signaux', 'Trades', 'Positions', 'Journal Setups'] },
  { title: 'Workflow',     items: ['Données de marché', 'Stratégie', 'Backtests', 'Workshop IA'] },
  { title: 'Système',      items: ['Journaux', 'Paramètres'] },
];

function fmtCountdown(secs: number | null): string {
  if (secs === null || secs <= 0) return 'maintenant';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function ProcessWidget() {
  const [processes, setProcesses] = useState<ProcessStatus[]>([]);
  const [totalRunning, setTotalRunning] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    api.systemProcesses().then(d => {
      setProcesses(d.processes);
      setTotalRunning(d.total_running);
      const scanner = d.processes.find(p => p.id === 'scanner');
      setCountdown(scanner?.seconds_to_next ?? null);
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 8000);
    return () => clearInterval(poll);
  }, []);

  // countdown tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 0) ? prev - 1 : prev);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [processes]);

  const running = processes.filter(p => p.status === 'running');
  const scanner = processes.find(p => p.id === 'scanner');
  const backtests = processes.find(p => p.id === 'backtest');
  const pipeline  = processes.find(p => p.id === 'pipeline');

  return (
    <div style={{
      margin: '0 8px 8px',
      padding: '10px 12px',
      borderRadius: 10,
      background: 'rgba(11,17,32,0.85)',
      border: `1px solid ${totalRunning > 0 ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Processus
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
          background: totalRunning > 0 ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)',
          color: totalRunning > 0 ? '#60a5fa' : 'rgba(255,255,255,0.3)',
        }}>
          {totalRunning} actif{totalRunning !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Scanner */}
      {scanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: scanner.status === 'running' ? '#22c55e' : '#4b5563',
            boxShadow: scanner.status === 'running' ? '0 0 6px #22c55e88' : 'none',
          }} />
          <span style={{ fontSize: 11, color: scanner.status === 'running' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scanner.status === 'running'
              ? scanner.detail
              : 'Scanner arrêté'}
          </span>
          {scanner.status === 'running' && countdown !== null && (
            <span style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'monospace', flexShrink: 0 }}>
              {fmtCountdown(countdown)}
            </span>
          )}
        </div>
      )}

      {/* Pipeline live */}
      {pipeline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#3b82f6', boxShadow: '0 0 6px #3b82f688' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pipeline.detail}
          </span>
        </div>
      )}

      {/* Backtests */}
      {backtests && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#a855f7', boxShadow: '0 0 6px #a855f788' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', flex: 1 }}>
            {backtests.detail}
          </span>
        </div>
      )}

      {/* Tout arrêté */}
      {running.length === 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 2 }}>
          Aucun processus actif
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onSelect, selected }: { onSelect: (page: AdminPage) => void; selected: AdminPage }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const handleSelect = (page: AdminPage) => { onSelect(page); setOpen(false); };

  return (
    <>
      {/* ── Mobile topbar ─────────────────────────────────── */}
      <div className="mobile-topbar">
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-mid)',
            borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: 'var(--text)',
            display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>OC</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
            {NAV.find(n => n.page === selected)?.label ?? selected}
          </span>
        </div>
      </div>

      {/* ── Backdrop overlay ─────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1050,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className={open ? 'sidebar-mobile-open' : ''}>
        {/* Logo */}
        <div className="logo">
          <div className="logo-mark">OC</div>
          <div className="logo-text">
            <span className="logo-name">OpenClaw Pro</span>
            <span className="logo-tagline">SMC · Wyckoff · AI</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="sidebar-close-btn"
            aria-label="Fermer"
            style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6,
              display: 'none', fontSize: 18, lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0 4px' }}>
          {SECTIONS.map(section => (
            <div key={section.title} className="nav-section">
              <span className="nav-section-label">{section.title}</span>
              {section.items.map(pageName => {
                const item = NAV.find(n => n.page === pageName)!;
                return (
                  <button
                    key={item.page}
                    onClick={() => handleSelect(item.page)}
                    className={selected === item.page ? 'active' : ''}
                    title={item.label}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Process status widget */}
        <ProcessWidget />

        {/* Bottom mode indicator */}
        <div className="sidebar-bottom">
          <div className="sidebar-mode-badge">
            <span className="mode-dot" />
            <span className="mode-label">Mode actif</span>
            <span className="mode-value">Paper</span>
          </div>
        </div>
      </aside>

      <style>{`
        .mobile-topbar {
          display: none;
          position: fixed; top: 0; left: 0; right: 0; z-index: 1040;
          height: 52px;
          background: rgba(6,9,15,0.94);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--border-mid);
          align-items: center;
          padding: 0 14px;
          gap: 10px;
        }
        @media (max-width: 768px) {
          .mobile-topbar { display: flex !important; }
          .sidebar-close-btn { display: block !important; }
        }
      `}</style>
    </>
  );
}
