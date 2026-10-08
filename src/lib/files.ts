/* File download helpers — CSV, JSON, XLSX. No HTML disguised as CSV. */
import { csvCell } from './format';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 800);
}

export function downloadCSV(filename: string, headers: string[], rows: (unknown[][] | unknown[][][])) {
  const flat = rows as unknown[][];
  const lines = [headers.map(csvCell).join(',')];
  for (const r of flat) lines.push(r.map(csvCell).join(','));
  const bom = '﻿';
  downloadBlob(new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export function downloadJSON(filename: string, data: unknown) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
  /** optional per-column widths (wch units) */
  widths?: number[];
}

/** Real .xlsx via SheetJS — headers, totals, column widths preserved. */
export async function downloadXLSX(filename: string, sheets: XlsxSheet[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.headers, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (s.widths) ws['!cols'] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/** Pick a local file (used by import + logo upload). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function readFileDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
