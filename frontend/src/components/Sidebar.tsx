import type { AdminPage } from '../types';

const pages: AdminPage[] = ['Live cockpit', 'Strategy lab', 'Journal'];

export function Sidebar({ onSelect, selected }: { onSelect: (page: AdminPage) => void; selected: AdminPage }) {
  return (
    <aside>
      <div className="logo">OpenClaw Decision Desk</div>
      {pages.map((page) => (
        <button key={page} onClick={() => onSelect(page)} className={selected === page ? 'active' : ''}>{page}</button>
      ))}
    </aside>
  );
}
