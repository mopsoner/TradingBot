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

