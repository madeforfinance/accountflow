/* Reusable accounting validation — one implementation, used by every page. */
import { Account, JournalEntry, FiscalPeriod } from './types';
import { entryTotals, isDateLocked } from './engine';
import { parseISODate } from '../lib/format';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateJournalEntry(
  entry: Pick<JournalEntry, 'date' | 'description' | 'lines'>,
  accounts: Account[],
  periods: FiscalPeriod[],
  opts?: { checkLock?: boolean },
): ValidationResult {
  const errors: string[] = [];
  if (!entry.date || !parseISODate(entry.date)) errors.push('A valid date is required.');
  if (!entry.description || !entry.description.trim()) errors.push('Description is required.');
  if (opts?.checkLock !== false && entry.date && isDateLocked(periods, entry.date)) {
    errors.push(`Period is locked for ${entry.date}. New entries cannot be posted into a locked period.`);
  }
  const lines = entry.lines.filter((l) => l.accountId || (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
  if (lines.length < 2) errors.push('A journal entry needs at least two lines.');
  const byId = new Map(accounts.map((a) => [a.id, a]));
  lines.forEach((l, i) => {
    const n = i + 1;
    const a = byId.get(l.accountId);
    if (!a) { errors.push(`Line ${n}: select an account.`); return; }
    if (!a.postable) errors.push(`Line ${n}: "${a.name}" is a header account and cannot be posted to.`);
    if (a.status !== 'active') errors.push(`Line ${n}: "${a.name}" is archived.`);
    const d = l.debit || 0;
    const c = l.credit || 0;
    if (d < 0 || c < 0) errors.push(`Line ${n}: negative amounts are not allowed — use the opposite side.`);
    if (d !== 0 && c !== 0) errors.push(`Line ${n}: enter either a debit or a credit, not both.`);
    if (d === 0 && c === 0) errors.push(`Line ${n}: enter a debit or credit amount.`);
  });
  const t = entryTotals({ ...entry, lines } as JournalEntry);
  if (t.diff !== 0) {
    errors.push(
      `Entry is out of balance by ${Math.abs(t.diff).toLocaleString('en-PK', { minimumFractionDigits: 2 })}. Total debits must equal total credits.`,
    );
  }
  return { ok: errors.length === 0, errors };
}

export function validateTrialBalance(totalDebit: number, totalCredit: number): ValidationResult {
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  return diff === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors: [`Trial balance is out of balance by ${Math.abs(diff).toLocaleString('en-PK', { minimumFractionDigits: 2 })}.`] };
}

export function validateBalanceSheet(totalAssets: number, totalEquityAndLiabilities: number): ValidationResult {
  const diff = Math.round((totalAssets - totalEquityAndLiabilities) * 100) / 100;
  return diff === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors: [`Balance sheet does not balance — difference ${Math.abs(diff).toLocaleString('en-PK', { minimumFractionDigits: 2 })}.`] };
}

export function validateSubledgerReconciliation(
  label: string,
  subTotal: number,
  controlBalance: number,
): ValidationResult {
  const diff = Math.round((subTotal - controlBalance) * 100) / 100;
  return diff === 0
    ? { ok: true, errors: [] }
    : {
        ok: false,
        errors: [
          `${label} subledger (${subTotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })}) does not reconcile to the control account (${controlBalance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}) — difference ${Math.abs(diff).toLocaleString('en-PK', { minimumFractionDigits: 2 })}.`,
        ],
      };
}

export function validateAccount(a: Partial<Account>, existing: Account[]): ValidationResult {
  const errors: string[] = [];
  if (!a.code || !a.code.trim()) errors.push('Account code is required.');
  if (!a.name || !a.name.trim()) errors.push('Account name is required.');
  if (existing.some((e) => e.id !== a.id && e.code === a.code?.trim())) errors.push(`Account code "${a.code}" already exists.`);
  return { ok: errors.length === 0, errors };
}

export function validatePeriodLock(periods: FiscalPeriod[], date: string): ValidationResult {
  return isDateLocked(periods, date)
    ? { ok: false, errors: [`${date} falls in a locked period.`] }
    : { ok: true, errors: [] };
}

/** CSV import: group rows by entry number and validate each balanced group. */
export interface ImportRow {
  line: number;
  date: string;
  entryNumber: string;
  reference: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
}

export function validateImportGroups(
  rows: ImportRow[],
  accounts: Account[],
): { ok: boolean; errors: string[]; groups: ImportRow[][] } {
  const errors: string[] = [];
  const byCode = new Map(accounts.filter((a) => a.postable).map((a) => [a.code, a]));
  const seen = new Set<string>();
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    if (!parseISODate(r.date)) errors.push(`Row ${r.line}: invalid date "${r.date}".`);
    if (!r.entryNumber) errors.push(`Row ${r.line}: entry number is required.`);
    const a = byCode.get(r.accountCode);
    if (!a) errors.push(`Row ${r.line}: unknown or non-postable account code "${r.accountCode}".`);
    if (!(r.debit >= 0) || !(r.credit >= 0)) errors.push(`Row ${r.line}: debit/credit must be non-negative numbers.`);
    if (r.debit > 0 && r.credit > 0) errors.push(`Row ${r.line}: debit and credit cannot both be set.`);
    const key = `${r.entryNumber}||${r.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
    void seen;
  }
  const groupList: ImportRow[][] = [];
  for (const [key, g] of groups) {
    const d = g.reduce((t, r) => t + r.debit, 0);
    const c = g.reduce((t, r) => t + r.credit, 0);
    if (Math.round((d - c) * 100) !== 0) {
      errors.push(`Entry "${g[0].entryNumber}": debits (${d}) do not equal credits (${c}).`);
    }
    groupList.push(g);
    void key;
  }
  return { ok: errors.length === 0, errors, groups: groupList };
}
