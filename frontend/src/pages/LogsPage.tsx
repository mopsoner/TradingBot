import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

const LEVELS = ['All', 'INFO', 'WARN', 'ERROR'];

export function LogsPage() {
  const [level, setLevel] = useState('All');
  const params = level !== 'All' ? `?level=${level}` : '';
  const { data, loading, error, reload } = useApi(() => api.logs(params), [level]);

  return (
    <section>
      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Logs</h2>
        <div className="flex gap-8">
          {LEVELS.map(l => (
            <button
              key={l}
              className={`btn ${level === l ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
          <button className="btn btn-secondary" onClick={reload}>↻ Refresh</button>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="red">Error: {error}</p>}

      {data && (
        <>
          <p className="muted mb-16">{data.total} entries</p>
          <div className="card">
            {data.rows.map(l => (
              <div key={l.id} className="log-entry">
                <span className="log-time">
                  {new Date(l.timestamp).toLocaleDateString()}
                </span>
                <span className={`log-${l.level}`}>[{l.level}]</span>
                <span>{l.message}</span>
              </div>
            ))}
            {data.rows.length === 0 && <p className="muted">No log entries.</p>}
          </div>
        </>
      )}
    </section>
  );
}
