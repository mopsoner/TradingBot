import { useState, useMemo } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortKey<T> = keyof T | null;

export function useSortable<T>(data: T[], defaultKey?: keyof T, defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey]   = useState<SortKey<T>>(defaultKey ?? null);
  const [sortDir, setSortDir]   = useState<SortDir>(defaultDir);

  const toggle = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const Th = ({ col, children, style }: { col: keyof T; children: React.ReactNode; style?: React.CSSProperties }) => {
    const active = sortKey === col;
    return (
      <th
        onClick={() => toggle(col)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          color: active ? 'var(--accent)' : undefined,
          ...style,
        }}
      >
        {children}
        {' '}
        <span style={{ fontSize: 9, opacity: active ? 1 : 0.3 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </th>
    );
  };

  return { sorted, toggle, sortKey, sortDir, Th };
}
