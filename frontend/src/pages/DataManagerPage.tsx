import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

export function DataManagerPage() {
  const { data: symbols } = useApi(() => api.symbols());
  const { data: stats, refresh: refreshStats } = useApi(() => api.dataStats());
  const { data: candles, refresh: refreshCandles } = useApi(() => api.candles('?limit=30'));
  const [symbol, setSymbol] = useState('ETHUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [open, setOpen] = useState(100);
  const [high, setHigh] = useState(102);
  const [low, setLow] = useState(99);
  const [close, setClose] = useState(101);
  const [volume, setVolume] = useState(4500);
  const [result, setResult] = useState<string>('');

  const addCandle = async () => {
    const res = await api.ingestData([{ symbol, timeframe, timestamp: new Date().toISOString(), open, high, low, close, volume, source: 'manual-ui' }]);
    setResult(res.ok ? `Ajouté: ${String(res.inserted)} bougie` : `Erreur: ${String(res.reason)}`);
    refreshStats();
    refreshCandles();
  };

  const enrichDaily = async () => {
    const res = await api.enrichDaily([symbol]);
    setResult(res.ok ? `Enrichissement OK (${String(res.rows_added)} lignes)` : 'Erreur enrichissement');
    refreshStats();
    refreshCandles();
  };

  return (
    <section>
      <h2>Data manager (scan + enrichissement DB)</h2>
      <div className="grid-3 mb-16">
        <div className="card">
          <div className="stat-value blue">{stats?.total_candles ?? 0}</div>
          <div className="stat-label">Bougies stockées</div>
        </div>
        <div className="card">
          <div className="stat-value">{(stats?.tracked_symbols as string[] | undefined)?.length ?? 0}</div>
          <div className="stat-label">Symboles suivis</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ fontSize: 17 }}>{stats?.last_candle_at ? new Date(String(stats.last_candle_at)).toLocaleString() : '—'}</div>
          <div className="stat-label">Dernière donnée</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Ajouter des données manuellement</h3>
          <div className="form-group">
            <label>Symbole</label>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}>
              {(symbols ?? ['ETHUSDT', 'BTCUSDT']).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
            </select>
          </div>
          <div className="grid-2">
            <input type="number" value={open} onChange={e => setOpen(Number(e.target.value))} placeholder="Open" />
            <input type="number" value={high} onChange={e => setHigh(Number(e.target.value))} placeholder="High" />
            <input type="number" value={low} onChange={e => setLow(Number(e.target.value))} placeholder="Low" />
            <input type="number" value={close} onChange={e => setClose(Number(e.target.value))} placeholder="Close" />
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Volume</label>
            <input type="number" value={volume} onChange={e => setVolume(Number(e.target.value))} />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={addCandle}>Ajouter</button>
            <button className="btn btn-secondary" onClick={enrichDaily}>Scanner & enrichir quotidien</button>
          </div>
          {result && <p className="muted" style={{ marginTop: 10 }}>{result}</p>}
        </div>

        <div className="card">
          <h3>Données récentes en base</h3>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Timestamp</th><th>Symbol</th><th>TF</th><th>Close</th><th>Source</th></tr>
              </thead>
              <tbody>
                {(candles?.rows as Array<Record<string, unknown>> | undefined)?.map((row, i) => (
                  <tr key={i}>
                    <td className="muted">{new Date(String(row.timestamp)).toLocaleString()}</td>
                    <td>{String(row.symbol)}</td>
                    <td>{String(row.timeframe)}</td>
                    <td>{Number(row.close).toFixed(2)}</td>
                    <td><span className="tag">{String(row.source)}</span></td>
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
