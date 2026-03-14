import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

const FIB_LEVELS = [0.5, 0.618, 0.705];

type ChartPoint = { t: number; price: number };
type ScanRow = { symbol: string; signal?: string; accepted: boolean; chart: ChartPoint[]; signal_points: { type: string; index: number }[] };

function MiniChart({ points, signals }: { points: ChartPoint[]; signals: { type: string; index: number }[] }) {
  const { path, min, max } = useMemo(() => {
    const prices = points.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const y = (v: number) => 80 - ((v - minPrice) / Math.max(maxPrice - minPrice, 0.1)) * 70;
    const x = (i: number) => 10 + (i / Math.max(points.length - 1, 1)) * 280;
    const p = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(pt.price)}`).join(' ');
    return { path: p, min: minPrice, max: maxPrice };
  }, [points]);

  return (
    <svg viewBox="0 0 300 90" style={{ width: '100%', background: '#0b0f14', borderRadius: 6 }}>
      <path d={path} stroke="#58a6ff" fill="none" strokeWidth="2" />
      {signals.map(s => {
        const pt = points[s.index] ?? points[0];
        const x = 10 + (s.index / Math.max(points.length - 1, 1)) * 280;
        const y = 80 - ((pt.price - min) / Math.max(max - min, 0.1)) * 70;
        return <circle key={`${s.type}-${s.index}`} cx={x} cy={y} r="3" fill="#3fb950"><title>{s.type}</title></circle>;
      })}
    </svg>
  );
}

function MarketClocks() {
  const now = new Date();
  const zones = [
    { name: 'London', tz: 'Europe/London' },
    { name: 'New York', tz: 'America/New_York' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'Paris', tz: 'Europe/Paris' },
  ];
  return (
    <div className="grid-4 mb-16">
      {zones.map(z => (
        <div key={z.name} className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">{z.name}</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: z.tz }).format(now)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketScannerPage() {
  const { data: symbols } = useApi(() => api.symbols());
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['ETHUSDT', 'BTCUSDT']);
  const [fib, setFib] = useState(0.618);
  const [singleResult, setSingleResult] = useState<Record<string, unknown> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);

  const symbolUniverse = symbols ?? ['ETHUSDT', 'BTCUSDT'];

  const runSingle = async () => {
    setScanning(true);
    setSingleResult(await api.scan({ symbol: selectedSymbols[0], liquidity_zone: true, sweep: true, spring: true, utad: false, displacement: true, bos: true, fib_retracement: fib }));
    setScanning(false);
  };

  const runBatch = async () => {
    setScanning(true);
    setBatchResult(await api.marketScan({ symbols: selectedSymbols, fib_retracement: fib, require_displacement: true, require_bos: true }));
    setScanning(false);
  };

  return (
    <section>
      <h2>Market scanner multi-crypto</h2>
      <MarketClocks />
      <div className="grid-2">
        <div className="card">
          <h3>Scanner configuration</h3>
          <div className="form-group">
            <label>Symbols (multi-select)</label>
            <select multiple value={selectedSymbols} onChange={e => setSelectedSymbols(Array.from(e.target.selectedOptions).map(o => o.value))} style={{ minHeight: 140 }}>
              {symbolUniverse.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Fib retracement</label>
            <select value={fib} onChange={e => setFib(parseFloat(e.target.value))}>{FIB_LEVELS.map(f => <option key={f} value={f}>{f}</option>)}</select>
          </div>
          <div className="row">
            <button className="btn btn-secondary" disabled={scanning || selectedSymbols.length === 0} onClick={runSingle}>Scan selected</button>
            <button className="btn btn-primary" disabled={scanning || selectedSymbols.length === 0} onClick={runBatch}>Scan full basket</button>
          </div>
        </div>

        <div className="card">
          <h3>Automation status</h3>
          {!batchResult && <p className="muted">Run full basket scan to see automation routing.</p>}
          {batchResult && batchResult.automation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><span className="muted">Interval: </span>{String((batchResult.automation as Record<string, unknown>).scan_interval_minutes)} min</div>
              <div><span className="muted">Next scan ETA: </span>{String((batchResult.automation as Record<string, unknown>).next_scan_eta_seconds)} sec</div>
              <div><span className="muted">Routing: </span>{String((batchResult.automation as Record<string, unknown>).auto_route_to_paper ? 'paper by default' : 'manual')}</div>
              <div><span className="muted">Binance mode: </span><strong>{String((batchResult.automation as Record<string, unknown>).margin_type)}</strong></div>
            </div>
          ) : null}
          {singleResult && <p style={{ marginTop: 12 }} className={singleResult.accepted ? 'green' : 'red'}>{singleResult.accepted ? 'Signal validé (single scan).' : `Rejeté: ${String(singleResult.reason)}`}</p>}
        </div>
      </div>

      {batchResult && (
        <div className="card">
          <h3>Visualisation des signaux</h3>
          <div className="grid-2">
            {[...((batchResult.accepted as ScanRow[] | undefined) ?? []), ...((batchResult.rejected as ScanRow[] | undefined) ?? [])].map(row => (
              <div key={row.symbol} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div className="flex items-center justify-between mb-8">
                  <strong>{row.symbol}</strong>
                  <span className={`badge ${row.accepted ? 'badge-green' : 'badge-red'}`}>{row.accepted ? (row.signal ?? 'READY') : 'REJECTED'}</span>
                </div>
                <MiniChart points={row.chart} signals={row.signal_points} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
