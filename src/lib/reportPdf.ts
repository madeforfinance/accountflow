/* Professional PDF export for accounting reports (lazy-loaded jsPDF).
   Documents carry ONLY the business's identity — never the application name. */
import { CompanySettings } from '../accounting/types';
import { fmtDate, todayISO } from './format';

export interface PdfColumn {
  label: string;
  align?: 'l' | 'r' | 'c';
  /** fraction of table width; must sum to ~1 */
  width?: number;
}

export interface PdfRow {
  cells: string[];
  bold?: boolean;
  size?: number;
  /** extra top padding for section headers */
  section?: boolean;
  /** double rule above (grand totals) */
  grand?: boolean;
  /** single rule above (subtotals) */
  ruleAbove?: boolean;
  indent?: number;
}

export interface ReportPdfOpts {
  filename: string;
  company: CompanySettings;
  title: string;
  period: string;
  orientation?: 'portrait' | 'landscape';
  columns: PdfColumn[];
  rows: PdfRow[];
  notes?: string[];
}

function wrap(doc: any, text: string, maxW: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (doc.getTextWidth(t) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export async function exportReportPdf(o: ReportPdfOpts): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const landscape = o.orientation === 'landscape';
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 44; // margin
  const tableW = pageW - M * 2;
  const footerH = 44;

  const c = o.company;
  const addr = [c.address, c.city, c.country].filter(Boolean).join(', ');
  const contact = [c.phone, c.email].filter(Boolean).join('  |  ');
  const reg = [c.regNumber, c.taxNumber].filter(Boolean).join('  |  ');

  // ---- column widths ----
  const n = o.columns.length;
  const widths = o.columns.map((col) => (col.width ?? 1 / n) * tableW);

  let page = 1;
  const newPage = () => {
    doc.addPage();
    page++;
    y = M + 6;
  };
  let y = 0;

  const drawHeaderBlock = () => {
    y = M;
    if (c.logo) {
      try { doc.addImage(c.logo, 'PNG', M, y, 0, 34); } catch { /* logo optional */ }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(11, 31, 58);
    doc.text(c.businessName || '', M + (c.logo ? 44 : 0), y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 112, 133);
    let yy = y + 28;
    if (addr) { doc.text(addr, M, yy); yy += 11; }
    if (contact) { doc.text(contact, M, yy); yy += 11; }
    if (reg) { doc.text(reg, M, yy); yy += 11; }
    yy += 6;
    doc.setDrawColor(11, 31, 58);
    doc.setLineWidth(1.4);
    doc.line(M, yy, pageW - M, yy);
    yy += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(11, 31, 58);
    doc.text(o.title.toUpperCase(), pageW / 2, yy, { align: 'center' });
    yy += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(102, 112, 133);
    doc.text(o.period, pageW / 2, yy, { align: 'center' });
    yy += 6;
    doc.setFontSize(8.5);
    doc.text(`Currency: ${c.baseCurrency}`, pageW / 2, yy, { align: 'center' });
    y = yy + 16;
  };

  const drawTableHead = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 112, 133);
    const hh = 20;
    let x = M;
    doc.setDrawColor(11, 31, 58);
    doc.setLineWidth(1);
    o.columns.forEach((col, i) => {
      const lines = wrap(doc, col.label.toUpperCase(), widths[i] - 8);
      const h = Math.max(hh, lines.length * 10 + 8);
      lines.forEach((ln, li) => {
        const tx = col.align === 'r' ? x + widths[i] - 4 : col.align === 'c' ? x + widths[i] / 2 : x + 4;
        doc.text(ln, tx, y + 12 + li * 10, { align: col.align === 'r' ? 'right' : col.align === 'c' ? 'center' : 'left' });
      });
      x += widths[i];
      void h;
    });
    y += hh;
    doc.line(M, y, pageW - M, y);
    y += 4;
  };

  const ensure = (need: number) => {
    if (y + need > pageH - footerH) {
      newPage();
      drawTableHead();
    }
  };

  // ---- first page ----
  drawHeaderBlock();
  drawTableHead();

  // ---- rows ----
  for (const row of o.rows) {
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.size ?? 9);
    doc.setTextColor(row.section ? 11 : 23, row.section ? 31 : 32, row.section ? 58 : 51);
    const cellLines = row.cells.map((cell, i) =>
      wrap(doc, cell, widths[i] - 8 - (row.indent && i === 0 ? row.indent * 10 : 0)),
    );
    const rowH = Math.max(...cellLines.map((l) => l.length)) * 11 + 8 + (row.section ? 8 : 0);
    ensure(rowH);
    if (row.section) y += 6;
    if (row.grand || row.ruleAbove) {
      doc.setDrawColor(11, 31, 58);
      doc.setLineWidth(row.grand ? 1.6 : 0.8);
      doc.line(M, y - 2, pageW - M, y - 2);
      if (row.grand) doc.line(M, y + rowH - 4, pageW - M, y + rowH - 4);
    }
    let x = M;
    row.cells.forEach((cell, i) => {
      const col = o.columns[i];
      const ix = x + (row.indent && i === 0 ? row.indent * 10 : 0);
      cellLines[i].forEach((ln, li) => {
        const tx = col.align === 'r' ? x + widths[i] - 4 : col.align === 'c' ? x + widths[i] / 2 : ix + 4;
        doc.text(ln, tx, y + 10 + li * 11, { align: col.align === 'r' ? 'right' : col.align === 'c' ? 'center' : 'left' });
      });
      x += widths[i];
    });
    y += rowH;
    doc.setDrawColor(238, 241, 246);
    doc.setLineWidth(0.5);
    if (!row.section && !row.grand) doc.line(M, y - 3, pageW - M, y - 3);
  }

  // ---- notes ----
  if (o.notes?.length) {
    ensure(30);
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 112, 133);
    for (const note of o.notes) {
      for (const ln of wrap(doc, note, tableW)) {
        ensure(12);
        doc.text(ln, M, y);
        y += 11;
      }
      y += 3;
    }
  }

  // ---- footers on all pages ----
  const pages = doc.getNumberOfPages();
  const genLine = `Generated ${fmtDate(todayISO())}`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 170);
    const foot = c.docFooter || `Prepared for ${c.businessName}`;
    const fl = wrap(doc, foot, tableW - 160);
    doc.text(fl[0] ?? '', M, pageH - 26);
    doc.text(genLine, pageW / 2, pageH - 26, { align: 'center' });
    doc.text(`Page ${i} of ${pages}`, pageW - M, pageH - 26, { align: 'right' });
  }

  doc.save(o.filename);
}
