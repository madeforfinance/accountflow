/* Central accounting calculation engine — pure functions, no DOM.
   Journal (posted) -> balances -> ledger / trial balance / statements.
   Single source of truth: nothing is stored pre-calculated. */

import {
  Account, JournalEntry, JournalLine, EntryKind, EntryStatus, FiscalPeriod,
} from './types';
import { signedBalance, tbSide } from './chart';
import { round2 } from '../lib/format';

export interface BalanceFilter {
  from?: string;          // YYYY-MM-DD inclusive
  to?: string;            // YYYY-MM-DD inclusive
  kinds?: EntryKind[];
  excludeKinds?: EntryKind[];
  statuses?: EntryStatus[];
}

export interface AccountSums { debit: number; credit: number; }

const POSTED: EntryStatus[] = ['posted'];

export function entryTotals(entry: JournalEntry): { debit: number; credit: number; diff: number } {
  let debit = 0;
  let credit = 0;
  for (const l of entry.lines) {
    debit = round2(debit + (l.debit || 0));
    credit = round2(credit + (l.credit || 0));
  }
  return { debit, credit, diff: round2(debit - credit) };
}

function entryMatches(e: JournalEntry, f: BalanceFilter): boolean {
  const statuses = f.statuses ?? POSTED;
  if (!statuses.includes(e.status)) return false;
  if (f.from && e.date < f.from) return false;
  if (f.to && e.date > f.to) return false;
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.excludeKinds && f.excludeKinds.includes(e.kind)) return false;
  return true;
}

/** Sum debits/credits per account across matching entries. One pass — O(lines). */
export function sumPostings(
  entries: JournalEntry[],
  f: BalanceFilter,
): Map<string, AccountSums> {
  const out = new Map<string, AccountSums>();
  for (const e of entries) {
    if (!entryMatches(e, f)) continue;
    for (const l of e.lines) {
      let s = out.get(l.accountId);
      if (!s) { s = { debit: 0, credit: 0 }; out.set(l.accountId, s); }
      s.debit = round2(s.debit + (l.debit || 0));
      s.credit = round2(s.credit + (l.credit || 0));
    }
  }
  return out;
}

export function mergeSums(a: Map<string, AccountSums>, b: Map<string, AccountSums>): Map<string, AccountSums> {
  const out = new Map<string, AccountSums>();
  for (const [k, v] of a) out.set(k, { debit: v.debit, credit: v.credit });
  for (const [k, v] of b) {
    const s = out.get(k) ?? { debit: 0, credit: 0 };
    out.set(k, { debit: round2(s.debit + v.debit), credit: round2(s.credit + v.credit) });
  }
  return out;
}

/** Signed movement of an account over the filter period (positive = normal direction). */
export function movementOf(account: Account, sums: Map<string, AccountSums>): number {
  const s = sums.get(account.id);
  if (!s) return 0;
  return round2(signedBalance(account, s.debit, s.credit));
}

/* ---------------- General ledger / account ledger ---------------- */

export interface LedgerRow {
  date: string;
  entryNo: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  running: number;
}

export interface AccountLedger {
  account: Account;
  opening: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export function ledgerForAccount(
  account: Account,
  entries: JournalEntry[],
  from: string,
  to: string,
  excludeKinds?: EntryKind[],
): AccountLedger {
  const openingSums = sumPostings(entries, { to: dayBefore(from), excludeKinds, statuses: POSTED });
  const opening = movementOf(account, openingSums);
  const rows: LedgerRow[] = [];
  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const sorted = entries
    .filter((e) => entryMatches(e, { from, to, excludeKinds, statuses: POSTED }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.entryNo < b.entryNo ? -1 : 1));
  for (const e of sorted) {
    for (const l of e.lines) {
      if (l.accountId !== account.id) continue;
      const d = l.debit || 0;
      const c = l.credit || 0;
      totalDebit = round2(totalDebit + d);
      totalCredit = round2(totalCredit + c);
      running = round2(running + signedBalance(account, d, c));
      rows.push({
        date: e.date, entryNo: e.entryNo, reference: e.reference,
        description: l.description || e.description, debit: d, credit: c, running,
      });
    }
  }
  return { account, opening, rows, totalDebit, totalCredit, closing: running };
}

export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/* ---------------- Trial balance ---------------- */

export interface TBRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TBRow[];
  totalDebit: number;
  totalCredit: number;
  diff: number;
  balanced: boolean;
}

export function trialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  asOf: string,
  opts?: { includeZero?: boolean; excludeKinds?: EntryKind[] },
): TrialBalance {
  const sums = sumPostings(entries, { to: asOf, excludeKinds: opts?.excludeKinds, statuses: POSTED });
  const rows: TBRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const a of accounts) {
    if (!a.postable || a.status !== 'active') continue;
    const s = sums.get(a.id);
    if (!s) {
      if (opts?.includeZero) rows.push({ account: a, debit: 0, credit: 0 });
      continue;
    }
    const { debit, credit } = tbSide(a, s.debit, s.credit);
    if (!opts?.includeZero && debit === 0 && credit === 0) continue;
    rows.push({ account: a, debit, credit });
    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
  }
  rows.sort((x, y) => (x.account.code < y.account.code ? -1 : 1));
  const diff = round2(totalDebit - totalCredit);
  return { rows, totalDebit, totalCredit, diff, balanced: diff === 0 };
}

export interface AdjustedTBRow {
  account: Account;
  unadjDebit: number; unadjCredit: number;
  adjDebit: number; adjCredit: number;
  debit: number; credit: number;
}

export interface AdjustedTrialBalance {
  rows: AdjustedTBRow[];
  totalUnadjDebit: number; totalUnadjCredit: number;
  totalAdjDebit: number; totalAdjCredit: number;
  totalDebit: number; totalCredit: number;
  balanced: boolean;
}

/** Adjusted TB: unadjusted (everything except adjustments & closing) + adjusting entries. */
export function adjustedTrialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  asOf: string,
  includeZero = false,
): AdjustedTrialBalance {
  const unadj = sumPostings(entries, { to: asOf, excludeKinds: ['adjustment', 'closing'], statuses: POSTED });
  const adj = sumPostings(entries, { to: asOf, kinds: ['adjustment'], statuses: POSTED });
  const rows: AdjustedTBRow[] = [];
  let tUD = 0, tUC = 0, tAD = 0, tAC = 0, tD = 0, tC = 0;
  for (const a of accounts) {
    if (!a.postable || a.status !== 'active') continue;
    const u = unadj.get(a.id);
    const j = adj.get(a.id);
    const us = u ? tbSide(a, u.debit, u.credit) : { debit: 0, credit: 0 };
    const js = j ? tbSide(a, j.debit, j.credit) : { debit: 0, credit: 0 };
    const both = mergeSums(
      u ? new Map([[a.id, u]]) : new Map(),
      j ? new Map([[a.id, j]]) : new Map(),
    );
    const bs = both.get(a.id);
    const tot = bs ? tbSide(a, bs.debit, bs.credit) : { debit: 0, credit: 0 };
    if (!includeZero && us.debit === 0 && us.credit === 0 && js.debit === 0 && js.credit === 0) continue;
    rows.push({ account: a, unadjDebit: us.debit, unadjCredit: us.credit, adjDebit: js.debit, adjCredit: js.credit, debit: tot.debit, credit: tot.credit });
    tUD = round2(tUD + us.debit); tUC = round2(tUC + us.credit);
    tAD = round2(tAD + js.debit); tAC = round2(tAC + js.credit);
    tD = round2(tD + tot.debit); tC = round2(tC + tot.credit);
  }
  rows.sort((x, y) => (x.account.code < y.account.code ? -1 : 1));
  return {
    rows, totalUnadjDebit: tUD, totalUnadjCredit: tUC, totalAdjDebit: tAD, totalAdjCredit: tAC,
    totalDebit: tD, totalCredit: tC, balanced: round2(tD - tC) === 0,
  };
}

/* ---------------- Income statement ---------------- */

export interface ISLine { account: Account; amount: number; }
export interface IncomeStatement {
  revenue: ISLine[]; totalRevenue: number;
  costOfSales: ISLine[]; totalCostOfSales: number;
  grossProfit: number;
  expenses: ISLine[]; totalExpenses: number;
  operatingProfit: number;
  otherIncome: ISLine[]; totalOtherIncome: number;
  otherExpenses: ISLine[]; totalOtherExpenses: number;
  profitBeforeTax: number;
  taxExpense: number;
  netProfit: number;
}

export function incomeStatement(
  accounts: Account[],
  entries: JournalEntry[],
  from: string,
  to: string,
): IncomeStatement {
  // Closing entries are a post-statement step and opening balances are not
  // period performance — statements are prepared pre-closing from in-period entries.
  const sums = sumPostings(entries, { from, to, excludeKinds: ['closing', 'opening'], statuses: POSTED });
  // P&L direction: revenue presented as credits - debits so contra-revenue
  // (sales returns, discounts — debit-normal) naturally subtracts.
  const plAmount = (a: Account): number => {
    const s = sums.get(a.id);
    if (!s) return 0;
    return a.type === 'Revenue' || a.type === 'OtherIncome'
      ? round2(s.credit - s.debit)
      : round2(s.debit - s.credit);
  };
  const line = (a: Account): ISLine => ({ account: a, amount: plAmount(a) });
  const ofType = (t: Account['type']) => accounts.filter((a) => a.type === t && a.postable && a.status === 'active');
  const revenue = ofType('Revenue').map(line).filter((l) => l.amount !== 0);
  const costOfSales = ofType('CostOfSales').map(line).filter((l) => l.amount !== 0);
  const expenses = ofType('Expense').map(line).filter((l) => l.amount !== 0);
  const otherIncome = ofType('OtherIncome').map(line).filter((l) => l.amount !== 0);
  const otherExpensesAll = ofType('OtherExpense').map(line).filter((l) => l.amount !== 0);
  const sum = (ls: ISLine[]) => round2(ls.reduce((t, l) => t + l.amount, 0));
  const totalRevenue = sum(revenue);
  const totalCostOfSales = sum(costOfSales);
  const grossProfit = round2(totalRevenue - totalCostOfSales);
  const totalExpenses = sum(expenses);
  const operatingProfit = round2(grossProfit - totalExpenses);
  const totalOtherIncome = sum(otherIncome);
  // Income tax expense sits inside OtherExpense but is presented below profit-before-tax.
  const taxLines = otherExpensesAll.filter((l) => l.account.subtype === 'Tax');
  const otherExpenses = otherExpensesAll.filter((l) => l.account.subtype !== 'Tax');
  const totalOtherExpenses = sum(otherExpenses);
  const taxExpense = sum(taxLines);
  const profitBeforeTax = round2(operatingProfit + totalOtherIncome - totalOtherExpenses);
  const netProfit = round2(profitBeforeTax - taxExpense);
  return {
    revenue, totalRevenue, costOfSales, totalCostOfSales, grossProfit,
    expenses, totalExpenses, operatingProfit, otherIncome, totalOtherIncome,
    otherExpenses: [...otherExpenses, ...taxLines], totalOtherExpenses: round2(totalOtherExpenses + taxExpense),
    profitBeforeTax, taxExpense, netProfit,
  };
}

/* ---------------- Balance sheet ---------------- */

function bsBucket(accounts: Account[], account: Account): 'current' | 'nonCurrent' | null {
  if (account.type !== 'Asset' && account.type !== 'Liability') return null;
  let cur: Account | undefined = account;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  while (cur) {
    if (cur.code === '1100' || cur.code === '2100') return 'current';
    if (cur.code === '1200' || cur.code === '2200') return 'nonCurrent';
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return account.type === 'Asset' ? 'nonCurrent' : 'current';
}

export interface BSLine { account: Account; amount: number; }
export interface BalanceSheet {
  currentAssets: BSLine[]; totalCurrentAssets: number;
  nonCurrentAssets: BSLine[]; totalNonCurrentAssets: number;
  totalAssets: number;
  shareCapital: number; retainedEarnings: number; currentYearProfit: number; drawings: number;
  equityLines: { label: string; amount: number }[];
  totalEquity: number;
  currentLiabilities: BSLine[]; totalCurrentLiabilities: number;
  nonCurrentLiabilities: BSLine[]; totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquityAndLiabilities: number;
  balanced: boolean;
  diff: number;
}

export function balanceSheet(
  accounts: Account[],
  entries: JournalEntry[],
  asOf: string,
  fyStart: string,
): BalanceSheet {
  const sums = sumPostings(entries, { to: asOf, excludeKinds: ['closing'], statuses: POSTED });
  const amt = (a: Account) => movementOf(a, sums);
  const postable = accounts.filter((a) => a.postable && a.status === 'active');
  const currentAssets: BSLine[] = [];
  const nonCurrentAssets: BSLine[] = [];
  const currentLiabilities: BSLine[] = [];
  const nonCurrentLiabilities: BSLine[] = [];
  for (const a of postable) {
    const v = amt(a);
    if (v === 0) continue;
    const line = { account: a, amount: v };
    if (a.type === 'Asset') (bsBucket(accounts, a) === 'current' ? currentAssets : nonCurrentAssets).push(line);
    else if (a.type === 'Liability') (bsBucket(accounts, a) === 'current' ? currentLiabilities : nonCurrentLiabilities).push(line);
  }
  const sum = (ls: BSLine[]) => round2(ls.reduce((t, l) => t + l.amount, 0));
  const totalCurrentAssets = sum(currentAssets);
  const totalNonCurrentAssets = sum(nonCurrentAssets);
  const totalAssets = round2(totalCurrentAssets + totalNonCurrentAssets);

  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const at = (code: string) => { const a = byCode.get(code); return a ? amt(a) : 0; };
  const shareCapital = at('3100');
  const retainedEarnings = at('3200');
  const drawings = at('3400');
  // Current-year profit = income statement from FY start to as-of (pre-closing).
  const is = incomeStatement(accounts, entries, fyStart, asOf);
  const currentYearProfit = is.netProfit;
  const equityLines = [
    { label: byCode.get('3100')?.name ?? 'Share Capital', amount: shareCapital },
    { label: byCode.get('3200')?.name ?? 'Retained Earnings', amount: retainedEarnings },
    { label: byCode.get('3300')?.name ?? 'Current Year Profit', amount: currentYearProfit },
    { label: byCode.get('3400')?.name ?? "Owner's Drawings", amount: -drawings },
  ];
  const totalEquity = round2(shareCapital + retainedEarnings + currentYearProfit - drawings);
  const totalCurrentLiabilities = sum(currentLiabilities);
  const totalNonCurrentLiabilities = sum(nonCurrentLiabilities);
  const totalLiabilities = round2(totalCurrentLiabilities + totalNonCurrentLiabilities);
  const totalEquityAndLiabilities = round2(totalEquity + totalLiabilities);
  const diff = round2(totalAssets - totalEquityAndLiabilities);
  return {
    currentAssets, totalCurrentAssets, nonCurrentAssets, totalNonCurrentAssets, totalAssets,
    shareCapital, retainedEarnings, currentYearProfit, drawings, equityLines, totalEquity,
    currentLiabilities, totalCurrentLiabilities, nonCurrentLiabilities, totalNonCurrentLiabilities,
    totalLiabilities, totalEquityAndLiabilities, balanced: diff === 0, diff,
  };
}

/* ---------------- Cash flow (indirect) ---------------- */

export interface CFLine { label: string; amount: number; detail?: string; }
export interface CashFlowStatement {
  netProfit: number;
  operatingAdjustments: CFLine[];
  netOperating: number;
  investing: CFLine[];
  netInvesting: number;
  financing: CFLine[];
  netFinancing: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  reconciled: boolean;
  diff: number;
}

const CASH_CODES = new Set(['1110', '1120']);

export function cashFlow(
  accounts: Account[],
  entries: JournalEntry[],
  from: string,
  to: string,
  fyStart: string,
): CashFlowStatement {
  // Period movements exclude opening balances (not period cash flows) and closing entries.
  const sums = sumPostings(entries, { from, to, excludeKinds: ['closing', 'opening'], statuses: POSTED });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const is = incomeStatement(accounts, entries, from, to);
  const netProfit = is.netProfit;

  const operatingAdjustments: CFLine[] = [];
  // non-cash expenses added back
  for (const a of accounts) {
    if (!a.nonCash || a.status !== 'active') continue;
    const m = movementOf(a, sums);
    if (m !== 0) operatingAdjustments.push({ label: `Add back: ${a.name}`, amount: m });
  }
  // working capital changes (excluding cash itself)
  for (const a of accounts) {
    if (a.cashFlowClass !== 'operating' || CASH_CODES.has(a.code) || a.status !== 'active') continue;
    if (!a.postable) continue;
    const m = movementOf(a, sums);
    if (m === 0) continue;
    const adj = a.normalBalance === 'credit' ? m : -m;
    const what = m > 0 ? 'Increase' : 'Decrease';
    operatingAdjustments.push({
      label: `${what} in ${a.name.toLowerCase()}`,
      amount: adj,
    });
  }
  const netOperating = round2(netProfit + operatingAdjustments.reduce((t, l) => t + l.amount, 0));

  // investing: capex from PPE/intangibles + disposal proceeds
  const investing: CFLine[] = [];
  for (const code of ['1210', '1230']) {
    const a = byCode.get(code);
    if (!a) continue;
    const s = sums.get(a.id);
    if (!s) continue;
    const additions = s.debit; // Dr postings = additions
    const derecognized = s.credit; // Cr postings = cost derecognized (disposals)
    if (additions !== 0) investing.push({ label: `Purchase of ${a.name.toLowerCase()}`, amount: -additions });
    if (derecognized !== 0) {
      // proceeds = cash/bank debits in the same entries that credit this asset
      let proceeds = 0;
      for (const e of entries) {
        if (!entryMatches(e, { from, to, excludeKinds: ['closing'], statuses: POSTED })) continue;
        const creditsAsset = e.lines.some((l) => l.accountId === a.id && (l.credit || 0) > 0);
        if (!creditsAsset) continue;
        for (const l of e.lines) {
          const la = byId.get(l.accountId);
          if (la && CASH_CODES.has(la.code)) proceeds = round2(proceeds + (l.debit || 0));
        }
      }
      if (proceeds !== 0) investing.push({ label: `Proceeds from disposal of ${a.name.toLowerCase()}`, amount: proceeds });
    }
  }
  const netInvesting = round2(investing.reduce((t, l) => t + l.amount, 0));

  // financing
  const financing: CFLine[] = [];
  for (const a of accounts) {
    if (a.cashFlowClass !== 'financing' || a.status !== 'active' || !a.postable) continue;
    const m = movementOf(a, sums);
    if (m === 0) continue;
    const adj = a.normalBalance === 'credit' ? m : -m;
    financing.push({ label: `${a.name} — net ${adj > 0 ? 'inflow' : 'outflow'}`, amount: adj });
  }
  const netFinancing = round2(financing.reduce((t, l) => t + l.amount, 0));

  const netChange = round2(netOperating + netInvesting + netFinancing);

  const cashTotal = (s: Map<string, AccountSums>) => {
    let t = 0;
    for (const code of CASH_CODES) {
      const a = byCode.get(code);
      if (a) t = round2(t + movementOf(a, s));
    }
    return t;
  };
  // Opening cash = balance before `from`, plus any opening-balance entry dated exactly `from`
  // (the opening entry represents balances at the start of the period, not a period cash flow).
  const openingCash = round2(
    cashTotal(sumPostings(entries, { to: dayBefore(from), excludeKinds: ['closing'], statuses: POSTED })) +
    cashTotal(sumPostings(entries, { from, to: from, kinds: ['opening'], statuses: POSTED })),
  );
  const closingCash = cashTotal(sumPostings(entries, { to, excludeKinds: ['closing'], statuses: POSTED }));
  const diff = round2(netChange - (closingCash - openingCash));
  void fyStart;
  return {
    netProfit, operatingAdjustments, netOperating, investing, netInvesting,
    financing, netFinancing, netChange, openingCash, closingCash,
    reconciled: diff === 0, diff,
  };
}

/* ---------------- Statement of changes in equity ---------------- */

export interface EquityRow {
  label: string;
  opening: number;
  movement: number;
  closing: number;
}

export interface ChangesInEquity {
  rows: EquityRow[];
  totals: { opening: number; movement: number; closing: number };
  from: string;
  to: string;
}

export function changesInEquity(
  accounts: Account[],
  entries: JournalEntry[],
  from: string,
  to: string,
  fyStart: string,
): ChangesInEquity {
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const val = (code: string, f: BalanceFilter) => {
    const a = byCode.get(code);
    if (!a) return 0;
    return movementOf(a, sumPostings(entries, { ...f, statuses: POSTED, excludeKinds: ['closing'] }));
  };
  const profitBetween = (f: string, t: string) => incomeStatement(accounts, entries, f, t).netProfit;
  const before = dayBefore(from);
  const rows: EquityRow[] = [
    {
      label: 'Share Capital',
      opening: val('3100', { to: before }),
      movement: val('3100', { from, to }),
      closing: val('3100', { to }),
    },
    {
      label: 'Retained Earnings',
      opening: val('3200', { to: before }),
      movement: val('3200', { from, to }),
      closing: val('3200', { to }),
    },
    {
      label: 'Current Year Profit',
      opening: from > fyStart ? profitBetween(fyStart, before) : 0,
      movement: profitBetween(from, to),
      closing: profitBetween(fyStart, to),
    },
    {
      label: "Owner's Drawings",
      opening: -val('3400', { to: before }),
      movement: -val('3400', { from, to }),
      closing: -val('3400', { to }),
    },
  ];
  const totals = {
    opening: round2(rows.reduce((t, r) => t + r.opening, 0)),
    movement: round2(rows.reduce((t, r) => t + r.movement, 0)),
    closing: round2(rows.reduce((t, r) => t + r.closing, 0)),
  };
  return { rows, totals, from, to };
}

/* ---------------- Subledgers ---------------- */

export interface SubledgerRow {
  contactId: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export function subledger(
  entries: JournalEntry[],
  account: Account,
  from: string,
  to: string,
): SubledgerRow[] {
  const acc = new Map<string, SubledgerRow>();
  const bump = (id: string, d: number, c: number, opening: boolean) => {
    let r = acc.get(id);
    if (!r) { r = { contactId: id, opening: 0, debit: 0, credit: 0, closing: 0 }; acc.set(id, r); }
    if (opening) r.opening = round2(r.opening + signedBalance(account, d, c));
    else { r.debit = round2(r.debit + d); r.credit = round2(r.credit + c); }
  };
  for (const e of entries) {
    if (e.status !== 'posted') continue;
    if (e.date > to) continue;
    for (const l of e.lines) {
      if (l.accountId !== account.id || !l.contactId) continue;
      bump(l.contactId, l.debit || 0, l.credit || 0, e.date < from);
    }
  }
  const rows: SubledgerRow[] = [];
  for (const r of acc.values()) {
    r.closing = round2(r.opening + signedBalance(account, r.debit, r.credit));
    rows.push(r);
  }
  rows.sort((a, b) => (a.contactId < b.contactId ? -1 : 1));
  return rows;
}

export function reconcileSubledger(
  subRows: SubledgerRow[],
  controlClosing: number,
): { subTotal: number; control: number; diff: number; reconciled: boolean } {
  const subTotal = round2(subRows.reduce((t, r) => t + r.closing, 0));
  const diff = round2(subTotal - controlClosing);
  return { subTotal, control: controlClosing, diff, reconciled: diff === 0 };
}

/* ---------------- Reversal ---------------- */

export function buildReversal(
  original: JournalEntry,
  newEntryNo: string,
  date: string,
  makeId: (p: string) => string,
  now: string,
): JournalEntry {
  return {
    id: makeId('je_'),
    entryNo: newEntryNo,
    kind: original.kind,
    date,
    reference: `REV-${original.reference || original.entryNo}`,
    description: `Reversal of ${original.entryNo} — ${original.description}`,
    source: original.source,
    memo: `Reverses ${original.entryNo}`,
    lines: original.lines.map((l) => ({
      id: makeId('jl_'),
      accountId: l.accountId,
      accountCode: l.accountCode,
      description: l.description,
      debit: l.credit,
      credit: l.debit,
      contactId: l.contactId,
      contactKind: l.contactKind,
      project: l.project,
    })),
    status: 'posted',
    reverses: original.id,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------------- Period locking ---------------- */

export function periodForDate(periods: FiscalPeriod[], date: string): FiscalPeriod | undefined {
  return periods.find((p) => date >= p.start && date <= p.end);
}

export function isDateLocked(periods: FiscalPeriod[], date: string): boolean {
  const p = periodForDate(periods, date);
  return !!p?.locked;
}

/* ---------------- Misc helpers ---------------- */

export function accountLabel(a: Account, showCode: boolean): string {
  return showCode ? `${a.code} — ${a.name}` : a.name;
}

export interface AccountNode extends Account {
  children: AccountNode[];
  depth: number;
}

export function accountTree(accounts: Account[]): AccountNode[] {
  const map = new Map<string, AccountNode>();
  for (const a of accounts) map.set(a.id, { ...a, children: [], depth: 0 });
  const roots: AccountNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      const p = map.get(n.parentId)!;
      n.depth = p.depth + 1;
      p.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const sortAll = (ns: AccountNode[]) => {
    ns.sort((x, y) => (x.code < y.code ? -1 : 1));
    ns.forEach((n) => sortAll(n.children));
  };
  sortAll(roots);
  return roots;
}

/** Flatten tree for indented selects. */
export function flatAccounts(accounts: Account[]): { account: Account; indent: number }[] {
  const out: { account: Account; indent: number }[] = [];
  const walk = (ns: AccountNode[]) => {
    for (const n of ns) {
      out.push({ account: n, indent: n.depth });
      walk(n.children);
    }
  };
  walk(accountTree(accounts));
  return out;
}
