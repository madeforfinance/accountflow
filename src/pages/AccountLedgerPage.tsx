import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Field, Switch, EmptyState } from '../components/ui';
import { ReportShell, ReportHeader, ReportFooter, ReportTable, periodLabel, asOfLabel } from '../components/report';
import { useDateRange, DateRangeControl, AsOfControl, ExportButtons, AccountSelect, LoadingCard } from '../components/acct';
import { ledgerForAccount } from '../accounting/engine';
import { fmtDate, fmtMoneyFull, todayISO } from '../lib/format';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { toast } from '../lib/toast';

const COLS = [
  { label: 'Date', align: 'l' as const, width: '96px' },
  { label: 'Entry No.', align: 'l' as const, width: '110px' },
  { label: 'Reference', align: 'l' as const, width: '130px' },
  { label: 'Description', align: 'l' as const },
  { label: 'Debit', align: 'r' as const, width: '140px' },
  { label: 'Credit', align: 'r' as const, width: '140px' },
  { label: 'Balance', align: 'r' as const, width: '150px' },
];

export default function AccountLedgerPage() {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const presetAccount = params.get('account') ?? '';
  const dr = useDateRange(settings);
  const { from, to } = dr;
  const [accountId, setAccountId] = useState(presetAccount);
  const [asOfMode, setAsOfMode] = useState(false);
  const [asOf, setAsOf] = useState(todayISO());

  const effFrom = asOfMode ? settings.fiscalYearStart : from;
  const effTo = asOfMode ? asOf : to;
  const period = asOfMode ? asOfLabel(asOf) : periodLabel(from, to);

  const account = useMemo(
    () => (snap ? snap.accounts.find((a) => a.id === accountId) ?? null : null),
    [snap, accountId],
  );
  const ledger = useMemo(
    () => (account && snap ? ledgerForAccount(account, snap.entries, effFrom, effTo) : null),
    [account, snap, effFrom, effTo],
  );

  if (!snap) return <Page title="Account Ledger"><LoadingCard /></Page>;

  const filename = `account-ledger-${account?.code ?? 'none'}-${effFrom}-${effTo}`;
  const num = (n: number) => <span className="num">{n ? fmtMoneyFull(n) : ''}</span>;

  const reportRows: { kind: 'data' | 'sub' | 'total' | 'grand'; cells: React.ReactNode[] }[] = ledger ? [
    {
      kind: 'sub',
      cells: [<span key="d">—</span>, '', '', <span key="t"><b>Opening balance</b></span>, '', '', <span key="b" className="num"><b>{fmtMoneyFull(ledger.opening)}</b></span>],
    },
    ...ledger.rows.map((r, i) => ({
      kind: 'data' as const,
      cells: [
        <span key="d" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span>,
        r.entryNo,
        <span key="r" className="muted">{r.reference || '—'}</span>,
        r.description,
        num(r.debit), num(r.credit),
        <span key="b" className="num">{fmtMoneyFull(r.running)}</span>,
      ],
    })),
    {
      kind: 'total',
      cells: ['', '', '', <span key="t"><b>Totals</b></span>,
        <span key="d" className="num"><b>{fmtMoneyFull(ledger.totalDebit)}</b></span>,
        <span key="c" className="num"><b>{fmtMoneyFull(ledger.totalCredit)}</b></span>, ''],
    },
    {
      kind: 'grand',
      cells: ['', '', '', <span key="t"><b>Closing balance</b></span>, '', '',
        <span key="b" className="num"><b>{fmtMoneyFull(ledger.closing)}</b></span>],
    },
  ] : [];

  const pdfRows = () => {
    if (!ledger || !account) return [];
    return [
      { cells: ['', '', '', 'Opening balance', '', '', fmtMoneyFull(ledger.opening)] },
      ...ledger.rows.map((r) => ({
        cells: [
          fmtDate(r.date), r.entryNo, r.reference || '', r.description,
          r.debit ? fmtMoneyFull(r.debit) : '', r.credit ? fmtMoneyFull(r.credit) : '',
          fmtMoneyFull(r.running),
        ],
      })),
      { cells: ['', '', '', 'Totals', fmtMoneyFull(ledger.totalDebit), fmtMoneyFull(ledger.totalCredit), ''], bold: true, ruleAbove: true },
      { cells: ['', '', '', 'Closing balance', '', '', fmtMoneyFull(ledger.closing)], bold: true, grand: true },
    ];
  };

  const csvBody = (): unknown[][] => {
    if (!ledger) return [];
    return [
      ['', '', '', 'Opening balance', '', '', ledger.opening],
      ...ledger.rows.map((r) => [r.date, r.entryNo, r.reference || '', r.description, r.debit || '', r.credit || '', r.running]),
      ['', '', '', 'Totals', ledger.totalDebit, ledger.totalCredit, ''],
      ['', '', '', 'Closing balance', '', '', ledger.closing],
    ];
  };

  const doPdf = async () => {
    if (!ledger || !account) return;
    await exportReportPdf({
      filename: `${filename}.pdf`,
      company: settings,
      title: 'Account Ledger',
      period: `${period} · ${account.code} — ${account.name}`,
      orientation: 'landscape',
      columns: [
        { label: 'Date', width: 0.09 }, { label: 'Entry No', width: 0.11 }, { label: 'Reference', width: 0.13 },
        { label: 'Description', width: 0.31 }, { label: 'Debit', align: 'r', width: 0.12 },
        { label: 'Credit', align: 'r', width: 0.12 }, { label: 'Balance', align: 'r', width: 0.12 },
      ],
      rows: pdfRows(),
    });
    toast('Account ledger exported to PDF');
  };

  const doCsv = () => {
    downloadCSV(`${filename}.csv`, ['Date', 'Entry No', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], csvBody());
    toast('Account ledger exported to CSV');
  };

  const doXlsx = async () => {
    await downloadXLSX(`${filename}.xlsx`, [{
      name: 'Account Ledger',
      headers: ['Date', 'Entry No', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
      rows: csvBody(),
      widths: [12, 14, 18, 48, 16, 16, 18],
    }]);
    toast('Account ledger exported to Excel');
  };

  return (
    <Page
      title="Account Ledger"
      subtitle="Formal ledger for a single account, derived from posted journals"
      actions={<ExportButtons onPdf={account ? doPdf : undefined} onCsv={account ? doCsv : undefined} onXlsx={account ? doXlsx : undefined} />}
    >
      <Card className="no-print">
        <div className="filter-bar">
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <Field label="Account" required>
              <AccountSelect accounts={snap.accounts} value={accountId} onChange={setAccountId} label="Account" />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 2 }}>
            <Switch label="As of date" checked={asOfMode} onChange={(e) => setAsOfMode(e.target.checked)} />
          </div>
          {asOfMode ? (
            <AsOfControl asOf={asOf} setAsOf={setAsOf} />
          ) : (
            <DateRangeControl preset={dr.preset} setPreset={dr.setPreset} custom={dr.custom} setCustom={dr.setCustom} />
          )}
        </div>
      </Card>

      {!account || !ledger ? (
        <Card><EmptyState title="Select an account" text="Choose an account above to view its ledger." /></Card>
      ) : (
        <ReportShell>
          <ReportHeader
            company={settings}
            title="Account Ledger"
            period={period}
            extra={
              <div className="rpt-period" style={{ marginTop: 4 }}>
                <span className="mono">{account.code}</span> — <b>{account.name}</b>
                <span className="muted"> · {account.type} · Normal balance: {account.normalBalance === 'debit' ? 'Dr' : 'Cr'}</span>
              </div>
            }
          />
          {ledger.rows.length === 0 && ledger.opening === 0 ? (
            <p className="muted" style={{ padding: '24px 0' }}>No posted transactions for this account in the selected period.</p>
          ) : (
            <ReportTable cols={COLS} rows={reportRows} />
          )}
          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
