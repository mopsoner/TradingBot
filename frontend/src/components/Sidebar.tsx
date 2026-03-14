import { useState, useEffect } from 'react';
import type { AdminPage } from '../types';

type NavItem = { page: AdminPage; icon: string; label: string };

const NAV: NavItem[] = [
  { page: 'Tableau de bord',   icon: '📊', label: 'Tableau de bord' },
  { page: 'Données de marché', icon: '📥', label: 'Données de marché' },
  { page: 'Stratégie',         icon: '⚙️',  label: 'Stratégie' },
  { page: 'Backtests',         icon: '🔬', label: 'Backtests' },
  { page: 'Workshop IA',       icon: '🤖', label: 'Workshop IA' },
  { page: 'Pipeline Live',     icon: '🔴', label: 'Pipeline Live' },
  { page: 'Signaux',           icon: '📡', label: 'Signaux' },
  { page: 'Trades',            icon: '💼', label: 'Trades' },
  { page: 'Positions',         icon: '📈', label: 'Positions' },
  { page: 'Journal Setups',    icon: '📓', label: 'Journal Setups' },
  { page: 'Journaux',          icon: '📋', label: 'Journaux' },
  { page: 'Paramètres',        icon: '🔧', label: 'Paramètres' },
];

const SECTIONS = [
  { title: 'Analyse',  items: ['Tableau de bord', 'Pipeline Live', 'Signaux', 'Trades', 'Positions', 'Journal Setups'] },
  { title: 'Workflow', items: ['Données de marché', 'Stratégie', 'Backtests', 'Workshop IA'] },
  { title: 'Système',  items: ['Journaux', 'Paramètres'] },
] as const;

export function Sidebar({ onSelect, selected }: { onSelect: (page: AdminPage) => void; selected: AdminPage }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  }, [open]);

  const handleSelect = (page: AdminPage) => {
    onSelect(page);
    setOpen(false);
  };

  const navContent = (
    <>
      <div className="logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>OpenClaw Pro</span>
        <button
          className="hamburger-close"
          onClick={() => setOpen(false)}
          style={{
            display: 'none',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--text-muted)', padding: '4px 8px',
          }}
          aria-label="Fermer le menu"
        >
          ✕
        </button>
      </div>
      {SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 8 }}>
          <div style={{
            padding: '6px 16px 2px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            opacity: 0.6,
          }}>
            {section.title}
          </div>
          {section.items.map(pageName => {
            const item = NAV.find(n => n.page === pageName)!;
            return (
              <button
                key={item.page}
                onClick={() => handleSelect(item.page)}
                className={selected === item.page ? 'active' : ''}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* ── Mobile hamburger button ─────────────────────────────────── */}
      <button
        className="hamburger-btn"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        style={{
          display: 'none',
          position: 'fixed', top: 12, left: 12, zIndex: 1100,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px',
          cursor: 'pointer', fontSize: 18,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        ☰
      </button>

      {/* ── Mobile overlay ──────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1050,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={open ? 'sidebar-mobile-open' : ''}>
        {navContent}
      </aside>

      {/* ── Mobile inline styles (injected once) ────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .hamburger-btn { display: block !important; }
          aside {
            position: fixed !important;
            top: 0; left: 0; bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 1060;
            box-shadow: 4px 0 24px rgba(0,0,0,0.4);
          }
          aside.sidebar-mobile-open {
            transform: translateX(0);
          }
          main {
            margin-left: 0 !important;
            padding-top: 56px !important;
          }
          .hamburger-close { display: flex !important; }
        }
      `}</style>
    </>
  );
}
