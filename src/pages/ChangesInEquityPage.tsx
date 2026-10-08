/* Statement of Changes in Equity — derived from posted journal entries. */
import React, { useMemo, useState } from 'react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, EmptyState } from '../components/ui';
import {
  ReportShell, ReportHeader, ReportFooter, ReportTable, Money, Acct, periodLabel,
} from '../components/report';
import type { RptRowKind } from '../components/report';
import { useDateRange, DateRangeControl, ExportButtons, LoadingCard } from '../components/acct';
import { changesInEquity } from '../accounting/engine';
import type { ChangesInEquity } from '../accounting/engine';
import { exportReportPdf } from '../lib/reportPdf';
import { downloadCSV, downloadXLSX } from '../lib/files';
import { fmtMoneyFull, fmtAcct } from '../lib/format';
import { toast } from '../lib/toast';

interface EquityLine {
  kind: RptRowKind;
  label: string;
  cols: number[];
}

const TITLE = 'Statement of Changes in Equity';

export default function ChangesInEquityPage() {
  const { snap, ready } = useAccounting();
  const { settings } = useSettings();
  const { preset, setPreset, custom, setCustom, from, to } = useDateRange(settings);
  const [busy, setBusy] = useState(false);

  const fmtNum = (n: number) => (settings.negativeStyle === 'minus' ? fmtMoneyFull(n) : fmtAcct(n));
  const Neg = ({ value }: { value: number }) =>
    settings.negativeStyle === 'minus' ? <Money value={value} /> : <Acct value={value} />;

  const ce: ChangesInEquity | null = useMemo(
    () => (snap ? changesInEquity(snap.accounts, snap.entries, from, to, settings.fiscalYearStart) : null),
    [snap, from, to, settings.fiscalYearStart],
  );

  const compCols = useMemo(() => (ce ? ce.rows.map((r) => r.label) : []), [ce]);

  const rows: EquityLine[] = useMemo(() => {
    if (!ce) return [];
    const pick = (key: 'opening' | 'movement' | 'closing') => ce.rows.map((r) => r[key]);
    return [
      { kind: 'data', label: 'Balance at start of period', cols: [...pick('opening'), ce.totals.opening] },
      { kind: 'data', label: 'Movements during the period', cols: [...pick('movement'), ce.totals.movement] },
      { kind: 'grand', label: 'Balance at end of period', cols: [...pick('closing'), ce.totals.closing] },
    ];
  }, [ce]);

  const hasData = !!ce && ce.rows.some((r) => r.opening !== 0 || r.movement !== 0 || r.closing !== 0);

  const period = periodLabel(from, to);
  const fname = `statement-of-changes-in-equity_${from}_to_${to}`;
  const colLabels = ['Particulars', ...compCols, 'Total Equity'];

  const pdfRows = () =>
    rows.map((r) => ({
      cells: [r.label, ...r.cols.map(fmtNum)],
      bold: r.kind === 'grand',
      grand: r.kind === 'grand',
      indent: 0,
    }));

  const csvRows = () => rows.map((r) => [r.label, ...r.cols.map(fmtNum)] as unknown[]);

  const doPdf = async () => {
    setBusy(true);
    try {
      await exportReportPdf({
        filename: `${fname}.pdf`,
        company: settings,
        title: TITLE,
        period,
        orientation: 'landscape',
        columns: [
          { label: 'Particulars', align: 'l', width: 0.32 },
          ...compCols.map((c) => ({ label: c, align: 'r' as const, width: 0.136 })),
          { label: 'Total Equity', align: 'r' as const, width: 0.136 },
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
    downloadCSV(`${fname}.csv`, colLabels, csvRows());
    toast('CSV exported');
  };

  const doXlsx = async () => {
    setBusy(true);
    try {
      await downloadXLSX(`${fname}.xlsx`, [{
        name: 'Changes in Equity',
        headers: colLabels,
        rows: csvRows(),
        widths: [34, 20, 20, 20, 20, 20],
      }]);
      toast('Excel workbook exported');
    } catch (e) {
      toast(`Excel export failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !snap || !ce) return <Page title="Changes in Equity"><LoadingCard /></Page>;

  return (
    <Page
      title="Changes in Equity"
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
          title="No equity activity in this period"
          text="No posted journal entries affect equity within the selected period. Adjust the date range or post a journal entry."
        />
      ) : (
        <ReportShell>
          <ReportHeader company={settings} title={TITLE} period={period} />
          <ReportTable
            cols={[
              { label: 'Particulars', align: 'l', width: '30%' },
              ...compCols.map((c) => ({ label: c, align: 'r' as const })),
              { label: 'Total Equity', align: 'r' as const },
            ]}
            rows={rows.map((r) => ({
              kind: r.kind,
              cells: [r.label, ...r.cols.map((v, i) => <Neg key={i} value={v} />)],
            }))}
          />
          <ReportFooter company={settings} period={period} />
        </ReportShell>
      )}
    </Page>
  );
}
