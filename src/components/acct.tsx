/* Shared accounting UI — date presets, export buttons, account select, badges. */
import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Account, CompanySettings, EntryStatus, JournalEntry } from '../accounting/types';
import { flatAccounts } from '../accounting/engine';
import { Btn, Badge, Field, TextInput, Select } from './ui';
import { fmtDate, todayISO } from '../lib/format';

/* ---------------- date range presets ---------------- */

export type DatePreset = 'today' | 'month' | 'quarter' | 'year' | 'prevYear' | 'custom';

export function presetRange(preset: DatePreset, fyStart: string, fyEnd: string, custom: { from: string; to: string }): { from: string; to: string } {
  const t = todayISO();
  const y = t.slice(0, 4);
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'month': return { from: `${t.slice(0, 7)}-01`, to: t };
    case 'quarter': {
      const q = Math.floor((Number(t.slice(5, 7)) - 1) / 3);
      const sm = String(q * 3 + 1).padStart(2, '0');
      return { from: `${y}-${sm}-01`, to: t };
    }
    case 'year': return { from: fyStart, to: fyEnd < t ? fyEnd : t };
    case 'prevYear': {
      const ps = `${Number(fyStart.slice(0, 4)) - 1}${fyStart.slice(4)}`;
      const pe = `${Number(fyEnd.slice(0, 4)) - 1}${fyEnd.slice(4)}`;
      return { from: ps, to: pe };
    }
    case 'custom': return custom;
  }
}

export function useDateRange(settings: CompanySettings, initial: DatePreset = 'year') {
  const [preset, setPreset] = useState<DatePreset>(initial);
  const [custom, setCustom] = useState({ from: settings.fiscalYearStart, to: settings.fiscalYearEnd });
  const range = useMemo(
    () => presetRange(preset, settings.fiscalYearStart, settings.fiscalYearEnd, custom),
    [preset, settings.fiscalYearStart, settings.fiscalYearEnd, custom],
  );
  return { preset, setPreset, custom, setCustom, ...range };
}

export function DateRangeControl({ preset, setPreset, custom, setCustom }: {
  preset: DatePreset; setPreset: (p: DatePreset) => void;
  custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void;
}) {
  const presets: { v: DatePreset; label: string }[] = [
    { v: 'today', label: 'Today' },
    { v: 'month', label: 'This Month' },
    { v: 'quarter', label: 'This Quarter' },
    { v: 'year', label: 'This Year' },
    { v: 'prevYear', label: 'Previous Year' },
    { v: 'custom', label: 'Custom' },
  ];
  return (
    <div className="filter-bar">
      <div className="chip-row" role="tablist" aria-label="Date range">
        {presets.map((p) => (
          <button key={p.v} type="button" className={`chip${preset === p.v ? ' active' : ''}`}
            onClick={() => setPreset(p.v)} role="tab" aria-selected={preset === p.v}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <Field label="From"><TextInput type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
        </>
      )}
    </div>
  );
}

export function AsOfControl({ asOf, setAsOf }: { asOf: string; setAsOf: (d: string) => void }) {
  return (
    <div className="filter-bar">
      <Field label="As of date">
        <TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </Field>
    </div>
  );
}

/* ---------------- export buttons ---------------- */

export function ExportButtons({ onPdf, onCsv, onXlsx, onPrint, busy }: {
  onPdf?: () => void | Promise<void>;
  onCsv?: () => void | Promise<void>;
  onXlsx?: () => void | Promise<void>;
  onPrint?: () => void;
  busy?: boolean;
}) {
  const doPrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {onPdf && <Btn size="sm" icon={<FileText />} onClick={onPdf} disabled={busy}>PDF</Btn>}
      {onCsv && <Btn size="sm" icon={<FileDown />} onClick={onCsv} disabled={busy}>CSV</Btn>}
      {onXlsx && <Btn size="sm" icon={<FileSpreadsheet />} onClick={onXlsx} disabled={busy}>Excel</Btn>}
      <Btn size="sm" icon={<Printer />} onClick={doPrint} disabled={busy}>Print</Btn>
    </div>
  );
}

/* ---------------- account select ---------------- */

export function AccountSelect({ accounts, value, onChange, showCode = true, postableOnly = true, label, placeholder = 'Select account…' }: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  showCode?: boolean;
  postableOnly?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const flat = useMemo(() => flatAccounts(accounts), [accounts]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label || placeholder}>
      <option value="">{placeholder}</option>
      {flat.map(({ account, indent }) => {
        if (postableOnly && !account.postable) return null;
        if (account.status !== 'active') return null;
        const name = showCode ? `${account.code} — ${account.name}` : account.name;
        return (
          <option key={account.id} value={account.id}>
            {'\u00A0\u00A0'.repeat(indent)}{name}
          </option>
        );
      })}
    </Select>
  );
}

/* ---------------- badges / misc ---------------- */

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  const tone = status === 'posted' ? 'green' : status === 'draft' ? 'amber' : 'gray';
  const label = status === 'posted' ? 'Posted' : status === 'draft' ? 'Draft' : 'Reversed';
  return <Badge tone={tone}>{label}</Badge>;
}

export function KindBadge({ kind }: { kind: JournalEntry['kind'] }) {
  const labels: Record<string, string> = {
    general: 'General', sales: 'Sales', purchase: 'Purchase', 'cash-receipt': 'Cash Receipt',
    'cash-payment': 'Cash Payment', 'bank-receipt': 'Bank Receipt', 'bank-payment': 'Bank Payment',
    payroll: 'Payroll', expense: 'Expense', depreciation: 'Depreciation', inventory: 'Inventory',
    adjustment: 'Adjustment', opening: 'Opening', closing: 'Closing',
  };
  return <Badge tone="blue">{labels[kind] ?? kind}</Badge>;
}

export function DemoBanner({ onReset }: { onReset?: () => void }) {
  return (
    <div className="demo-banner no-print">
      <Badge tone="gold">Demo Company</Badge>
      <span>You are viewing the fictional demo company <b>PakTech Trading (Pvt.) Ltd.</b> All figures are illustrative.</span>
      {onReset && <Btn size="sm" variant="ghost" onClick={onReset} style={{ color: '#fff' }}>Reset demo data</Btn>}
    </div>
  );
}

/** Guard for pages that need loaded data. */
export function LoadingCard() {
  return (
    <div className="card"><p className="muted">Loading accounting data…</p></div>
  );
}

export function fmtPeriod(from: string, to: string): string {
  return `${fmtDate(from)} to ${fmtDate(to)}`;
}
