import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { Signal } from '../services/api';
import { fmtDateTime, fmtSym } from '../utils/dateUtils';

type FilterMode = 'all' | 'accepted' | 'rejected';

function DirectionBadge({ dir }: { dir?: string | null }) {
  if (!dir) return null;
  const color = dir === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)';
  const bg = dir === 'LONG' ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 5, background: bg, color, fontWeight: 700, fontSize: 12 }}>
      {dir}
    </span>
  );
}

function BoolDot({ val, label }: { val?: boolean; label: string }) {
  if (!val) return null;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: 'rgba(88,166,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(88,166,255,0.25)',
    }}>
      {label}
    </span>
  );
}

function JournalRow({ row }: { row: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const accepted = row.accepted;
  const borderColor = accepted ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.18)';
  const bg = accepted ? 'rgba(63,185,80,0.04)' : 'rgba(248,81,73,0.03)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      background: bg,
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ minWidth: 36, fontSize: 18, textAlign: 'center' }}>
          {accepted ? '✅' : '❌'}
        </div>

        <div style={{ minWidth: 80 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtSym(row.symbol)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.timeframe}</div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <DirectionBadge dir={row.direction} />
            {row.wyckoff_event && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.wyckoff_event}</span>
            )}
            <BoolDot val={row.fake_breakout} label="Fake BK" />
            <BoolDot val={row.equal_highs_lows} label="EQH/EQL" />
            <BoolDot val={row.expansion} label="Expansion" />
          </div>
          {!accepted && row.reject_reason && (
            <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 3 }}>
              Rejet : {row.reject_reason}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateTime(row.timestamp)}</div>
          {row.session_name && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Session: {row.session_name}</div>
          )}
          {row.fib_zone && row.fib_zone !== 'N/A' && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Fib: {row.fib_zone}</div>
          )}
        </div>

        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div style={{
          padding: '0 16px 14px',
          borderTop: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '8px 16px',
          marginTop: 10,
        }}>
          {[
            ['Zone liquidité', row.liquidity_zone],
            ['Sweep level', row.sweep_level != null ? `${row.sweep_level}%` : null],
            ['BOS level', row.bos_level != null ? `${row.bos_level}` : null],
            ['Displacement', row.displacement_force != null ? row.displacement_force.toFixed(3) : null],
            ['4H structure', row.tf_4h_structure],
            ['1H validation', row.tf_1h_validation],
            ['Setup type', row.setup_type],
          ].map(([label, val]) => val ? (
            <div key={String(label)}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{String(val)}</div>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

export function JournalPage() {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');

  const params = filter === 'all' ? '?limit=200' : `?accepted=${filter === 'accepted'}&limit=200`;
  const { data, loading, error, reload } = useApi(() => api.journal(params), [filter]);

  const rows: Signal[] = (data?.rows ?? []).filter(r =>
    !search || r.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const stats = data?.stats ?? { accepted: 0, rejected: 0 };
  const total = data?.total ?? 0;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Journal des Setups</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Historique complet — setups acceptés ET rejetés avec tous les détails structurels
          </div>
        </div>
        <button className="btn btn-secondary" onClick={reload} style={{ fontSize: 12 }}>
          Rafraîchir
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)' }}>{total}</div>
          <div className="muted" style={{ fontSize: 12 }}>Total</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-green)' }}>{stats.accepted}</div>
          <div className="muted" style={{ fontSize: 12 }}>Acceptés</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-red)' }}>{stats.rejected}</div>
          <div className="muted" style={{ fontSize: 12 }}>Rejetés</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>
            {stats.accepted + stats.rejected > 0
              ? `${Math.round((stats.accepted / (stats.accepted + stats.rejected)) * 100)}%`
              : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Taux accept.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['all', 'accepted', 'rejected'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                background: filter === f ? 'var(--accent)' : 'var(--surface)',
                color: filter === f ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'Tous' : f === 'accepted' ? 'Acceptés' : 'Rejetés'}
            </button>
          ))}
        </div>
        <input
          placeholder="Filtrer par crypto…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12,
            color: 'var(--text)', outline: 'none', minWidth: 160,
          }}
        />
        {search && (
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSearch('')}>
            Effacer
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
      )}
      {error && (
        <div style={{ color: 'var(--accent-red)', padding: 16, background: 'rgba(248,81,73,0.08)', borderRadius: 8 }}>
          Erreur: {error}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📓</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Aucun setup journalisé</div>
          <div className="muted">Lancez le Pipeline Live pour générer des entrées de journal.</div>
        </div>
      )}

      {rows.map(row => <JournalRow key={row.id} row={row} />)}

      <div style={{
        marginTop: 16, padding: 12, borderRadius: 8,
        background: 'var(--surface2)', fontSize: 11, color: 'var(--text-muted)',
      }}>
        Séquence validée : Liquidité → Sweep → Spring/UTAD → Displacement → BOS → Expansion → Fib (0.5/0.618/0.705).
        RSI / MACD / EMA : jamais des déclencheurs. Sessions et weekend : filtres uniquement.
        Cliquez sur une ligne pour voir tous les détails structurels.
      </div>
    </section>
  );
}
