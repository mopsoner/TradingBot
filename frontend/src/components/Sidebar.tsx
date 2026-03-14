import type { AdminPage } from '../types';

const pages: AdminPage[] = [
  'Dashboard',
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

export function Sidebar({ onSelect }: { onSelect: (page: AdminPage) => void }) {
  return (
    <aside>
      {pages.map((page) => (
        <button key={page} onClick={() => onSelect(page)}>{page}</button>
      ))}
    </aside>
  );
}
