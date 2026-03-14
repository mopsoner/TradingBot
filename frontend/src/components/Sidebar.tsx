import type { AdminPage } from '../types';

const pages: AdminPage[] = [
  'Dashboard',
  'Bot control',
  'Data manager',
  'Live trades',
  'Signals',
  'Positions',
  'Backtests',
  'Market scanner',
  'Risk settings',
  'Strategy settings',
  'System settings',
  'Logs',
];

export function Sidebar({ onSelect, selected }: { onSelect: (page: AdminPage) => void; selected: AdminPage }) {
  return (
    <aside>
      <div className="logo">OpenClaw Pro</div>
      {pages.map((page) => (
        <button key={page} onClick={() => onSelect(page)} className={selected === page ? 'active' : ''}>{page}</button>
      ))}
    </aside>
  );
}
