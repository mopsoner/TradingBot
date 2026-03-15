/**
 * Centralised date/time utilities.
 * All timestamps from the backend are UTC (ISO-8601).
 * We display them converted to the *browser's* local timezone
 * using the client's system locale — no hardcoded 'fr-FR'.
 */

/**
 * Ensure an ISO string is parsed as UTC.
 * Backend may omit the 'Z' suffix on older rows; appending it
 * forces JavaScript to treat the value as UTC instead of local time.
 */
function ensureUtc(ts: string): string {
  if (!ts) return ts;
  if (ts.endsWith('Z') || /[+-]\d\d:\d\d$/.test(ts)) return ts;
  return ts + 'Z';
}

export function parseDate(ts: string | null | undefined): Date {
  if (!ts) return new Date(NaN);
  return new Date(ensureUtc(ts));
}

/** Short date: e.g. "14/03/2026" or "3/14/2026" depending on client locale */
export function fmtDate(ts: string | null | undefined): string {
  const d = parseDate(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Short date + time: e.g. "14/03/2026, 13:42" */
export function fmtDateTime(ts: string | null | undefined): string {
  const d = parseDate(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Time only: e.g. "13:42" */
export function fmtTime(ts: string | null | undefined): string {
  const d = parseDate(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Time with seconds: e.g. "13:42:05" */
export function fmtTimeSec(ts: string | null | undefined): string {
  const d = parseDate(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Human-readable relative time: "3 min ago", "2 h ago", "5 days ago" */
export function fmtRelative(ts: string | null | undefined): string {
  const d = parseDate(ts);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const min  = Math.floor(abs / 60_000);
  const hour = Math.floor(abs / 3_600_000);
  const day  = Math.floor(abs / 86_400_000);
  if (abs < 60_000)   return 'à l\'instant';
  if (min  < 60)      return `il y a ${min} min`;
  if (hour < 24)      return `il y a ${hour}h`;
  return `il y a ${day}j`;
}

/** Format current time for display (e.g. "13:42:05") */
export function nowTime(): string {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Format a symbol as BASE/QUOTE so USDT, USDC and BTC pairs are unambiguous.
 * ETHUSDT → ETH/USDT · ETHUSDC → ETH/USDC · ETHBTC → ETH/BTC
 */
export function fmtSym(symbol: string): string {
  for (const quote of ['USDT', 'USDC', 'BTC']) {
    if (symbol.endsWith(quote)) {
      return `${symbol.slice(0, -quote.length)}/${quote}`;
    }
  }
  return symbol;
}
