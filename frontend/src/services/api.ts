const get = async <T>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

const send = async <T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> => {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

const post = async <T>(path: string, body: unknown): Promise<T> => send(path, 'POST', body);
const put  = async <T>(path: string, body: unknown): Promise<T> => send(path, 'PUT', body);
const del  = async <T>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch(path, {
    method: 'DELETE',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

export type Signal = {
  id: number; timestamp: string; symbol: string; timeframe: string;
  setup_type: string; liquidity_zone: string; sweep_level: number;
  bos_level: number; fib_zone: string; accepted: boolean;
  direction?: string | null;
  reject_reason?: string | null;
  fake_breakout?: boolean;
  equal_highs_lows?: boolean;
  expansion?: boolean;
  wyckoff_event?: string | null;
  tf_4h_structure?: string | null;
  tf_1h_validation?: string | null;
  session_name?: string | null;
  displacement_force?: number | null;
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

export type SimulatedTrade = {
  index: number;
  direction: string;
  outcome: string;
  r_multiple: number;
  timestamp: string;
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
  signalsForBacktest: (symbol: string, timeframe: string) =>
    get<{ total: number; rows: Signal[] }>(`/api/signals?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=500`),
  trades:     (params = '')                   => get<{ total: number; rows: Trade[] }>(`/api/trades${params}`),
  positions:  ()                              => get<Position[]>('/api/positions'),
  backtests:  (params = '')                   => get<{ total: number; rows: BacktestResult[] }>(`/api/backtests${params}`),
  runBacktest: (body: Record<string, unknown>)=> post<Record<string, unknown>>('/api/backtest/run', body),
  logs:       (params = '')                   => get<{ total: number; rows: Log[] }>(`/api/logs${params}`),
  symbols:    ()                              => get<string[]>('/api/symbols'),
  isolatedSymbols: ()                         => get<string[]>('/api/symbols/isolated'),
  symbolsByQuote:  ()                          => get<Record<string, string[]>>('/api/symbols/by-quote'),
  symbolPrices:    ()                          => get<Record<string, number>>('/api/symbols/prices'),
  loadedSymbols:   ()                          => get<{ symbol: string; timeframes: Record<string, number>; total: number }[]>('/api/symbols/loaded'),
  config:     ()                              => get<Record<string, unknown>>('/api/config'),
  updateConfig:(body: Record<string, unknown>)=> put<Record<string, unknown>>('/api/config', body),
  marginEndpoints: ()                         => get<Record<string, unknown>>('/api/execution/endpoints'),
  marginAccount:   ()                         => get<MarginAccount>('/api/margin/account'),
  marginInterestRates: ()                     => get<Record<string, unknown>>('/api/margin/interest-rates'),
  marginForceLiquidations: ()                 => get<Record<string, unknown>>('/api/margin/force-liquidations'),
  scan:       (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/scan', body),
  marketScan: (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/scan/market', body),

  strategyProfiles: ()                        => get<{ rows: Record<string, unknown>[] }>('/api/strategy/profiles'),
  saveStrategyProfile: (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/strategy/profiles', body),
  updateStrategyProfile: (profileId: number, body: Record<string, unknown>) => put<Record<string, unknown>>(`/api/strategy/profiles/${profileId}`, body),
  deleteStrategyProfile: (profileId: number) => del<Record<string, unknown>>(`/api/strategy/profiles/${profileId}`),
  backtestStrategyProfile: (profileId: number) => post<Record<string, unknown>>(`/api/strategy/profiles/${profileId}/backtest`, {}),
  approveStrategyProfile: (profileId: number, body: Record<string, unknown>) => post<Record<string, unknown>>(`/api/strategy/profiles/${profileId}/approve-live`, body),

  botStatus:  ()                              => get<Record<string, unknown>>('/api/bot/status'),
  startBot:   (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/bot/start', body),
  dataStats:  ()                              => get<Record<string, unknown>>('/api/data/stats'),
  candles:    (params = '')                   => get<{ total: number; rows: Record<string, unknown>[] }>(`/api/data/candles${params}`),
  ingestData:    (body: Record<string, unknown>[]) => post<Record<string, unknown>>('/api/data/ingest', body),
  fetchCandles:  (body: { symbols: string[]; timeframe: string; days: number; source?: string }) =>
    post<Record<string, unknown>>('/api/data/fetch', body),
  importCsv:     (body: { symbol: string; timeframe: string; csv_text: string }) =>
    post<Record<string, unknown>>('/api/data/import/csv', body),
  deleteCandles: (body: { symbol: string; timeframe?: string }) =>
    del<Record<string, unknown>>('/api/data/candles', body),
  services:   () => get<{ services: ServiceStatus[]; refreshed_at: string; mode: string }>('/api/services'),
  optimizeBacktest: (id: number) => post<Record<string, unknown>>(`/api/backtest/${id}/optimize`, {}),
  multiOptimize: (backtest_ids: number[]) => post<Record<string, unknown>>('/api/backtest/multi-optimize', { backtest_ids }),
  startAiWorkshop: (body: { symbols: string[]; timeframe: string; horizon_days: number; profile_id?: number | null }) =>
    post<Record<string, unknown>>('/api/strategy/ai-workshop/start', body),
  getAiWorkshopStatus: (job_id: string) => get<Record<string, unknown>>(`/api/strategy/ai-workshop/${job_id}`),
  createOptimizedProfile: (profileId: number, body: { source_profile_id: number; suggested_params: Record<string, unknown>; new_name?: string }) =>
    post<Record<string, unknown>>(`/api/strategy/profiles/${profileId}/create-optimized`, body),
  getPipeline: () => get<PipelineState>('/api/pipeline'),
  runPipeline: (body: { symbols: string[]; timeframe: string; profile_id?: number | null }) =>
    post<Record<string, unknown>>('/api/pipeline/run', body),
  journal: (params = '') => get<JournalResponse>(`/api/journal${params}`),
  autonomousStart: (body: { symbols: string[]; timeframe: string; profile_id?: number | null; interval_minutes: number }) =>
    post<Record<string, unknown>>('/api/autonomous/start', body),
  autonomousStop: () => post<Record<string, unknown>>('/api/autonomous/stop', {}),
  autonomousStatus: () => get<Record<string, unknown>>('/api/autonomous/status'),
  runWalkforward: (body: { symbol: string; years: number; timeframe: string; profile_id?: number | null }) =>
    post<Record<string, unknown>>('/api/backtest/walkforward', body),
};

export type MarginAsset = {
  symbol: string;
  side: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  notional: number;
  unrealizedPnl: number;
  marginLevel: number;
  marginLevelStatus: 'NORMAL' | 'MARGIN_CALL' | 'FORCE_LIQUIDATION';
  liquidateRate: number;
  liquidatePrice: number;
  marginRatio: number;
  borrowed: number;
  interest: number;
  totalAsset: number;
  totalDebt: number;
};

export type MarginAccount = {
  mode: string;
  marginType: string;
  totalAsset: number;
  totalDebt: number;
  totalMarginLevel: number;
  worstLiquidateRate: number;
  assets: MarginAsset[];
};

export type PipelineStep = {
  name: string;
  status: 'pending' | 'checking' | 'passed' | 'failed';
  completed_at: string | null;
  detail: string;
};

export type PipelineEntry = {
  symbol: string;
  timeframe: string;
  started_at: string;
  final_status: 'accepted' | 'rejected' | 'error' | null;
  final_direction: 'LONG' | 'SHORT' | null;
  final_reason: string | null;
  session?: string | null;
  tf_4h_structure?: string | null;
  tf_1h_validation?: string | null;
  steps: PipelineStep[];
};

export type JournalResponse = {
  total: number;
  rows: Signal[];
  in_memory_recent: Record<string, unknown>[];
  stats: { accepted: number; rejected: number };
};

export type PipelineState = {
  pipeline: Record<string, PipelineEntry>;
  in_progress: number;
  accepted: number;
  rejected: number;
  total: number;
};

export type ServiceStatus = {
  id: string;
  name: string;
  icon: string;
  status: 'running' | 'idle' | 'scheduled' | 'stopped';
  status_label: string;
  detail: string;
  last_activity: string | null;
  next_run: string | null;
};
