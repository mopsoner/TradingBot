const get = async <T>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

export type Signal = {
  id: number; timestamp: string; symbol: string; timeframe: string;
  setup_type: string; liquidity_zone: string; sweep_level: number;
  bos_level: number; fib_zone: string; accepted: boolean;
};

export type Trade = {
  id: number; timestamp: string; symbol: string; side: string;
  entry: number; stop: number; target: number; status: string; mode: string;
};

export type Position = {
  id: number; symbol: string; quantity: number;
  entry_price: number; current_price: number; unrealized_pnl: number;
};

export type BacktestResult = {
  id: number; timestamp: string; symbol: string; timeframe: string;
  strategy_version: string; win_rate: number; profit_factor: number;
  expectancy: number; drawdown: number; r_multiple: number;
};

export type Log = {
  id: number; timestamp: string; level: string; message: string;
};

export type Dashboard = {
  total_signals: number; accepted_signals: number; total_trades: number;
  open_trades: number; wins: number; losses: number; win_rate: number;
  open_positions: number; total_pnl: number;
  recent_trades: Trade[]; mode: string;
};

export const api = {
  dashboard:  ()                              => get<Dashboard>('/api/dashboard'),
  signals:    (params = '')                   => get<{ total: number; rows: Signal[] }>(`/api/signals${params}`),
  trades:     (params = '')                   => get<{ total: number; rows: Trade[] }>(`/api/trades${params}`),
  positions:  ()                              => get<Position[]>('/api/positions'),
  backtests:  (params = '')                   => get<{ total: number; rows: BacktestResult[] }>(`/api/backtests${params}`),
  logs:       (params = '')                   => get<{ total: number; rows: Log[] }>(`/api/logs${params}`),
  symbols:    ()                              => get<string[]>('/api/symbols'),
  config:     ()                              => get<Record<string, unknown>>('/api/config'),
  scan:       (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/scan', body),
};
