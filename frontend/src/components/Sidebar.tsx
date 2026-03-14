import type { AdminPage } from '../types';

const pages: AdminPage[] = [
  'Dashboard',
  'Strategy settings',
  'Data manager',
  'Backtests',
  'Live trades',
  'Admin',
  'Signals',
  'Logs',
];

export function Sidebar({ onSelect, selected }: { onSelect: (page: AdminPage) => void; selected: AdminPage }) {
  return (
    <aside>
      <div className="logo">OpenClaw Pro Desk</div>
      {pages.map((page) => (
        <button key={page} onClick={() => onSelect(page)} className={selected === page ? 'active' : ''}>{page}</button>
      ))}
    </aside>
  );
}
