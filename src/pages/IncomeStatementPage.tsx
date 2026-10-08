/* Statement of Profit or Loss — derived entirely from posted journal entries. */
import React, { useMemo, useState } from 'react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, EmptyState } from '../components/ui';
import {
  ReportShell, ReportHeader, ReportFooter, ReportTable, Money, Acct, periodLabel,
} from '../components/report';
import type { RptRowKind } from '../components/report';
import { useDateRange, DateRangeControl, ExportButtons, LoadingCard } from '../components/acct';
import { incomeStatement, accountLabel } from '../accounting/engine';
import type { IncomeStatement } from '../accounting/engine';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { fmtMoneyFull, fmtAcct, round2 } from '../lib/format';
import { toast } from '../lib/toast';

interface StmtLine {
  kind: RptRowKind;
  label: string;
  amount?: number;
}

const TITLE = 'Statement of Profit or Loss';

export default function IncomeStatementPage() {
  const { snap, ready } = useAccounting();
  const { settings } = useSettings();
  const { preset, setPreset, custom, setCustom, from, to } = useDateRange(settings);
  const [busy, setBusy] = useState(false);

  const showCodes = settings.showAccountCodes !== false;
  const fmtNum = (n: number) => (settings.negativeStyle === 'minus' ? fmtMoneyFull(n) : fmtAcct(n));
  const Neg = ({ value }: { value: number }) =>
    settings.negativeStyle === 'minus' ? <Money value={value} /> : <Acct value={value} />;

  const is: IncomeStatement | null = useMemo(
    () => (snap ? incomeStatement(snap.accounts, snap.entries, from, to) : null),
    [snap, from, to],
  );

  const lines: StmtLine[] = useMemo(() => {
    if (!is) return [];
    const out: StmtLine[] = [];
    const push = (kind: RptRowKind, label: string, amount?: number) => out.push({ kind, label, amount });
    const acctLines = (ls: { account: Parameters<typeof accountLabel>[0]; amount: number }[]) =>
      ls.forEach((l) => push('sub', accountLabel(l.account, showCodes), l.amount));

    push('section', 'Revenue');
    acctLines(is.revenue);
    push('total', 'Total Revenue', is.totalRevenue);

    push('section', 'Cost of Sales');
    acctLines(is.costOfSales);
    push('total', 'Total Cost of Sales', is.totalCostOfSales);

    push('total', 'Gross Profit', is.grossProfit);

    push('section', 'Operating Expenses');
    acctLines(is.expenses);
    push('total', 'Total Operating Expenses', is.totalExpenses);

    push('total', 'Operating Profit', is.operatingProfit);

    if (is.otherIncome.length || is.totalOtherIncome !== 0) {
      push('section', 'Other Income');
      acctLines(is.otherIncome);
      push('total', 'Total Other Income', is.totalOtherIncome);
    }

    // Income tax sits inside OtherExpense in the engine — present it below profit-before-tax.
    const otherExp = is.otherExpenses.filter((l) => l.account.subtype !== 'Tax');
    const otherExpTotal = round2(is.totalOtherExpenses - is.taxExpense);
    if (otherExp.length || otherExpTotal !== 0) {
      push('section', 'Other Expenses');
      acctLines(otherExp);
      push('total', 'Total Other Expenses', otherExpTotal);
    }

    push('total', 'Profit Before Tax', is.profitBeforeTax);
    if (is.taxExpense !== 0) push('sub', 'Income Tax Expense', is.taxExpense);
    push('grand', 'PROFIT FOR THE YEAR', is.netProfit);
    return out;
  }, [is, showCodes]);

  const hasData = !!is && (
    is.revenue.length + is.costOfSales.length + is.expenses.length +
    is.otherIncome.length + is.otherExpenses.length > 0
  );

  const period = periodLabel(from, to);
  const fname = `statement-of-profit-or-loss_${from}_to_${to}`;

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
        name: 'Profit or Loss',
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

  if (!ready || !snap || !is) return <Page title="Income Statement"><LoadingCard /></Page>;

  return (
    <Page
      title="Income Statement"
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
          title="No activity in this period"
          text="No posted journal entries fall within the selected period. Adjust the date range or post a journal entry."
        />
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title={TITLE} period={period} />
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
