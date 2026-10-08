import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Field, Select, SearchInput, EmptyState, Badge } from '../components/ui';
import { ReportShell, ReportHeader, ReportFooter, ReportTable, periodLabel } from '../components/report';
import { useDateRange, DateRangeControl, ExportButtons, LoadingCard } from '../components/acct';
import { ledgerForAccount, AccountLedger } from '../accounting/engine';
import { AccountType } from '../accounting/types';
import { fmtDate, fmtMoneyFull, todayISO } from '../lib/format';
import { exportReportPdf, PdfRow } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { toast } from '../lib/toast';

const ACCOUNT_TYPES: { value: AccountType | ''; label: string }[] = [
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

const GL_COLS = [
  { label: 'Date', align: 'l' as const, width: '86px' },
  { label: 'Entry No.', align: 'l' as const, width: '96px' },
  { label: 'Reference', align: 'l' as const, width: '110px' },
  { label: 'Description', align: 'l' as const },
  { label: 'Debit', align: 'r' as const, width: '130px' },
  { label: 'Credit', align: 'r' as const, width: '130px' },
  { label: 'Balance', align: 'r' as const, width: '140px' },
];

export default function GeneralLedgerPage() {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const dr = useDateRange(settings);
  const { from, to } = dr;
  const [type, setType] = useState<AccountType | ''>('');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const ledgers = useMemo<AccountLedger[]>(() => {
    if (!snap) return [];
    const needle = q.trim().toLowerCase();
    const out: AccountLedger[] = [];
    for (const a of snap.accounts) {
      if (!a.postable || a.status !== 'active') continue;
      if (type && a.type !== type) continue;
      if (needle && !`${a.code} ${a.name}`.toLowerCase().includes(needle)) continue;
      const l = ledgerForAccount(a, snap.entries, from, to);
      if (l.rows.length === 0 && l.opening === 0) continue;
      out.push(l);
    }
    return out;
  }, [snap, from, to, type, q]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of ledgers) { d += l.totalDebit; c += l.totalCredit; }
    return { debit: Math.round(d * 100) / 100, credit: Math.round(c * 100) / 100 };
  }, [ledgers]);

  if (!snap) return <Page title="General Ledger"><LoadingCard /></Page>;

  const toggle = (id: string) =>
    setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expandAll = () => setExpanded(new Set(ledgers.map((l) => l.account.id)));
  const collapseAll = () => setExpanded(new Set());

  const period = periodLabel(from, to);
  const filename = `general-ledger-${from}-${to}`;

  const pdfRows = (): PdfRow[] => {
    const rows: PdfRow[] = [];
    for (const l of ledgers) {
      rows.push({
        cells: [`${l.account.code} — ${l.account.name}`, '', '', '', '', '', ''],
        bold: true, section: true,
      });
      rows.push({ cells: ['', '', '', 'Opening balance', '', '', fmtMoneyFull(l.opening)] });
      for (const r of l.rows) {
        rows.push({
          cells: [
            fmtDate(r.date), r.entryNo, r.reference || '', r.description,
            r.debit ? fmtMoneyFull(r.debit) : '', r.credit ? fmtMoneyFull(r.credit) : '',
            fmtMoneyFull(r.running),
          ],
        });
      }
      rows.push({
        cells: ['', '', '', 'Closing balance', fmtMoneyFull(l.totalDebit), fmtMoneyFull(l.totalCredit), fmtMoneyFull(l.closing)],
        bold: true, ruleAbove: true,
      });
    }
    return rows;
  };

  const doPdf = async () => {
    await exportReportPdf({
      filename: `${filename}.pdf`,
      company: settings,
      title: 'General Ledger',
      period,
      orientation: 'landscape',
      columns: [
        { label: 'Date', width: 0.09 }, { label: 'Entry No', width: 0.10 }, { label: 'Reference', width: 0.12 },
        { label: 'Description', width: 0.33 }, { label: 'Debit', align: 'r', width: 0.12 },
        { label: 'Credit', align: 'r', width: 0.12 }, { label: 'Balance', align: 'r', width: 0.12 },
      ],
      rows: pdfRows(),
    });
    toast('General Ledger exported to PDF');
  };

  const csvRows = (): unknown[][] => {
    const out: unknown[][] = [];
    for (const l of ledgers) {
      out.push([l.account.code, l.account.name, '', '', '', 'Opening balance', '', '', l.opening]);
      for (const r of l.rows) {
        out.push([l.account.code, l.account.name, r.date, r.entryNo, r.reference || '', r.description, r.debit || '', r.credit || '', r.running]);
      }
      out.push([l.account.code, l.account.name, '', '', '', 'Closing balance', l.totalDebit, l.totalCredit, l.closing]);
    }
    return out;
  };

  const doCsv = () => {
    downloadCSV(`${filename}.csv`,
      ['Account Code', 'Account Name', 'Date', 'Entry No', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
      csvRows());
    toast('General Ledger exported to CSV');
  };

  const doXlsx = async () => {
    await downloadXLSX(`${filename}.xlsx`, [{
      name: 'General Ledger',
      headers: ['Account Code', 'Account Name', 'Date', 'Entry No', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
      rows: csvRows(),
      widths: [14, 34, 12, 14, 18, 44, 16, 16, 18],
    }]);
    toast('General Ledger exported to Excel');
  };

  const accountRows = (l: AccountLedger) => {
    const rows: { kind: 'data' | 'sub' | 'total'; cells: React.ReactNode[] }[] = [];
    rows.push({
      kind: 'sub',
      cells: [
        <span key="d" className="muted">—</span>,
        '', '',
        <span key="d2"><b>Opening balance</b></span>,
        '', '',
        <span key="b" className="num"><b>{fmtMoneyFull(l.opening)}</b></span>,
      ],
    });
    for (const r of l.rows) {
      rows.push({
        kind: 'data',
        cells: [
          <span key="d" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span>,
          r.entryNo,
          <span key="r" className="muted">{r.reference || '—'}</span>,
          r.description,
          <span key="db" className="num">{r.debit ? fmtMoneyFull(r.debit) : ''}</span>,
          <span key="cr" className="num">{r.credit ? fmtMoneyFull(r.credit) : ''}</span>,
          <span key="b" className="num">{fmtMoneyFull(r.running)}</span>,
        ],
      });
    }
    rows.push({
      kind: 'total',
      cells: [
        '', '', '',
        <span key="d"><b>Closing balance</b></span>,
        <span key="db" className="num"><b>{fmtMoneyFull(l.totalDebit)}</b></span>,
        <span key="cr" className="num"><b>{fmtMoneyFull(l.totalCredit)}</b></span>,
        <span key="b" className="num"><b>{fmtMoneyFull(l.closing)}</b></span>,
      ],
    });
    return rows;
  };

  return (
    <Page
      title="General Ledger"
      subtitle={`${ledgers.length} ${ledgers.length === 1 ? 'account' : 'accounts'} with activity · derived from posted journals`}
      actions={<ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} />}
    >
      <Card className="no-print">
        <div className="filter-bar">
          <DateRangeControl preset={dr.preset} setPreset={dr.setPreset} custom={dr.custom} setCustom={dr.setCustom} />
          <Field label="Account type">
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType | '')}>
              {ACCOUNT_TYPES.map((t) => <option key={t.label} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search account code or name…" />
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted small">
            Period debits <b className="num">{fmtMoneyFull(totals.debit)}</b>
            {' · '}period credits <b className="num">{fmtMoneyFull(totals.credit)}</b>
          </span>
          <span style={{ flex: 1 }} />
          <button className="chip" onClick={expandAll}>Expand all</button>
          <button className="chip" onClick={collapseAll}>Collapse all</button>
        </div>
      </Card>

      {ledgers.length === 0 ? (
        <Card><EmptyState title="No account activity" text="No posted transactions for this period and filter combination." /></Card>
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title="General Ledger" period={`${period} · Currency: ${settings.baseCurrency}`} />

          {/* Interactive collapsible sections (screen) */}
          <div className="screen-only" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ledgers.map((l) => {
              const open = expanded.has(l.account.id);
              return (
                <Card key={l.account.id} style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggle(l.account.id)}
                    style={{ all: 'unset', display: 'flex', width: '100%', cursor: 'pointer', boxSizing: 'border-box', padding: '12px 16px', alignItems: 'center', gap: 10 }}
                  >
                    <ChevronDown style={{ width: 16, height: 16, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        <span className="mono">{l.account.code}</span> — {l.account.name}
                      </div>
                      <div className="tiny muted">{l.rows.length} {l.rows.length === 1 ? 'transaction' : 'transactions'} in period</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="tiny muted">Closing balance</div>
                      <div className="num" style={{ fontWeight: 700 }}>{fmtMoneyFull(l.closing)}</div>
                    </div>
                    <Badge tone={l.account.type === 'Asset' ? 'blue' : l.account.type === 'Liability' ? 'amber' : l.account.type === 'Equity' ? 'gold' : 'gray'}>
                      {l.account.type}
                    </Badge>
                  </button>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      <ReportTable cols={GL_COLS} rows={accountRows(l)} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Full expanded report (print) */}
          <div className="print-only">
            {ledgers.map((l) => (
              <div key={`p-${l.account.id}`} style={{ marginBottom: 24, breakInside: 'avoid' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  <span className="mono">{l.account.code}</span> — {l.account.name}
                  <span className="muted" style={{ fontWeight: 400 }}> · {l.account.type}</span>
                </div>
                <ReportTable cols={GL_COLS} rows={accountRows(l)} />
              </div>
            ))}
          </div>

          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
