import React, { useMemo, useState } from 'react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Switch, EmptyState } from '../components/ui';
import { ReportShell, ReportHeader, ReportFooter, ReportTable, asOfLabel } from '../components/report';
import { AsOfControl, ExportButtons, LoadingCard } from '../components/acct';
import { adjustedTrialBalance } from '../accounting/engine';
import { fmtMoneyFull, todayISO } from '../lib/format';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { toast } from '../lib/toast';

const COLS = [
  { label: 'Account', align: 'l' as const },
  { label: 'Unadjusted Debit', align: 'r' as const },
  { label: 'Unadjusted Credit', align: 'r' as const },
  { label: 'Adjustments Debit', align: 'r' as const },
  { label: 'Adjustments Credit', align: 'r' as const },
  { label: 'Adjusted Debit', align: 'r' as const },
  { label: 'Adjusted Credit', align: 'r' as const },
];

const NOTE =
  'Adjusted balance = unadjusted balance + adjusting entries. Closing entries are excluded from this report; ' +
  'revenue and expense accounts therefore carry their full-year balances here.';

export default function AdjustedTBPage() {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const t = todayISO();
  const [asOf, setAsOf] = useState(settings.fiscalYearEnd < t ? settings.fiscalYearEnd : t);
  const [includeZero, setIncludeZero] = useState(false);

  const atb = useMemo(
    () => (snap ? adjustedTrialBalance(snap.accounts, snap.entries, asOf, includeZero) : null),
    [snap, asOf, includeZero],
  );

  if (!snap || !atb) return <Page title="Adjusted Trial Balance"><LoadingCard /></Page>;

  const period = asOfLabel(asOf);
  const filename = `adjusted-trial-balance-${asOf}`;
  const money = (n: number) => <span className="num">{n ? fmtMoneyFull(n) : ''}</span>;

  const reportRows: { kind: 'data' | 'grand'; cells: React.ReactNode[] }[] = [
    ...atb.rows.map((r) => ({
      kind: 'data' as const,
      cells: [
        <span key="a"><span className="mono">{r.account.code}</span> — {r.account.name}</span>,
        money(r.unadjDebit), money(r.unadjCredit),
        money(r.adjDebit), money(r.adjCredit),
        money(r.debit), money(r.credit),
      ],
    })),
    {
      kind: 'grand' as const,
      cells: [
        <span key="t"><b>Totals</b></span>,
        <span key="u1" className="num"><b>{fmtMoneyFull(atb.totalUnadjDebit)}</b></span>,
        <span key="u2" className="num"><b>{fmtMoneyFull(atb.totalUnadjCredit)}</b></span>,
        <span key="a1" className="num"><b>{fmtMoneyFull(atb.totalAdjDebit)}</b></span>,
        <span key="a2" className="num"><b>{fmtMoneyFull(atb.totalAdjCredit)}</b></span>,
        <span key="d" className="num"><b>{fmtMoneyFull(atb.totalDebit)}</b></span>,
        <span key="c" className="num"><b>{fmtMoneyFull(atb.totalCredit)}</b></span>,
      ],
    },
  ];

  const csvBody = (): unknown[][] => [
    ...atb.rows.map((r) => [
      r.account.code, r.account.name,
      r.unadjDebit || '', r.unadjCredit || '', r.adjDebit || '', r.adjCredit || '',
      r.debit || '', r.credit || '',
    ]),
    ['TOTAL', '', atb.totalUnadjDebit, atb.totalUnadjCredit, atb.totalAdjDebit, atb.totalAdjCredit, atb.totalDebit, atb.totalCredit],
  ];

  const doPdf = async () => {
    await exportReportPdf({
      filename: `${filename}.pdf`,
      company: settings,
      title: 'Adjusted Trial Balance',
      period,
      orientation: 'landscape',
      columns: [
        { label: 'Account', width: 0.30 },
        { label: 'Unadjusted Debit', align: 'r', width: 0.116 },
        { label: 'Unadjusted Credit', align: 'r', width: 0.116 },
        { label: 'Adjustments Debit', align: 'r', width: 0.117 },
        { label: 'Adjustments Credit', align: 'r', width: 0.117 },
        { label: 'Adjusted Debit', align: 'r', width: 0.117 },
        { label: 'Adjusted Credit', align: 'r', width: 0.117 },
      ],
      rows: [
        ...atb.rows.map((r) => ({
          cells: [
            `${r.account.code} — ${r.account.name}`,
            r.unadjDebit ? fmtMoneyFull(r.unadjDebit) : '',
            r.unadjCredit ? fmtMoneyFull(r.unadjCredit) : '',
            r.adjDebit ? fmtMoneyFull(r.adjDebit) : '',
            r.adjCredit ? fmtMoneyFull(r.adjCredit) : '',
            r.debit ? fmtMoneyFull(r.debit) : '',
            r.credit ? fmtMoneyFull(r.credit) : '',
          ],
        })),
        {
          cells: [
            'TOTALS',
            fmtMoneyFull(atb.totalUnadjDebit), fmtMoneyFull(atb.totalUnadjCredit),
            fmtMoneyFull(atb.totalAdjDebit), fmtMoneyFull(atb.totalAdjCredit),
            fmtMoneyFull(atb.totalDebit), fmtMoneyFull(atb.totalCredit),
          ],
          bold: true, grand: true,
        },
      ],
      notes: [NOTE],
    });
    toast('Adjusted Trial Balance exported to PDF');
  };

  const doCsv = () => {
    downloadCSV(`${filename}.csv`,
      ['Account Code', 'Account Name', 'Unadjusted Debit', 'Unadjusted Credit', 'Adjustments Debit', 'Adjustments Credit', 'Adjusted Debit', 'Adjusted Credit'],
      csvBody());
    toast('Adjusted Trial Balance exported to CSV');
  };

  const doXlsx = async () => {
    await downloadXLSX(`${filename}.xlsx`, [{
      name: 'Adjusted Trial Balance',
      headers: ['Account Code', 'Account Name', 'Unadjusted Debit', 'Unadjusted Credit', 'Adjustments Debit', 'Adjustments Credit', 'Adjusted Debit', 'Adjusted Credit'],
      rows: csvBody(),
      widths: [14, 36, 18, 18, 18, 18, 18, 18],
    }]);
    toast('Adjusted Trial Balance exported to Excel');
  };

  return (
    <Page
      title="Adjusted Trial Balance"
      subtitle="Unadjusted balances plus posted adjusting entries"
      actions={<ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} />}
    >
      <Card className="no-print">
        <div className="filter-bar">
          <AsOfControl asOf={asOf} setAsOf={setAsOf} />
          <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 2 }}>
            <Switch label="Include zero balances" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
          </div>
        </div>
      </Card>

      {atb.rows.length === 0 ? (
        <Card><EmptyState title="No balances" text="No account balances as of this date. Post journal entries first." /></Card>
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title="Adjusted Trial Balance" period={`${period} · Currency: ${settings.baseCurrency}`} />

          <div className={atb.balanced ? 'rpt-ok' : 'rpt-flag'}>
            {atb.balanced
              ? `✓ Adjusted trial balance is balanced (${fmtMoneyFull(atb.totalDebit)} adjusted debits = credits).`
              : '⚠ Adjusted trial balance is out of balance — review adjusting entries.'}
          </div>

          <ReportTable cols={COLS} rows={reportRows} />

          <p className="muted small" style={{ marginTop: 10, fontStyle: 'italic' }}>{NOTE}</p>

          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
