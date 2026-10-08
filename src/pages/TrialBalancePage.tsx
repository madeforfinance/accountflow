import React, { useMemo, useState } from 'react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Field, Select, Switch, EmptyState } from '../components/ui';
import { ReportShell, ReportHeader, ReportFooter, ReportTable, asOfLabel } from '../components/report';
import { AsOfControl, ExportButtons, LoadingCard } from '../components/acct';
import { trialBalance } from '../accounting/engine';
import { AccountType } from '../accounting/types';
import { fmtMoneyFull, todayISO } from '../lib/format';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { toast } from '../lib/toast';

const TYPE_OPTIONS: { value: AccountType | ''; label: string }[] = [
  { value: '', label: 'All account types' },
  { value: 'Asset', label: 'Assets' },
  { value: 'Liability', label: 'Liabilities' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Revenue', label: 'Revenue' },
  { value: 'CostOfSales', label: 'Cost of Sales' },
  { value: 'Expense', label: 'Expenses' },
  { value: 'OtherIncome', label: 'Other Income' },
  { value: 'OtherExpense', label: 'Other Expenses' },
];

const COLS = [
  { label: 'Account Code', align: 'l' as const, width: '130px' },
  { label: 'Account Name', align: 'l' as const },
  { label: 'Debit', align: 'r' as const, width: '180px' },
  { label: 'Credit', align: 'r' as const, width: '180px' },
];

export default function TrialBalancePage() {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const t = todayISO();
  const [asOf, setAsOf] = useState(settings.fiscalYearEnd < t ? settings.fiscalYearEnd : t);
  const [includeZero, setIncludeZero] = useState(false);
  const [type, setType] = useState<AccountType | ''>('');

  const tb = useMemo(
    () => (snap ? trialBalance(snap.accounts, snap.entries, asOf, { includeZero }) : null),
    [snap, asOf, includeZero],
  );

  const rows = useMemo(
    () => (tb ? tb.rows.filter((r) => !type || r.account.type === type) : []),
    [tb, type],
  );
  const filteredTotals = useMemo(() => {
    let d = 0, c = 0;
    for (const r of rows) { d += r.debit; c += r.credit; }
    return { debit: Math.round(d * 100) / 100, credit: Math.round(c * 100) / 100 };
  }, [rows]);

  if (!snap || !tb) return <Page title="Trial Balance"><LoadingCard /></Page>;

  const period = asOfLabel(asOf);
  const filename = `trial-balance-${asOf}`;

  const reportRows: { kind: 'data' | 'grand'; cells: React.ReactNode[] }[] = [
    ...rows.map((r) => ({
      kind: 'data' as const,
      cells: [
        <span key="c" className="mono">{r.account.code}</span>,
        r.account.name,
        <span key="d" className="num">{r.debit ? fmtMoneyFull(r.debit) : ''}</span>,
        <span key="c2" className="num">{r.credit ? fmtMoneyFull(r.credit) : ''}</span>,
      ],
    })),
    {
      kind: 'grand' as const,
      cells: [
        '', <span key="t"><b>Totals</b></span>,
        <span key="d" className="num"><b>{fmtMoneyFull(filteredTotals.debit)}</b></span>,
        <span key="c" className="num"><b>{fmtMoneyFull(filteredTotals.credit)}</b></span>,
      ],
    },
  ];

  const doPdf = async () => {
    await exportReportPdf({
      filename: `${filename}.pdf`,
      company: settings,
      title: 'Trial Balance',
      period,
      orientation: 'portrait',
      columns: [
        { label: 'Account Code', width: 0.18 },
        { label: 'Account Name', width: 0.46 },
        { label: 'Debit', align: 'r', width: 0.18 },
        { label: 'Credit', align: 'r', width: 0.18 },
      ],
      rows: [
        ...rows.map((r) => ({
          cells: [r.account.code, r.account.name, r.debit ? fmtMoneyFull(r.debit) : '', r.credit ? fmtMoneyFull(r.credit) : ''],
        })),
        { cells: ['', 'TOTALS', fmtMoneyFull(filteredTotals.debit), fmtMoneyFull(filteredTotals.credit)], bold: true, grand: true },
      ],
    });
    toast('Trial Balance exported to PDF');
  };

  const csvBody = (): unknown[][] => [
    ...rows.map((r) => [r.account.code, r.account.name, r.debit || '', r.credit || '']),
    ['TOTAL', '', filteredTotals.debit, filteredTotals.credit],
  ];

  const doCsv = () => {
    downloadCSV(`${filename}.csv`, ['Account Code', 'Account Name', 'Debit', 'Credit'], csvBody());
    toast('Trial Balance exported to CSV');
  };

  const doXlsx = async () => {
    await downloadXLSX(`${filename}.xlsx`, [{
      name: 'Trial Balance',
      headers: ['Account Code', 'Account Name', 'Debit', 'Credit'],
      rows: csvBody(),
      widths: [16, 44, 20, 20],
    }]);
    toast('Trial Balance exported to Excel');
  };

  const filtered = type !== '';

  return (
    <Page
      title="Trial Balance"
      subtitle="Derived from all posted journal entries"
      actions={<ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} />}
    >
      <Card className="no-print">
        <div className="filter-bar">
          <AsOfControl asOf={asOf} setAsOf={setAsOf} />
          <Field label="Account type">
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType | '')}>
              {TYPE_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 2 }}>
            <Switch label="Include zero balances" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
          </div>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card><EmptyState title="No balances" text="No account balances as of this date. Post journal entries first." /></Card>
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title="Trial Balance" period={`${period} · Currency: ${settings.baseCurrency}`} />

          <div className={tb.balanced ? 'rpt-ok' : 'rpt-flag'}>
            {tb.balanced
              ? `✓ Trial balance is balanced — total debits equal total credits (${fmtMoneyFull(tb.totalDebit)}).`
              : `⚠ Trial balance is OUT OF BALANCE by ${fmtMoneyFull(tb.diff)}. Review posted journal entries.`}
          </div>

          <ReportTable cols={COLS} rows={reportRows} />

          {filtered && (
            <p className="muted tiny no-print" style={{ marginTop: 8 }}>
              Note: totals here reflect the account-type filter only;
              the full trial balance {tb.balanced ? 'is balanced' : 'has a difference of ' + fmtMoneyFull(tb.diff)}.
            </p>
          )}

          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
