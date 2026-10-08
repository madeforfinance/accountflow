/* Statement of Cash Flows (indirect method) — derived from posted journal entries. */
import React, { useMemo, useState } from 'react';
import { FileCheck, AlertTriangle } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, EmptyState } from '../components/ui';
import {
  ReportShell, ReportHeader, ReportFooter, ReportTable, Money, Acct, periodLabel,
} from '../components/report';
import type { RptRowKind } from '../components/report';
import { useDateRange, DateRangeControl, ExportButtons, LoadingCard } from '../components/acct';
import { cashFlow } from '../accounting/engine';
import type { CashFlowStatement, CFLine } from '../accounting/engine';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { fmtMoneyFull, fmtAcct } from '../lib/format';
import { toast } from '../lib/toast';

interface StmtLine {
  kind: RptRowKind;
  label: string;
  amount?: number;
}

const TITLE = 'Statement of Cash Flows';

export default function CashFlowPage() {
  const { snap, ready } = useAccounting();
  const { settings } = useSettings();
  const { preset, setPreset, custom, setCustom, from, to } = useDateRange(settings);
  const [busy, setBusy] = useState(false);

  const fmtNum = (n: number) => (settings.negativeStyle === 'minus' ? fmtMoneyFull(n) : fmtAcct(n));
  const Neg = ({ value }: { value: number }) =>
    settings.negativeStyle === 'minus' ? <Money value={value} /> : <Acct value={value} />;

  const cf: CashFlowStatement | null = useMemo(
    () => (snap ? cashFlow(snap.accounts, snap.entries, from, to, settings.fiscalYearStart) : null),
    [snap, from, to, settings.fiscalYearStart],
  );

  const lines: StmtLine[] = useMemo(() => {
    if (!cf) return [];
    const out: StmtLine[] = [];
    const push = (kind: RptRowKind, label: string, amount?: number) => out.push({ kind, label, amount });
    const cfLines = (ls: CFLine[]) => ls.forEach((l) => push('sub', l.label, l.amount));

    push('section', 'Cash Flows from Operating Activities');
    push('sub', 'Profit for the year', cf.netProfit);
    cfLines(cf.operatingAdjustments);
    push('total', 'Net cash from operating activities', cf.netOperating);

    push('section', 'Cash Flows from Investing Activities');
    cfLines(cf.investing);
    push('total', 'Net cash used in investing activities', cf.netInvesting);

    push('section', 'Cash Flows from Financing Activities');
    cfLines(cf.financing);
    push('total', 'Net cash from financing activities', cf.netFinancing);

    push('grand', 'Net increase in cash and cash equivalents', cf.netChange);
    push('data', 'Cash and cash equivalents at beginning of year', cf.openingCash);
    push('total', 'Cash and cash equivalents at end of year', cf.closingCash);
    return out;
  }, [cf]);

  const hasData = !!cf && (
    cf.netProfit !== 0 || cf.operatingAdjustments.length + cf.investing.length + cf.financing.length > 0
  );

  const period = periodLabel(from, to);
  const fname = `statement-of-cash-flows_${from}_to_${to}`;

  const pdfRows = () =>
    lines.map((l) => ({
      cells: [l.label, l.amount === undefined ? '' : fmtNum(l.amount)],
      bold: l.kind === 'section' || l.kind === 'total' || l.kind === 'grand',
      section: l.kind === 'section',
      grand: l.kind === 'grand',
      ruleAbove: l.kind === 'total',
      indent: l.kind === 'sub' ? 1 : 0,
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
        name: 'Cash Flows',
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

  if (!ready || !snap || !cf) return <Page title="Cash Flow"><LoadingCard /></Page>;

  return (
    <Page
      title="Cash Flow Statement"
      subtitle={`${settings.businessName} · ${period}`}
      actions={(
        <div className="no-print">
          <ExportButtons onPdf={doPdf} onCsv={doCsv} onXlsx={doXlsx} busy={busy} />
        </div>
      )}
    >
      <div className="no-print" style={{ marginBottom: 16 }}>
        <DateRangeControl preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
      </div>

      {!hasData ? (
        <EmptyState
          title="No cash activity in this period"
          text="No posted journal entries fall within the selected period. Adjust the date range or post a journal entry."
        />
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title={TITLE} period={period} />

          {cf.reconciled ? (
            <div className="rpt-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck style={{ width: 18, height: 18 }} />
              Reconciled — net change in cash equals the movement in cash and cash equivalents.
            </div>
          ) : (
            <div className="rpt-flag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle style={{ width: 18, height: 18 }} />
              Not reconciled — cash movement differs by {fmtMoneyFull(cf.diff)}.
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
