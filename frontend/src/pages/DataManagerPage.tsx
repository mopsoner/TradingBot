import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function DataManagerPage() {
  const { data: isolatedSymbols } = useApi(() => api.isolatedSymbols());
  const { data: stats, refresh: refreshStats } = useApi(() => api.dataStats());
  const { data: candles, refresh: refreshCandles } = useApi(() => api.candles('?limit=40'));
  const [selected, setSelected] = useState<string[]>(['ETHUSDT', 'BTCUSDT']);
  const [timeframe, setTimeframe] = useState('15m');
  const [source, setSource] = useState('isolated-margin-feed');
  const [result, setResult] = useState('');

  const symbols = useMemo(() => isolatedSymbols ?? ['ETHUSDT', 'BTCUSDT'], [isolatedSymbols]);

  const enrichSelected = async () => {
    const res = await api.enrichDaily(selected);
    setResult(res.ok ? `DB enrichie: ${String(res.rows_added)} lignes.` : `Erreur: ${String(res.reason)}`);
    refreshStats();
    refreshCandles();
  };

  const ingestQuickSample = async () => {
    const now = new Date().toISOString();
    const rows = selected.map((symbol, idx) => ({
      symbol,
      timeframe,
      timestamp: now,
      open: 100 + idx,
      high: 101 + idx,
      low: 99 + idx,
      close: 100.5 + idx,
      volume: 1200 + idx * 100,
      source,
    }));
    const res = await api.ingestData(rows);
    setResult(res.ok ? `Ajout manuel: ${String(res.inserted)} bougies.` : `Erreur: ${String(res.reason)}`);
    refreshStats();
    refreshCandles();
  };

  return (
    <section>
      <h2>Data manager (isolated margin)</h2>
      <div className="grid-3 mb-16">
        <div className="card"><div className="stat-value blue">{stats?.total_candles ?? 0}</div><div className="stat-label">Candles en base</div></div>
        <div className="card"><div className="stat-value">{(stats?.tracked_symbols as string[] | undefined)?.length ?? 0}</div><div className="stat-label">Symbols trackés</div></div>
        <div className="card"><div className="stat-value" style={{ fontSize: 16 }}>{stats?.last_candle_at ? new Date(String(stats.last_candle_at)).toLocaleString() : '—'}</div><div className="stat-label">Dernière ingestion</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Alimenter la base par liste crypto margin isolated</h3>
          <div className="form-group">
            <label>Liste des cryptos</label>
            <select multiple value={selected} onChange={e => setSelected(Array.from(e.target.selectedOptions).map(o => o.value))} style={{ minHeight: 140 }}>
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Timeframe</label><select value={timeframe} onChange={e => setTimeframe(e.target.value)}><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option></select></div>
          <div className="form-group"><label>Source</label><input value={source} onChange={e => setSource(e.target.value)} /></div>
          <div className="row">
            <button className="btn btn-secondary" onClick={ingestQuickSample}>Ajouter un sample</button>
            <button className="btn btn-primary" onClick={enrichSelected}>Scan & enrichissement journalier</button>
          </div>
          {result && <p className="muted" style={{ marginTop: 8 }}>{result}</p>}
        </div>

        <div className="card">
          <h3>Données récentes</h3>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Timestamp</th><th>Symbol</th><th>TF</th><th>Close</th><th>Source</th></tr></thead>
              <tbody>
                {(candles?.rows as Array<Record<string, unknown>> | undefined)?.map((row, i) => (
                  <tr key={i}>
                    <td className="muted">{new Date(String(row.timestamp)).toLocaleString()}</td>
                    <td>{String(row.symbol)}</td>
                    <td><span className="tag">{String(row.timeframe)}</span></td>
                    <td>{Number(row.close).toFixed(2)}</td>
                    <td>{String(row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
