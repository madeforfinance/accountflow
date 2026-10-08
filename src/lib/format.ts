/* Formatting helpers — currency, numbers, dates. Never emit NaN/undefined.
   Currency/decimal settings come from the accounting settings store. */

let currencySymbol = 'Rs.';
let currencyCode = 'PKR';
let decimalPlaces = 2;

export function configureFormat(opts: { symbol?: string; code?: string; decimals?: number }) {
  if (opts.symbol != null) currencySymbol = opts.symbol;
  if (opts.code != null) currencyCode = opts.code;
  if (opts.decimals != null) decimalPlaces = opts.decimals;
}

export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Parse user-entered amount; returns null when invalid so callers can show a friendly error. */
export function parseAmount(v: string): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Round to configured decimal places — use everywhere money is computed. */
export function round2(n: number): number {
  const f = Math.pow(10, decimalPlaces);
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function fmtNum(n: unknown, digits?: number): string {
  const d = digits == null ? decimalPlaces : digits;
  const v = toNum(n);
  return v.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtInt(n: unknown): string {
  return fmtNum(n, 0);
}

/** Compact money for dashboards: Rs. 12.50 L / Rs. 1.25 Cr */
export function fmtMoney(n: unknown, digits?: number): string {
  const v = toNum(n);
  const abs = Math.abs(v);
  const formatted =
    abs >= 10000000
      ? `${fmtNum(v / 10000000, 2)} Cr`
      : abs >= 100000
        ? `${fmtNum(v / 100000, 2)} L`
        : fmtNum(v, digits);
  return `${currencySymbol} ${formatted}`;
}

/** Full money for reports: Rs. 1,234,567.89 */
export function fmtMoneyFull(n: unknown, digits?: number): string {
  return `${currencySymbol} ${fmtNum(n, digits)}`;
}

/** Accounting negative presentation: (250,000) instead of -250,000 */
export function fmtAcct(n: unknown, digits?: number): string {
  const v = toNum(n);
  if (v < 0) return `(${fmtNum(Math.abs(v), digits)})`;
  return fmtNum(v, digits);
}

export function fmtMoneyAcct(n: unknown, digits?: number): string {
  const v = toNum(n);
  if (v < 0) return `(${currencySymbol} ${fmtNum(Math.abs(v), digits)})`;
  return `${currencySymbol} ${fmtNum(v, digits)}`;
}

export function currencyLabel(): string {
  return `${currencyCode} (${currencySymbol})`;
}

export function fmtPct(n: unknown, digits = 1): string {
  return `${fmtNum(n, digits)}%`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Accepts 'YYYY-MM-DD' or a Date. Returns '' for invalid input. */
export function fmtDate(input: string | Date | undefined | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? parseISODate(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Add n months to a YYYY-MM-DD date, clamping the day. */
export function addMonthsISO(iso: string, n: number): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() < day) d.setDate(0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** Escape a value for CSV output. */
export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
