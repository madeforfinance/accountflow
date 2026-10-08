/* Statement of Financial Position — derived from posted journal entries as of a date. */
import React, { useMemo, useState } from 'react';
import { FileCheck, AlertTriangle } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, EmptyState } from '../components/ui';
import {
  ReportShell, ReportHeader, ReportFooter, ReportTable, Money, Acct, asOfLabel,
} from '../components/report';
import type { RptRowKind } from '../components/report';
import { AsOfControl, ExportButtons, LoadingCard } from '../components/acct';
import { balanceSheet, accountLabel } from '../accounting/engine';
import type { BalanceSheet, BSLine } from '../accounting/engine';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { fmtMoneyFull, fmtAcct } from '../lib/format';
import { toast } from '../lib/toast';

interface StmtLine {
  kind: RptRowKind;
  label: string;
  amount?: number;
}

const TITLE = 'Statement of Financial Position';

export default function BalanceSheetPage() {
  const { snap, ready } = useAccounting();
  const { settings } = useSettings();
  const [asOf, setAsOf] = useState(settings.fiscalYearEnd);
  const [busy, setBusy] = useState(false);

  const showCodes = settings.showAccountCodes !== false;
  const fmtNum = (n: number) => (settings.negativeStyle === 'minus' ? fmtMoneyFull(n) : fmtAcct(n));
  const Neg = ({ value }: { value: number }) =>
    settings.negativeStyle === 'minus' ? <Money value={value} /> : <Acct value={value} />;

  const bs: BalanceSheet | null = useMemo(
    () => (snap ? balanceSheet(snap.accounts, snap.entries, asOf, settings.fiscalYearStart) : null),
    [snap, asOf, settings.fiscalYearStart],
  );

  const lines: StmtLine[] = useMemo(() => {
    if (!bs) return [];
    const out: StmtLine[] = [];
    const push = (kind: RptRowKind, label: string, amount?: number) => out.push({ kind, label, amount });
    const acctLines = (ls: BSLine[]) => ls.forEach((l) => push('sub2', accountLabel(l.account, showCodes), l.amount));

    push('section', 'ASSETS');
    push('sub', 'Current Assets');
    acctLines(bs.currentAssets);
    push('total', 'Total Current Assets', bs.totalCurrentAssets);
    push('sub', 'Non-Current Assets');
    acctLines(bs.nonCurrentAssets);
    push('total', 'Total Non-Current Assets', bs.totalNonCurrentAssets);
    push('grand', 'TOTAL ASSETS', bs.totalAssets);

    push('section', 'EQUITY');
    bs.equityLines.forEach((l) => push('sub', l.label, l.amount));
    push('total', 'TOTAL EQUITY', bs.totalEquity);

    push('section', 'LIABILITIES');
    push('sub', 'Current Liabilities');
    acctLines(bs.currentLiabilities);
    push('total', 'Total Current Liabilities', bs.totalCurrentLiabilities);
    push('sub', 'Non-Current Liabilities');
    acctLines(bs.nonCurrentLiabilities);
    push('total', 'Total Non-Current Liabilities', bs.totalNonCurrentLiabilities);
    push('total', 'TOTAL LIABILITIES', bs.totalLiabilities);

    push('grand', 'TOTAL EQUITY AND LIABILITIES', bs.totalEquityAndLiabilities);
    return out;
  }, [bs, showCodes]);

  const hasData = !!bs && (
    bs.currentAssets.length + bs.nonCurrentAssets.length +
    bs.currentLiabilities.length + bs.nonCurrentLiabilities.length > 0 ||
    bs.totalEquity !== 0
  );

  const period = asOfLabel(asOf);
  const fname = `statement-of-financial-position_as-of_${asOf}`;

  const pdfRows = () =>
    lines.map((l) => ({
      cells: [l.label, l.amount === undefined ? '' : fmtNum(l.amount)],
      bold: l.kind === 'section' || l.kind === 'sub' || l.kind === 'total' || l.kind === 'grand',
      section: l.kind === 'section',
      grand: l.kind === 'grand',
      ruleAbove: l.kind === 'total',
      indent: l.kind === 'sub' ? 1 : l.kind === 'sub2' ? 2 : 0,
    }));

  const csvRows = () => lines.map((l) => [l.label, l.amount === undefined ? '' : fmtNum(l.amount)] as unknown[]);

  const doPdf = async () => {
    setBusy(true);
    try {
      await exportReportPdf({
        filename: `${fname}.pdf`,
        company: settings,
        title: TITLE,
        period,
        orientation: 'portrait',
        columns: [
          { label: 'Particulars', align: 'l', width: 0.72 },
          { label: `Amount (${settings.baseCurrency})`, align: 'r', width: 0.28 },
        ],
        rows: pdfRows(),
      });
      toast('PDF exported');
    } catch (e) {
      toast(`PDF export failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doCsv = () => {
    downloadCSV(`${fname}.csv`, ['Particulars', `Amount (${settings.baseCurrency})`], csvRows());
    toast('CSV exported');
  };

  const doXlsx = async () => {
    setBusy(true);
    try {
      await downloadXLSX(`${fname}.xlsx`, [{
        name: 'Financial Position',
        headers: ['Particulars', `Amount (${settings.baseCurrency})`],
        rows: csvRows(),
        widths: [56, 24],
      }]);
      toast('Excel workbook exported');
    } catch (e) {
      toast(`Excel export failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !snap || !bs) return <Page title="Balance Sheet"><LoadingCard /></Page>;

  return (
    <Page
      title="Balance Sheet"
      subtitle={`${settings.businessName} · ${period}`}
      actions={(
        <div className="no-print">
          <ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} busy={busy} />
        </div>
      )}
    >
      <div className="no-print" style={{ marginBottom: 16 }}>
        <AsOfControl asOf={asOf} setAsOf={setAsOf} />
      </div>

      {!hasData ? (
        <EmptyState
          title="No balances as of this date"
          text="No posted journal entries exist on or before the selected date. Choose a later date or post a journal entry."
        />
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title={TITLE} period={period} />

          {bs.balanced ? (
            <div className="rpt-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck style={{ width: 18, height: 18 }} />
              Balanced — Assets = Equity + Liabilities.
            </div>
          ) : (
            <div className="rpt-flag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle style={{ width: 18, height: 18 }} />
              Out of balance by {fmtMoneyFull(bs.diff)} — assets do not equal equity plus liabilities.
            </div>
          )}

          <ReportTable
            cols={[
              { label: 'Particulars', align: 'l', width: '70%' },
              { label: 'Amount', align: 'r' },
            ]}
            rows={lines.map((l) => ({
              kind: l.kind,
              cells: [l.label, l.amount === undefined ? '' : <Neg value={l.amount} />],
            }))}
          />
          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
