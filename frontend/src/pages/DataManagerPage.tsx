import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { AdminPage } from '../types';
import { TIMEFRAMES, SYMBOL_PRICES } from '../constants';
import { fmtDateTime } from '../utils/dateUtils';

type Props = { onNavigate?: (page: AdminPage) => void };

export function DataManagerPage({ onNavigate }: Props) {
  const { data: allSymbols } = useApi(() => api.isolatedSymbols());
  const { data: stats, reload: refreshStats } = useApi(() => api.dataStats());
  const { data: candles, reload: refreshCandles } = useApi(() => api.candles('?limit=50'));

  const symbols = allSymbols ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(['ETHUSDT', 'BTCUSDT']));
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { tf: string; rows: number }[]>>({});

  const toggle = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(symbols));
  const clearAll  = () => setSelected(new Set());

  const enrich = async (tf: string) => {
    if (selected.size === 0) return;
    setLoading(tf);
    const syms = Array.from(selected);
    try {
      const res = await api.enrich({ symbols: syms, timeframe: tf });
      const added = Number(res.rows_added ?? 0);
      setResults(prev => ({
        ...prev,
        ...Object.fromEntries(syms.map(s => [
          s,
          [...(prev[s] ?? []).filter(r => r.tf !== tf), { tf, rows: Math.round(added / syms.length) }],
        ])),
      }));
      refreshStats();
      refreshCandles();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const totalCandles = Number(stats?.total_candles ?? 0);
  const trackedCount = (stats?.tracked_symbols as string[] | undefined)?.length ?? 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Données de marché</h2>
        {onNavigate && (
          <button className="btn btn-primary" onClick={() => onNavigate('Stratégie')}>
            Configurer la stratégie →
          </button>
        )}
      </div>

      <div className="grid-3 mb-16">
        <div className="card">
          <div className="stat-value blue">{totalCandles.toLocaleString()}</div>
          <div className="stat-label">Bougies en base</div>
        </div>
        <div className="card">
          <div className="stat-value">{trackedCount}</div>
          <div className="stat-label">Symboles chargés</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ fontSize: 15 }}>
            {stats?.last_candle_at ? fmtDateTime(String(stats.last_candle_at)) : '—'}
          </div>
          <div className="stat-label">Dernière ingestion</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>1 — Sélectionner les cryptos</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={selectAll}>Tout</button>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={clearAll}>Aucun</button>
            <span className="muted" style={{ lineHeight: '28px', fontSize: 12 }}>{selected.size} sélectionné(s)</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6, maxHeight: 260, overflowY: 'auto',
          }}>
            {symbols.map(sym => (
              <label
                key={sym}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  background: selected.has(sym) ? 'rgba(88,166,255,0.12)' : 'transparent',
                  border: `1px solid ${selected.has(sym) ? 'var(--accent)' : 'var(--border)'}`,
                  fontSize: 12, userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(sym)}
                  onChange={() => toggle(sym)}
                  style={{ width: 'auto', margin: 0 }}
                />
                {sym.replace('USDT', '')}
                {SYMBOL_PRICES[sym] && (
                  <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>
                    ${SYMBOL_PRICES[sym] >= 1000
                      ? (SYMBOL_PRICES[sym] / 1000).toFixed(0) + 'k'
                      : SYMBOL_PRICES[sym]}
                  </span>
                )}
              </label>
            ))}
          </div>

          <h3 style={{ marginTop: 20 }}>2 — Charger les bougies</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TIMEFRAMES.map(tf => (
              <div
                key={tf.value}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{tf.label}</div>
                  <div className="muted" style={{ fontSize: 11 }}>~{tf.candles.toLocaleString()} bougies · {tf.desc}</div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ minWidth: 120 }}
                  disabled={loading === tf.value || selected.size === 0}
                  onClick={() => enrich(tf.value)}
                >
                  {loading === tf.value ? 'Chargement…' : `Charger ${tf.label}`}
                </button>
              </div>
            ))}
          </div>

          {Object.keys(results).length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(63,185,80,0.1)', borderRadius: 8, border: '1px solid rgba(63,185,80,0.3)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--accent-green)' }}>✅ Données chargées</div>
              {Object.entries(results).map(([sym, tfs]) => (
                <div key={sym} style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  <strong>{sym}</strong>: {tfs.map(t => `${t.tf} (${t.rows} bougies)`).join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Bougies récentes</h3>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbole</th>
                  <th>TF</th>
                  <th>Ouv.</th>
                  <th>Haut</th>
                  <th>Bas</th>
                  <th>Clôture</th>
                </tr>
              </thead>
              <tbody>
                {(candles?.rows as Array<Record<string, unknown>> | undefined)?.map((row, i) => (
                  <tr key={i}>
                    <td className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmtDateTime(String(row.timestamp))}
                    </td>
                    <td><strong style={{ fontSize: 12 }}>{String(row.symbol).replace('USDT', '')}</strong></td>
                    <td><span className="tag">{String(row.timeframe)}</span></td>
                    <td style={{ fontSize: 12 }}>{Number(row.open).toFixed(2)}</td>
                    <td style={{ fontSize: 12, color: 'var(--accent-green)' }}>{Number(row.high).toFixed(2)}</td>
                    <td style={{ fontSize: 12, color: 'var(--accent-red)' }}>{Number(row.low).toFixed(2)}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{Number(row.close).toFixed(2)}</td>
                  </tr>
                ))}
                {(!candles?.rows || (candles.rows as unknown[]).length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, opacity: 0.5 }}>
                      Aucune bougie — chargez des données à gauche
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
