import React, { useMemo, useState } from 'react';
import { FileDown, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Btn, Field, EmptyState, Segmented, Badge } from '../components/ui';
import { LoadingCard } from '../components/acct';
import { saveJournalEntry } from '../accounting/data';
import { validateImportGroups, ImportRow } from '../accounting/validation';
import { uid } from '../storage/db';
import { pickFile, readFileText, downloadCSV } from '../lib/files';
import { fmtMoneyFull } from '../lib/format';
import { toast } from '../lib/toast';

/** Robust CSV parser: quoted fields, embedded commas/newlines, escaped quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\r') {
      // skip; \n completes the row
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const TEMPLATE_HEADERS = ['Date', 'Entry Number', 'Reference', 'Description', 'Account Code', 'Account Name', 'Debit', 'Credit', 'Memo'];

export default function ImportPage() {
  const { snap } = useAccounting();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [mode, setMode] = useState<'draft' | 'post'>('draft');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ entries: number; lines: number; posted: boolean } | null>(null);

  const validation = useMemo(
    () => (rows && snap ? validateImportGroups(rows, snap.accounts) : null),
    [rows, snap],
  );

  const extraErrors = useMemo(() => {
    const errs: string[] = [];
    if (!validation || !validation.ok || !snap) return errs;
    const existing = new Set(snap.entries.map((e) => e.entryNo));
    const seen = new Set<string>();
    for (const g of validation.groups) {
      const no = g[0].entryNumber;
      if (existing.has(no)) errs.push(`Entry number "${no}" already exists — choose a different number.`);
      const dates = new Set(g.map((r) => r.date));
      if (dates.size > 1) errs.push(`Entry number "${no}" is used on more than one date.`);
      if (seen.has(no)) errs.push(`Entry number "${no}" appears twice in the file.`);
      seen.add(no);
    }
    return errs;
  }, [validation, snap]);

  const canImport = validation?.ok && extraErrors.length === 0 && validation.groups.length > 0;

  if (!snap) return <Page title="Import Journal"><LoadingCard /></Page>;

  const doTemplate = () => {
    downloadCSV('journal-import-template.csv', TEMPLATE_HEADERS, [
      ['2026-01-05', 'JE-000001', 'CAP-001', 'Owner invested cash', '1110', 'Cash', 1000000, '', 'Initial capital'],
      ['2026-01-05', 'JE-000001', 'CAP-001', 'Owner invested cash', '3100', 'Share Capital', '', 1000000, 'Initial capital'],
    ]);
    toast('Template downloaded');
  };

  const doPick = async () => {
    const f = await pickFile('.csv');
    if (!f) return;
    setSummary(null);
    try {
      const text = await readFileText(f);
      const grid = parseCSV(text);
      if (grid.length === 0) {
        toast('The file is empty', 'error');
        return;
      }
      const data = grid[0][0].trim().toLowerCase() === 'date' ? grid.slice(1) : grid;
      const parsed: ImportRow[] = data.map((c, i) => ({
        line: i + 2,
        date: (c[0] ?? '').trim(),
        entryNumber: (c[1] ?? '').trim(),
        reference: (c[2] ?? '').trim(),
        description: (c[3] ?? '').trim(),
        accountCode: (c[4] ?? '').trim(),
        accountName: (c[5] ?? '').trim(),
        debit: c[6] === '' || c[6] == null ? 0 : Number(c[6]),
        credit: c[7] === '' || c[7] == null ? 0 : Number(c[7]),
        memo: (c[8] ?? '').trim(),
      }));
      setRows(parsed);
    } catch {
      toast('Could not read the file', 'error');
    }
  };

  const doImport = async () => {
    if (!validation || !canImport || !snap) return;
    setBusy(true);
    const byCode = new Map(snap.accounts.filter((a) => a.postable).map((a) => [a.code, a]));
    let done = 0;
    let lineCount = 0;
    try {
      for (const g of validation.groups) {
        const head = g[0];
        const lines = g.map((r) => ({
          id: uid('jl_'),
          accountId: byCode.get(r.accountCode)!.id,
          accountCode: r.accountCode,
          description: r.memo,
          debit: r.debit,
          credit: r.credit,
        }));
        const res = await saveJournalEntry(
          snap,
          {
            entryNo: head.entryNumber,
            date: head.date,
            reference: head.reference,
            description: head.description,
            kind: 'general',
            lines,
          },
          { post: mode === 'post' },
        );
        if (!res.ok) {
          toast(`Import stopped at ${head.entryNumber}: ${res.errors[0] ?? 'validation failed'}`, 'error');
          break;
        }
        done++;
        lineCount += lines.length;
      }
      setSummary({ entries: done, lines: lineCount, posted: mode === 'post' });
      if (done === validation.groups.length) toast(`Imported ${done} ${done === 1 ? 'entry' : 'entries'} as ${mode === 'post' ? 'posted' : 'drafts'}`);
      else toast(`Imported ${done} of ${validation.groups.length} entries — stopped on error`, 'error');
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Import Journal"
      subtitle="Bulk-import balanced journal entries from a CSV file"
      actions={
        <>
          <Btn size="sm" icon={<FileDown size={15} />} onClick={doTemplate}>CSV template</Btn>
          <Btn size="sm" variant="primary" icon={<Upload size={15} />} onClick={doPick}>Choose CSV file</Btn>
        </>
      }
    >
      <Card title="How it works" subtitle="Every row is validated before anything is imported">
        <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Download the template, fill one row per journal <b>line</b> — lines sharing an entry number form one entry.</li>
          <li>Dates must be <b>YYYY-MM-DD</b>; account codes must exist in the chart of accounts.</li>
          <li>Every entry group must balance (debits = credits). If <b>any</b> group fails validation, the whole import is blocked.</li>
          <li>Imported entries keep the entry numbers from the CSV.</li>
        </ul>
      </Card>

      {validation && (
        <Card
          title={`File preview — ${validation.groups.length} ${validation.groups.length === 1 ? 'entry' : 'entries'}`}
          subtitle={`${rows?.length ?? 0} lines parsed`}
        >
          {[...validation.errors, ...extraErrors].length > 0 ? (
            <div>
              <div className="rpt-flag" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertTriangle size={16} /> Import blocked — fix these errors and try again.
              </div>
              <ul style={{ margin: '0 0 4px', paddingLeft: 20, lineHeight: 1.9, color: 'var(--danger)' }}>
                {[...validation.errors, ...extraErrors].map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          ) : (
            <>
              <div className="rpt-ok" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <CheckCircle2 size={16} /> All entries are valid and balanced.
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Entry No.</th><th>Date</th><th>Description</th><th>Code</th><th>Account</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr>
                  </thead>
                  <tbody>
                    {validation.groups.map((g, gi) => (
                      <React.Fragment key={gi}>
                        <tr className="row-hi">
                          <td colSpan={7}>
                            <b>{g[0].entryNumber}</b>
                            <span className="muted" style={{ marginLeft: 10 }}>{g[0].description || '—'} · {g[0].reference || 'no reference'}</span>
                          </td>
                        </tr>
                        {g.map((r, ri) => (
                          <tr key={ri}>
                            <td />
                            <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                            <td>{r.memo}</td>
                            <td className="num">{r.accountCode}</td>
                            <td>{r.accountName}</td>
                            <td className="num" style={{ textAlign: 'right' }}>{r.debit ? fmtMoneyFull(r.debit) : ''}</td>
                            <td className="num" style={{ textAlign: 'right' }}>{r.credit ? fmtMoneyFull(r.credit) : ''}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <Field label="Import mode">
                  <Segmented<'draft' | 'post'>
                    options={[{ value: 'draft', label: 'Save as drafts' }, { value: 'post', label: 'Post immediately' }]}
                    value={mode}
                    onChange={setMode}
                  />
                </Field>
                <Btn variant="primary" onClick={doImport} disabled={busy || !canImport} style={{ marginTop: 22 }}>
                  {busy ? 'Importing…' : `Import ${validation.groups.length} ${validation.groups.length === 1 ? 'entry' : 'entries'}`}
                </Btn>
              </div>
            </>
          )}
        </Card>
      )}

      {summary && (
        <Card title="Import summary">
          <p style={{ margin: 0 }}>
            <Badge tone="green">{summary.entries} {summary.entries === 1 ? 'entry' : 'entries'}</Badge>{' '}
            <Badge tone="blue">{summary.lines} lines</Badge>{' '}
            <Badge tone={summary.posted ? 'green' : 'amber'}>{summary.posted ? 'Posted' : 'Saved as drafts'}</Badge>
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            The journal, ledgers, trial balance and financial statements have been recalculated automatically.
          </p>
        </Card>
      )}

      {!validation && !summary && (
        <Card>
          <EmptyState
            icon={<Upload size={28} />}
            title="No file selected"
            text="Choose a CSV file to preview it here, or download the template to see the expected format."
            action={<Btn size="sm" icon={<FileDown size={15} />} onClick={doTemplate}>Download CSV template</Btn>}
          />
        </Card>
      )}
    </Page>
  );
}
