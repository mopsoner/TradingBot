export const TIMEFRAMES = [
  { value: '5m',  label: '5 min',    candles: 2016, desc: '7 jours'  },
  { value: '15m', label: '15 min',   candles: 672,  desc: '7 jours'  },
  { value: '1h',  label: '1 heure',  candles: 720,  desc: '30 jours' },
  { value: '4h',  label: '4 heures', candles: 540,  desc: '90 jours' },
] as const;

export type TimeframeValue = typeof TIMEFRAMES[number]['value'];

export const TIMEFRAME_LABEL: Record<string, string> = Object.fromEntries(
  TIMEFRAMES.map(t => [t.value, t.label])
);

export const SYMBOL_PRICES: Record<string, number> = {
  BTCUSDT: 65000, ETHUSDT: 3500,  SOLUSDT: 140,  BNBUSDT: 550,   AVAXUSDT: 35,
  XRPUSDT: 0.55,  ADAUSDT: 0.45,  DOGEUSDT: 0.12, DOTUSDT: 7.5,  MATICUSDT: 0.85,
  LINKUSDT: 14,   UNIUSDT: 8,     LTCUSDT: 80,   ATOMUSDT: 8.5,  NEARUSDT: 5.5,
  AAVEUSDT: 95,   FILUSDT: 5,     APTUSDT: 8,    ARBUSDT: 0.95,  OPUSDT: 1.8,
  SUIUSDT: 1.2,   INJUSDT: 25,    TIAUSDT: 6,    SEIUSDT: 0.4,   WLDUSDT: 2.5,
};
