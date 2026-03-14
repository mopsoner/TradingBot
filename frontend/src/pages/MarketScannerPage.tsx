import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

const FIB_LEVELS = [0.5, 0.618, 0.705];

export function MarketScannerPage() {
  const { data: symbols } = useApi(() => api.symbols());
  const [form, setForm] = useState({
    symbol: 'ETHUSDT', liquidity_zone: true, sweep: true,
    spring: true, utad: false, displacement: true,
    bos: true, fib_retracement: 0.618,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const runScan = async () => {
    setScanning(true);
    setResult(null);
    try {
      const res = await api.scan(form);
      setResult(res);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setScanning(false);
    }
  };

  return (
    <section>
      <h2>Market scanner</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Scan parameters</h3>

          <div className="form-group">
            <label>Symbol</label>
            <select value={form.symbol} onChange={e => set('symbol', e.target.value)}>
              {(symbols ?? ['ETHUSDT', 'BTCUSDT']).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Fib retracement level</label>
            <select
              value={form.fib_retracement}
              onChange={e => set('fib_retracement', parseFloat(e.target.value))}
            >
              {FIB_LEVELS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {(['liquidity_zone', 'sweep', 'spring', 'utad', 'displacement', 'bos'] as const).map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 13, letterSpacing: 0 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={form[k] as boolean}
                  onChange={e => set(k, e.target.checked)}
                />
                {k.replace('_', ' ')}
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary"
            onClick={runScan}
            disabled={scanning}
            style={{ width: '100%' }}
          >
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>

        <div className="card">
          <h3>Result</h3>
          {!result && <p className="muted">Run a scan to see the result.</p>}
          {result && (
            <div>
              {result.error ? (
                <p className="red">{String(result.error)}</p>
              ) : result.accepted ? (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }} className="green">
                    ✓ Signal accepted
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div><span className="muted">Direction: </span>
                      <strong className={result.signal === 'LONG' ? 'green' : 'red'}>
                        {String(result.signal)}
                      </strong>
                    </div>
                    {result.order && (
                      <>
                        <div><span className="muted">Order: </span>{JSON.stringify(result.order)}</div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }} className="red">
                    ✗ Signal rejected
                  </div>
                  <p className="muted">Reason: {String(result.reason)}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
