import React, { useRef, useState } from 'react';
import { FileOutput } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Btn, Field, Select } from '../components/ui';
import { useDateRange, DateRangeControl, AsOfControl, ExportButtons, AccountSelect, LoadingCard } from '../components/acct';
import { ReportShell, ReportHeader, ReportFooter, ReportTable, RptCol, RptRowKind, periodLabel, asOfLabel } from '../components/report';
import {
  ledgerForAccount, trialBalance, adjustedTrialBalance, incomeStatement,
  balanceSheet, cashFlow, changesInEquity, subledger, reconcileSubledger, flatAccounts,
} from '../accounting/engine';
import { ENTRY_KINDS, Account, CompanySettings } from '../accounting/types';
import { AccountingSnapshot } from '../accounting/data';
import { fmtDate, fmtMoneyFull, todayISO } from '../lib/format';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { exportReportPdf, PdfColumn, PdfRow } from '../lib/reportPdf';
import { toast } from '../lib/toast';

type ReportId =
  | 'journal' | 'general-ledger' | 'account-ledger' | 'trial-balance' | 'adjusted-trial-balance'
  | 'income-statement' | 'balance-sheet' | 'cash-flow' | 'changes-in-equity'
  | 'chart-of-accounts' | 'customers' | 'vendors';

const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'general-ledger', label: 'General Ledger' },
  { id: 'account-ledger', label: 'Account Ledger' },
  { id: 'trial-balance', label: 'Trial Balance' },
  { id: 'adjusted-trial-balance', label: 'Adjusted Trial Balance' },
  { id: 'income-statement', label: 'Income Statement' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'changes-in-equity', label: 'Changes in Equity' },
  { id: 'chart-of-accounts', label: 'Chart of Accounts' },
  { id: 'customers', label: 'Customers' },
  { id: 'vendors', label: 'Vendors' },
];

const FLOW: ReportId[] = ['journal', 'general-ledger', 'income-statement', 'cash-flow', 'changes-in-equity'];
const POSITION: ReportId[] = ['trial-balance', 'adjusted-trial-balance', 'balance-sheet'];
const NEEDS_ACCOUNT: ReportId[] = ['account-ledger'];

const KIND_LABEL = new Map(ENTRY_KINDS.map((k) => [k.value, k.label]));
const TYPE_LABEL: Record<string, string> = {
  Asset: 'Asset', Liability: 'Liability', Equity: 'Equity', Revenue: 'Revenue',
  CostOfSales: 'Cost of Sales', Expense: 'Expense', OtherIncome: 'Other Income', OtherExpense: 'Other Expense',
};

/* ---------- internal row builder ---------- */
interface BRow { kind: RptRowKind; disp: string[]; csv: unknown[]; indent?: number }

interface BuiltReport {
  title: string;
  period: string;
  orientation: 'portrait' | 'landscape';
  columns: PdfColumn[];
  pdfRows: PdfRow[];
  tableCols: RptCol[];
  tableRows: { kind: RptRowKind; cells: React.ReactNode[] }[];
  csvHeaders: string[];
  csvRows: unknown[][];
  filename: string;
  rowCount: number;
}

function buildReport(
  id: ReportId,
  snap: AccountingSnapshot,
  settings: CompanySettings,
  ctx: { from: string; to: string; asOf: string; accountId: string },
): BuiltReport | null {
  const { accounts } = snap;
  const posted = snap.entries.filter((e) => e.status === 'posted');
  const { from, to, asOf } = ctx;
  const M = (n: number) => fmtMoneyFull(n);
  const accById = new Map(accounts.map((a) => [a.id, a]));

  const mk = (
    title: string, period: string, orientation: 'portrait' | 'landscape',
    columns: PdfColumn[], rows: BRow[], csvHeaders: string[],
  ): BuiltReport => {
    const pdfRows: PdfRow[] = rows.map((r) => ({
      cells: r.disp,
      bold: r.kind !== 'data' && r.kind !== 'note',
      section: r.kind === 'section',
      grand: r.kind === 'grand',
      ruleAbove: r.kind === 'total',
      indent: r.indent,
    }));
    return {
      title, period, orientation, columns, pdfRows,
      tableCols: columns.map((c) => ({ label: c.label, align: c.align })),
      tableRows: rows.map((r) => ({ kind: r.kind, cells: r.disp })),
      csvHeaders, csvRows: rows.map((r) => r.csv),
      filename: `${id}-${todayISO()}`,
      rowCount: rows.length,
    };
  };
  const R = (kind: RptRowKind, disp: string[], csv: unknown[], indent?: number): BRow => ({ kind, disp, csv, indent });

  /* ---------------- journal ---------------- */
  if (id === 'journal') {
    const rows: BRow[] = [];
    for (const e of posted) {
      if (e.date < from || e.date > to) continue;
      for (const l of e.lines) {
        const a = accById.get(l.accountId);
        rows.push(R('data',
          [fmtDate(e.date), e.entryNo, e.reference, KIND_LABEL.get(e.kind) ?? e.kind, e.description, l.accountCode, a?.name ?? '', M(l.debit), M(l.credit), e.status],
          [e.date, e.entryNo, e.reference, KIND_LABEL.get(e.kind) ?? e.kind, e.description, l.accountCode, a?.name ?? '', l.debit, l.credit, e.status]));
      }
    }
    return mk('Journal', periodLabel(from, to), 'landscape', [
      { label: 'Date', width: 0.08 }, { label: 'Entry No', width: 0.09 }, { label: 'Reference', width: 0.08 },
      { label: 'Kind', width: 0.08 }, { label: 'Description', width: 0.18 }, { label: 'Code', width: 0.06 },
      { label: 'Account', width: 0.13 }, { label: 'Debit', align: 'r', width: 0.10 },
      { label: 'Credit', align: 'r', width: 0.10 }, { label: 'Status', width: 0.10 },
    ], rows, ['Date', 'Entry No', 'Reference', 'Kind', 'Description', 'Account Code', 'Account', 'Debit', 'Credit', 'Status']);
  }

  /* ---------------- ledgers ---------------- */
  const ledgerCols: PdfColumn[] = [
    { label: 'Date', width: 0.10 }, { label: 'Entry No', width: 0.11 }, { label: 'Reference', width: 0.10 },
    { label: 'Description', width: 0.29 }, { label: 'Debit', align: 'r', width: 0.13 },
    { label: 'Credit', align: 'r', width: 0.13 }, { label: 'Balance', align: 'r', width: 0.14 },
  ];
  const ledgerHeaders = ['Date', 'Entry No', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
  const ledgerRows = (account: Account): BRow[] => {
    const led = ledgerForAccount(account, posted, from, to);
    const rows: BRow[] = [];
    rows.push(R('data', ['', '', '', 'Opening balance', '', '', M(led.opening)], ['', '', '', 'Opening balance', '', '', led.opening]));
    for (const r of led.rows) {
      rows.push(R('data',
        [fmtDate(r.date), r.entryNo, r.reference, r.description, M(r.debit), M(r.credit), M(r.running)],
        [r.date, r.entryNo, r.reference, r.description, r.debit, r.credit, r.running]));
    }
    rows.push(R('total', ['', '', '', 'Totals', M(led.totalDebit), M(led.totalCredit), ''], ['', '', '', 'Totals', led.totalDebit, led.totalCredit, '']));
    rows.push(R('grand', ['', '', '', 'Closing balance', '', '', M(led.closing)], ['', '', '', 'Closing balance', '', '', led.closing]));
    return rows;
  };

  if (id === 'account-ledger') {
    const account = accById.get(ctx.accountId);
    if (!account) return null;
    return mk(
      `Account Ledger — ${account.code} ${account.name}`, periodLabel(from, to), 'landscape',
      ledgerCols, ledgerRows(account), ledgerHeaders,
    );
  }

  if (id === 'general-ledger') {
    const rows: BRow[] = [];
    for (const a of accounts) {
      if (!a.postable || a.status !== 'active') continue;
      const led = ledgerForAccount(a, posted, from, to);
      if (led.rows.length === 0 && led.opening === 0 && !settings.showZeroBalances) continue;
      rows.push(R('section', [`${a.code} — ${a.name}`, '', '', '', '', '', ''], [`${a.code} — ${a.name}`, '', '', '', '', '', '']));
      rows.push(...ledgerRows(a));
    }
    return mk('General Ledger', periodLabel(from, to), 'landscape', ledgerCols, rows, ledgerHeaders);
  }

  /* ---------------- trial balance ---------------- */
  if (id === 'trial-balance') {
    const tb = trialBalance(accounts, posted, asOf, { includeZero: settings.showZeroBalances });
    const rows: BRow[] = tb.rows.map((r) => R('data',
      [r.account.code, r.account.name, M(r.debit), M(r.credit)],
      [r.account.code, r.account.name, r.debit, r.credit]));
    rows.push(R('grand', ['', 'Total', M(tb.totalDebit), M(tb.totalCredit)], ['', 'Total', tb.totalDebit, tb.totalCredit]));
    return mk('Trial Balance', asOfLabel(asOf), 'portrait', [
      { label: 'Code', width: 0.15 }, { label: 'Account', width: 0.45 },
      { label: 'Debit', align: 'r', width: 0.20 }, { label: 'Credit', align: 'r', width: 0.20 },
    ], rows, ['Account Code', 'Account Name', 'Debit', 'Credit']);
  }

  /* ---------------- adjusted trial balance ---------------- */
  if (id === 'adjusted-trial-balance') {
    const atb = adjustedTrialBalance(accounts, posted, asOf, settings.showZeroBalances);
    const rows: BRow[] = atb.rows.map((r) => R('data',
      [`${r.account.code} — ${r.account.name}`, M(r.unadjDebit), M(r.unadjCredit), M(r.adjDebit), M(r.adjCredit), M(r.debit), M(r.credit)],
      [r.account.code, r.account.name, r.unadjDebit, r.unadjCredit, r.adjDebit, r.adjCredit, r.debit, r.credit]));
    rows.push(R('grand',
      ['Total', M(atb.totalUnadjDebit), M(atb.totalUnadjCredit), M(atb.totalAdjDebit), M(atb.totalAdjCredit), M(atb.totalDebit), M(atb.totalCredit)],
      ['Total', atb.totalUnadjDebit, atb.totalUnadjCredit, atb.totalAdjDebit, atb.totalAdjCredit, atb.totalDebit, atb.totalCredit]));
    return mk('Adjusted Trial Balance', asOfLabel(asOf), 'landscape', [
      { label: 'Account', width: 0.28 }, { label: 'Unadjusted Debit', align: 'r', width: 0.12 },
      { label: 'Unadjusted Credit', align: 'r', width: 0.12 }, { label: 'Adjustments Debit', align: 'r', width: 0.12 },
      { label: 'Adjustments Credit', align: 'r', width: 0.12 }, { label: 'Adjusted Debit', align: 'r', width: 0.12 },
      { label: 'Adjusted Credit', align: 'r', width: 0.12 },
    ], rows, ['Account Code', 'Account Name', 'Unadjusted Debit', 'Unadjusted Credit', 'Adjustments Debit', 'Adjustments Credit', 'Adjusted Debit', 'Adjusted Credit']);
  }

  /* ---------------- income statement ---------------- */
  if (id === 'income-statement') {
    const is = incomeStatement(accounts, posted, from, to);
    const rows: BRow[] = [];
    const line = (name: string, amount: number) => R('data', [name, M(amount)], [name, amount], 1);
    rows.push(R('section', ['Revenue', ''], ['Revenue', '']));
    is.revenue.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total revenue', M(is.totalRevenue)], ['Total revenue', is.totalRevenue]));
    rows.push(R('section', ['Cost of sales', ''], ['Cost of sales', '']));
    is.costOfSales.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total cost of sales', M(is.totalCostOfSales)], ['Total cost of sales', is.totalCostOfSales]));
    rows.push(R('total', ['Gross profit', M(is.grossProfit)], ['Gross profit', is.grossProfit]));
    rows.push(R('section', ['Operating expenses', ''], ['Operating expenses', '']));
    is.expenses.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total operating expenses', M(is.totalExpenses)], ['Total operating expenses', is.totalExpenses]));
    rows.push(R('total', ['Operating profit', M(is.operatingProfit)], ['Operating profit', is.operatingProfit]));
    rows.push(R('section', ['Other income', ''], ['Other income', '']));
    is.otherIncome.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total other income', M(is.totalOtherIncome)], ['Total other income', is.totalOtherIncome]));
    rows.push(R('section', ['Other expenses', ''], ['Other expenses', '']));
    is.otherExpenses.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total other expenses', M(is.totalOtherExpenses)], ['Total other expenses', is.totalOtherExpenses]));
    rows.push(R('total', ['Profit before tax', M(is.profitBeforeTax)], ['Profit before tax', is.profitBeforeTax]));
    rows.push(R('data', ['Income tax expense', M(is.taxExpense)], ['Income tax expense', is.taxExpense]));
    rows.push(R('grand', ['Net profit for the period', M(is.netProfit)], ['Net profit for the period', is.netProfit]));
    return mk('Statement of Profit or Loss', periodLabel(from, to), 'portrait', [
      { label: 'Account', width: 0.68 }, { label: 'Amount', align: 'r', width: 0.32 },
    ], rows, ['Account', 'Amount']);
  }

  /* ---------------- balance sheet ---------------- */
  if (id === 'balance-sheet') {
    const bs = balanceSheet(accounts, posted, asOf, settings.fiscalYearStart);
    const rows: BRow[] = [];
    const line = (name: string, amount: number) => R('data', [name, M(amount)], [name, amount], 1);
    rows.push(R('section', ['Assets', ''], ['Assets', '']));
    rows.push(R('sub', ['Current assets', ''], ['Current assets', '']));
    bs.currentAssets.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total current assets', M(bs.totalCurrentAssets)], ['Total current assets', bs.totalCurrentAssets]));
    rows.push(R('sub', ['Non-current assets', ''], ['Non-current assets', '']));
    bs.nonCurrentAssets.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total non-current assets', M(bs.totalNonCurrentAssets)], ['Total non-current assets', bs.totalNonCurrentAssets]));
    rows.push(R('total', ['Total assets', M(bs.totalAssets)], ['Total assets', bs.totalAssets]));
    rows.push(R('section', ['Equity', ''], ['Equity', '']));
    bs.equityLines.forEach((l) => rows.push(line(l.label, l.amount)));
    rows.push(R('total', ['Total equity', M(bs.totalEquity)], ['Total equity', bs.totalEquity]));
    rows.push(R('section', ['Liabilities', ''], ['Liabilities', '']));
    rows.push(R('sub', ['Current liabilities', ''], ['Current liabilities', '']));
    bs.currentLiabilities.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total current liabilities', M(bs.totalCurrentLiabilities)], ['Total current liabilities', bs.totalCurrentLiabilities]));
    rows.push(R('sub', ['Non-current liabilities', ''], ['Non-current liabilities', '']));
    bs.nonCurrentLiabilities.forEach((r) => rows.push(line(r.account.name, r.amount)));
    rows.push(R('total', ['Total non-current liabilities', M(bs.totalNonCurrentLiabilities)], ['Total non-current liabilities', bs.totalNonCurrentLiabilities]));
    rows.push(R('total', ['Total liabilities', M(bs.totalLiabilities)], ['Total liabilities', bs.totalLiabilities]));
    rows.push(R('grand', ['Total equity and liabilities', M(bs.totalEquityAndLiabilities)], ['Total equity and liabilities', bs.totalEquityAndLiabilities]));
    rows.push(R('note',
      [bs.balanced ? 'The statement balances: Assets = Equity + Liabilities.' : `WARNING — out of balance by ${M(Math.abs(bs.diff))}.`, ''],
      [bs.balanced ? 'Balanced: Assets = Equity + Liabilities' : `Out of balance: ${bs.diff}`, '']));
    return mk('Statement of Financial Position', asOfLabel(asOf), 'portrait', [
      { label: 'Account', width: 0.68 }, { label: 'Amount', align: 'r', width: 0.32 },
    ], rows, ['Account', 'Amount']);
  }

  /* ---------------- cash flow ---------------- */
  if (id === 'cash-flow') {
    const cf = cashFlow(accounts, posted, from, to, settings.fiscalYearStart);
    const rows: BRow[] = [];
    const line = (name: string, amount: number) => R('data', [name, M(amount)], [name, amount], 1);
    rows.push(R('section', ['Cash flows from operating activities', ''], ['Cash flows from operating activities', '']));
    rows.push(line('Net profit', cf.netProfit));
    cf.operatingAdjustments.forEach((l) => rows.push(line(l.label, l.amount)));
    rows.push(R('total', ['Net cash from operating activities', M(cf.netOperating)], ['Net cash from operating activities', cf.netOperating]));
    rows.push(R('section', ['Cash flows from investing activities', ''], ['Cash flows from investing activities', '']));
    cf.investing.forEach((l) => rows.push(line(l.label, l.amount)));
    rows.push(R('total', ['Net cash from investing activities', M(cf.netInvesting)], ['Net cash from investing activities', cf.netInvesting]));
    rows.push(R('section', ['Cash flows from financing activities', ''], ['Cash flows from financing activities', '']));
    cf.financing.forEach((l) => rows.push(line(l.label, l.amount)));
    rows.push(R('total', ['Net cash from financing activities', M(cf.netFinancing)], ['Net cash from financing activities', cf.netFinancing]));
    rows.push(R('total', ['Net increase / (decrease) in cash', M(cf.netChange)], ['Net increase / (decrease) in cash', cf.netChange]));
    rows.push(R('data', ['Cash at beginning of period', M(cf.openingCash)], ['Cash at beginning of period', cf.openingCash]));
    rows.push(R('grand', ['Cash at end of period', M(cf.closingCash)], ['Cash at end of period', cf.closingCash]));
    rows.push(R('note',
      [cf.reconciled ? 'Cash flow reconciles to the change in cash and bank balances.' : `WARNING — does not reconcile (difference ${M(Math.abs(cf.diff))}).`, ''],
      [cf.reconciled ? 'Reconciled' : `Difference ${cf.diff}`, '']));
    return mk('Statement of Cash Flows', periodLabel(from, to), 'portrait', [
      { label: 'Description', width: 0.68 }, { label: 'Amount', align: 'r', width: 0.32 },
    ], rows, ['Description', 'Amount']);
  }

  /* ---------------- changes in equity ---------------- */
  if (id === 'changes-in-equity') {
    const ce = changesInEquity(accounts, posted, from, to, settings.fiscalYearStart);
    const rows: BRow[] = ce.rows.map((r) => R('data',
      [r.label, M(r.opening), M(r.movement), M(r.closing)],
      [r.label, r.opening, r.movement, r.closing]));
    rows.push(R('grand',
      ['Total equity', M(ce.totals.opening), M(ce.totals.movement), M(ce.totals.closing)],
      ['Total equity', ce.totals.opening, ce.totals.movement, ce.totals.closing]));
    return mk('Statement of Changes in Equity', periodLabel(from, to), 'portrait', [
      { label: '', width: 0.40 }, { label: 'Opening', align: 'r', width: 0.20 },
      { label: 'Movement', align: 'r', width: 0.20 }, { label: 'Closing', align: 'r', width: 0.20 },
    ], rows, ['', 'Opening', 'Movement', 'Closing']);
  }

  /* ---------------- chart of accounts ---------------- */
  if (id === 'chart-of-accounts') {
    const flat = flatAccounts(accounts);
    const rows: BRow[] = flat.map(({ account: a, indent }) => {
      const name = `${'\u00A0\u00A0'.repeat(indent)}${a.name}`;
      return R(a.postable ? 'data' : 'sub',
        [a.code, name, TYPE_LABEL[a.type] ?? a.type, a.subtype, a.normalBalance === 'debit' ? 'Debit' : 'Credit', a.status],
        [a.code, a.name, TYPE_LABEL[a.type] ?? a.type, a.subtype, a.normalBalance, a.status], indent);
    });
    return mk('Chart of Accounts', `As at ${fmtDate(todayISO())}`, 'landscape', [
      { label: 'Code', width: 0.10 }, { label: 'Account Name', width: 0.34 }, { label: 'Type', width: 0.16 },
      { label: 'Subtype', width: 0.18 }, { label: 'Normal Balance', width: 0.12 }, { label: 'Status', width: 0.10 },
    ], rows, ['Code', 'Account Name', 'Type', 'Subtype', 'Normal Balance', 'Status']);
  }

  /* ---------------- subledger-based: customers / vendors ---------------- */
  if (id === 'customers' || id === 'vendors') {
    const isCust = id === 'customers';
    const code = isCust ? settings.arControlAccount : settings.apControlAccount;
    const control = accounts.find((a) => a.code === code);
    const rangeTo = todayISO();
    const contacts = isCust ? snap.customers : snap.vendors;
    const cmap = new Map(contacts.map((c) => [c.id, c]));
    let rows: BRow[] = [];
    let note = '';
    if (control) {
      const sub = subledger(posted, control, '0000-01-01', rangeTo);
      const ctrl = ledgerForAccount(control, posted, '0000-01-01', rangeTo);
      const rec = reconcileSubledger(sub, ctrl.closing);
      rows = sub.map((r) => {
        const c = cmap.get(r.contactId);
        return R('data',
          [c?.code ?? r.contactId, c?.name ?? r.contactId, c?.phone ?? '', M(r.opening), M(r.debit), M(r.credit), M(r.closing)],
          [c?.code ?? r.contactId, c?.name ?? r.contactId, c?.phone ?? '', r.opening, r.debit, r.credit, r.closing]);
      });
      rows.sort((a, b) => String(a.disp[1]).localeCompare(String(b.disp[1])));
      rows.push(R('grand', ['', 'Total', '', '', '', '', M(rec.subTotal)], ['', 'Total', '', '', '', '', rec.subTotal]));
      note = rec.reconciled
        ? `Subledger reconciles to the ${code} control account (${control.name}).`
        : `WARNING — subledger total ${M(rec.subTotal)} does not reconcile to the ${code} control account ${M(rec.control)} (difference ${M(Math.abs(rec.diff))}).`;
      rows.push(R('note', [note, '', '', '', '', '', ''], [note, '', '', '', '', '', '']));
    }
    const cols: PdfColumn[] = [
      { label: 'Code', width: 0.10 }, { label: isCust ? 'Customer' : 'Vendor', width: 0.24 },
      { label: 'Phone', width: 0.14 }, { label: 'Opening', align: 'r', width: 0.13 },
      { label: 'Debit', align: 'r', width: 0.13 }, { label: 'Credit', align: 'r', width: 0.13 },
      { label: 'Balance', align: 'r', width: 0.13 },
    ];
    return mk(isCust ? 'Customer Balances' : 'Vendor Balances', `As at ${fmtDate(rangeTo)}`, 'landscape', cols, rows,
      ['Code', isCust ? 'Customer' : 'Vendor', 'Phone', 'Opening', 'Debit', 'Credit', 'Balance']);
  }

  return null;
}

/* ================= page ================= */

export default function ExportCenterPage() {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const [report, setReport] = useState<ReportId>('trial-balance');
  const [accountId, setAccountId] = useState('');
  const dr = useDateRange(settings);
  const [asOf, setAsOf] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [printR, setPrintR] = useState<BuiltReport | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  if (!snap) return <Page title="Export Center"><LoadingCard /></Page>;

  const build = (): BuiltReport | null => {
    if (NEEDS_ACCOUNT.includes(report) && !accountId) {
      toast('Select an account first', 'error');
      return null;
    }
    const b = buildReport(report, snap, settings, { from: dr.from, to: dr.to, asOf, accountId });
    if (!b) toast('Could not build this report', 'error');
    return b;
  };

  const label = REPORTS.find((r) => r.id === report)?.label ?? report;

  const doPdf = async () => {
    setBusy(true);
    try {
      const b = build();
      if (!b) return;
      await exportReportPdf({
        filename: `${b.filename}.pdf`, company: settings, title: b.title, period: b.period,
        orientation: b.orientation, columns: b.columns, rows: b.pdfRows,
        notes: [`${b.rowCount} rows · ${label}`],
      });
      toast('PDF exported');
    } catch (e: any) {
      toast(e?.message || 'PDF export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doCsv = () => {
    const b = build();
    if (!b) return;
    downloadCSV(`${b.filename}.csv`, b.csvHeaders, b.csvRows);
    toast('CSV exported');
  };

  const doXlsx = async () => {
    setBusy(true);
    try {
      const b = build();
      if (!b) return;
      const widths = b.columns.map((c) => Math.round((c.width ?? 0.15) * 110));
      await downloadXLSX(`${b.filename}.xlsx`, [{ name: label.slice(0, 31), headers: b.csvHeaders, rows: b.csvRows, widths }]);
      toast('Excel file exported');
    } catch (e: any) {
      toast(e?.message || 'Excel export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doPrint = () => {
    const b = build();
    if (!b) return;
    setPrintR(b);
    setTimeout(() => {
      const el = printRef.current;
      if (el) el.style.display = 'block';
      window.print();
      if (el) el.style.display = 'none';
    }, 80);
  };

  return (
    <>
      <div className="no-print">
        <Page
          title="Export Center"
          subtitle="Generate any report in PDF, CSV, Excel or print format — all derived from the journal"
          actions={<Btn variant="ghost" size="sm" icon={<FileOutput size={15} />} disabled>{label}</Btn>}
        >
          <Card title="Report" subtitle="Choose a report, set the period, then export">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Field label="Report type">
                <Select value={report} onChange={(e) => setReport(e.target.value as ReportId)}>
                  {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
              {NEEDS_ACCOUNT.includes(report) && (
                <Field label="Account">
                  <AccountSelect accounts={snap.accounts} value={accountId} onChange={setAccountId} label="Account" />
                </Field>
              )}
            </div>
            {FLOW.includes(report) && (
              <div style={{ marginTop: 12 }}>
                <DateRangeControl preset={dr.preset} setPreset={dr.setPreset} custom={dr.custom} setCustom={dr.setCustom} />
              </div>
            )}
            {POSITION.includes(report) && (
              <div style={{ marginTop: 12 }}>
                <AsOfControl asOf={asOf} setAsOf={setAsOf} />
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} onPrint={doPrint} busy={busy} />
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Exports carry the business identity only ({settings.businessName}) — no application name appears on exported documents.
            </p>
          </Card>

          <Card title="What exports include" subtitle="Single source of truth: every figure is computed from posted journal entries">
            <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
              <li><b>Journal</b> — one row per line: date, entry no., reference, kind, description, account, debit, credit, status.</li>
              <li><b>Ledgers</b> — opening balance, transactions with running balance, totals and closing balance.</li>
              <li><b>Trial balances</b> — account code/name with debit and credit columns; adjusted TB adds unadjusted / adjustment / adjusted columns.</li>
              <li><b>Financial statements</b> — formal layout with sections, subtotals and grand totals.</li>
              <li><b>Customers / Vendors</b> — subledger balances with control-account reconciliation.</li>
            </ul>
          </Card>
        </Page>
      </div>

      {/* print-only rendering */}
      {printR && (
        <div ref={printRef} style={{ display: 'none' }}>
          <ReportShell>
            <ReportHeader company={settings} title={printR.title} period={printR.period} />
            <ReportTable cols={printR.tableCols} rows={printR.tableRows} />
            <ReportFooter company={settings} period={printR.period} />
          </ReportShell>
        </div>
      )}
    </>
  );
}
