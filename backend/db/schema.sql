CREATE TABLE signals (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  setup_type TEXT NOT NULL,
  liquidity_zone TEXT NOT NULL,
  sweep_level REAL NOT NULL,
  bos_level REAL NOT NULL,
  fib_zone TEXT NOT NULL,
  accepted INTEGER NOT NULL
);

CREATE TABLE trades (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL
);

CREATE TABLE positions (
  id INTEGER PRIMARY KEY,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  unrealized_pnl REAL NOT NULL
);

CREATE TABLE backtests (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  win_rate REAL NOT NULL,
  profit_factor REAL NOT NULL,
  expectancy REAL NOT NULL,
  drawdown REAL NOT NULL,
  r_multiple REAL NOT NULL
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE configuration (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  payload TEXT NOT NULL
);
