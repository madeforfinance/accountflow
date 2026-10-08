/* Formal accounting report components — shared by screen, print and PDF.
   These render the business's own identity only. The application/product name
   must NEVER appear in exported accounting documents. */
import React from 'react';
import { CompanySettings } from '../accounting/types';
import { fmtDate, fmtMoneyFull, fmtAcct, todayISO } from '../lib/format';

export function Money({ value, digits }: { value: number; digits?: number }) {
  return <span className="num">{fmtMoneyFull(value, digits)}</span>;
}

export function Acct({ value, digits }: { value: number; digits?: number }) {
  return <span className="num">{fmtAcct(value, digits)}</span>;
}

export function ReportShell({ children }: { children: React.ReactNode }) {
  return <div className="report">{children}</div>;
}

export function ReportHeader({ company, title, period, extra }: {
  company: CompanySettings;
  title: string;
  period: string;
  extra?: React.ReactNode;
}) {
  const contact = [company.phone, company.email].filter(Boolean).join('  |  ');
  const addr = [company.address, company.city, company.country].filter(Boolean).join(', ');
  return (
    <div className="rpt-head">
      {company.logo && <img className="rpt-logo" src={company.logo} alt="" />}
      <div className="rpt-co">{company.businessName}</div>
      {(addr || contact) && (
        <div className="rpt-co-sub">
          {addr}
          {addr && contact ? <br /> : null}
          {contact}
        </div>
      )}
      {(company.regNumber || company.taxNumber) && (
        <div className="rpt-co-sub">
          {[company.regNumber, company.taxNumber].filter(Boolean).join('  |  ')}
        </div>
      )}
      <div className="rpt-title">{title}</div>
      <div className="rpt-period">{period}</div>
      {extra}
    </div>
  );
}

export function ReportFooter({ company, period }: { company: CompanySettings; period: string }) {
  return (
    <div className="rpt-foot">
      <span>Prepared for: {company.businessName}</span>
      <span>Reporting period: {period}</span>
      <span>Currency: {company.baseCurrency}</span>
      <span>Generated: {fmtDate(todayISO())}</span>
    </div>
  );
}

export interface RptCol {
  label: string;
  align?: 'l' | 'r' | 'c';
  width?: string;
}

export type RptRowKind = 'data' | 'section' | 'sub' | 'sub2' | 'total' | 'grand' | 'note';

/** Formal report table — right-aligned numbers, hierarchy rows, double-rule grand totals. */
export function ReportTable({ cols, rows }: {
  cols: RptCol[];
  rows: { kind: RptRowKind; cells: React.ReactNode[] }[];
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="rpt">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={c.align === 'r' ? 'n' : ''} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.kind === 'data' ? '' : `rpt-${r.kind}`}>
              {r.cells.map((cell, j) => (
                <td key={j} className={cols[j]?.align === 'r' ? 'n' : ''} colSpan={r.kind === 'note' ? cols.length : 1}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Standard date-range label for flow reports. */
export function periodLabel(from: string, to: string): string {
  return `For the period ${fmtDate(from)} to ${fmtDate(to)}`;
}

/** Standard as-of label for position reports. */
export function asOfLabel(asOf: string): string {
  return `As at ${fmtDate(asOf)}`;
}
