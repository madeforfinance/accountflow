import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Copy, Eraser, Save, CheckCircle2, RotateCcw, Printer, ArrowLeft, Lock } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Btn, Field, TextInput, Textarea, Select, EmptyState } from '../components/ui';
import { AccountSelect, EntryStatusBadge, KindBadge, LoadingCard } from '../components/acct';
import { ReportShell, ReportHeader, ReportFooter, ReportTable } from '../components/report';
import { saveJournalEntry, reverseJournalEntry } from '../accounting/data';
import { entryTotals, isDateLocked, accountLabel } from '../accounting/engine';
import { ENTRY_KINDS, JournalEntry, JournalLine } from '../accounting/types';
import { uid } from '../storage/db';
import { fmtDate, fmtMoneyFull, parseAmount, round2, todayISO } from '../lib/format';
import { toast } from '../lib/toast';
import { exportReportPdf } from '../lib/reportPdf';

interface LineDraft {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

const blankLine = (): LineDraft => ({ key: uid('k_'), accountId: '', description: '', debit: '', credit: '' });

export default function JournalFormPage() {
  const { snap } = useAccounting();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const nav = useNavigate();

  const existing = snap?.entries.find((e) => e.id === id);
  const duplicateOf: string | undefined = (location.state as any)?.duplicateOf;
  const presetKind: JournalEntry['kind'] | undefined = (location.state as any)?.kind;
  const presetHint: string | undefined = (location.state as any)?.presetHint;
  const duplicateSrc = duplicateOf ? snap?.entries.find((e) => e.id === duplicateOf) : undefined;
  const editMode = !!id && searchParams.get('edit') === '1';
  const viewOnly = !!existing && !editMode;
  const printMode = !!(location.state as any)?.print && viewOnly;

  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [kind, setKind] = useState<JournalEntry['kind']>(existing?.kind ?? presetKind ?? 'general');
  const [reference, setReference] = useState(existing?.reference ?? '');
  const [description, setDescription] = useState(existing?.description ?? duplicateSrc?.description ?? presetHint ?? '');
  const [source, setSource] = useState(existing?.source ?? '');
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const src = existing ?? duplicateSrc;
    if (src) return src.lines.map((l) => ({ key: uid('k_'), accountId: l.accountId, description: l.description, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' }));
    return [blankLine(), blankLine()];
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (printMode) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [printMode]);

  const parsed = useMemo(() => {
    return lines.map((l) => {
      const d = l.debit.trim() === '' ? 0 : parseAmount(l.debit);
      const c = l.credit.trim() === '' ? 0 : parseAmount(l.credit);
      return { ...l, debitNum: d, creditNum: c, invalid: d === null || c === null };
    });
  }, [lines]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of parsed) {
      if (l.debitNum) d = round2(d + l.debitNum);
      if (l.creditNum) c = round2(c + l.creditNum);
    }
    return { debit: d, credit: c, diff: round2(d - c) };
  }, [parsed]);

  const balanced = totals.diff === 0 && totals.debit > 0;
  const locked = snap ? isDateLocked(snap.periods, date) : false;

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const duplicateLine = (key: string) => {
    const l = lines.find((x) => x.key === key);
    if (l) setLines((ls) => [...ls, { ...l, key: uid('k_') }]);
  };
  const clearLine = (key: string) => setLine(key, { accountId: '', description: '', debit: '', credit: '' });

  const buildLines = (): JournalLine[] =>
    parsed
      .filter((l) => l.accountId || l.debitNum || l.creditNum)
      .map((l) => ({
        id: uid('jl_'),
        accountId: l.accountId,
        accountCode: snap?.accounts.find((a) => a.id === l.accountId)?.code ?? '',
        description: l.description,
        debit: l.debitNum || 0,
        credit: l.creditNum || 0,
      }));

  const doSave = async (post: boolean) => {
    if (!snap || saving) return;
    if (post && parsed.some((l) => l.invalid)) {
      setErrors(['Some amounts are not valid numbers.']);
      return;
    }
    setSaving(true);
    try {
      const res = await saveJournalEntry(
        snap,
        {
          id: editMode ? existing?.id : undefined,
          date, kind, reference, description, source, memo,
          lines: buildLines(),
        },
        { post },
      );
      if (!res.ok) {
        setErrors(res.errors);
        window.scrollTo({ top: 0 });
      } else {
        toast(post ? `Posted ${res.entry!.entryNo}` : `Draft saved`);
        nav('/accounting/journal');
      }
    } catch (err: any) {
      setErrors([err.message || 'Save failed']);
    } finally {
      setSaving(false);
    }
  };

  const doReverse = async () => {
    if (!snap || !existing) return;
    if (!window.confirm(`Reverse ${existing.entryNo} with an equal-and-opposite entry?`)) return;
    try {
      const rev = await reverseJournalEntry(snap, existing.id);
      toast(`Reversed with ${rev.entryNo}`);
      nav('/accounting/journal');
    } catch (err: any) {
      toast(err.message || 'Reversal failed', 'error');
    }
  };

  const doPdf = async () => {
    if (!snap || !existing) return;
    const acc = new Map(snap.accounts.map((a) => [a.id, a]));
    const t = entryTotals(existing);
    await exportReportPdf({
      filename: `${existing.entryNo}.pdf`,
      company: snap.settings,
      title: `Journal Entry ${existing.entryNo}`,
      period: fmtDate(existing.date),
      orientation: 'landscape',
      columns: [
        { label: 'Account', width: 0.34 },
        { label: 'Description', width: 0.32 },
        { label: 'Debit', align: 'r', width: 0.17 },
        { label: 'Credit', align: 'r', width: 0.17 },
      ],
      rows: [
        ...existing.lines.map((l) => ({
          cells: [
            accountLabel(acc.get(l.accountId)!, snap.settings.showAccountCodes),
            l.description || existing.description,
            l.debit ? fmtMoneyFull(l.debit) : '',
            l.credit ? fmtMoneyFull(l.credit) : '',
          ],
        })),
        { cells: ['', 'Total', fmtMoneyFull(t.debit), fmtMoneyFull(t.credit)], bold: true, ruleAbove: true },
      ],
      notes: [
        `Reference: ${existing.reference || '—'}   ·   Type: ${existing.kind}   ·   Status: ${existing.status}`,
        existing.memo ? `Memo: ${existing.memo}` : '',
      ].filter(Boolean),
    });
    toast('Journal entry exported to PDF');
  };

  // keyboard shortcuts
  useEffect(() => {
    if (viewOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (balanced && !locked) doSave(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOnly, balanced, locked, date, kind, reference, description, source, memo, lines]);

  if (!snap) return <Page title="Journal Entry"><LoadingCard /></Page>;
  if (id && !existing) {
    return (
      <Page title="Journal Entry">
        <EmptyState title="Entry not found" text="This journal entry does not exist." action={<Link to="/accounting/journal"><Btn>Back to Journal</Btn></Link>} />
      </Page>
    );
  }

  const title = existing ? (viewOnly ? `Journal Entry ${existing.entryNo}` : `Edit Draft ${existing.entryNo}`) : 'New Journal Entry';

  /* ---------- read-only view ---------- */
  if (viewOnly && existing) {
    const acc = new Map(snap.accounts.map((a) => [a.id, a]));
    const t = entryTotals(existing);
    return (
      <Page
        title={title}
        subtitle={`${fmtDate(existing.date)} · ${existing.description}`}
        actions={
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn icon={<ArrowLeft />} onClick={() => nav('/accounting/journal')}>Back</Btn>
            <Btn icon={<Printer />} onClick={doPdf}>PDF</Btn>
            <Btn icon={<Printer />} onClick={() => window.print()}>Print</Btn>
            {existing.status === 'posted' && !existing.reversedBy && (
              <Btn variant="gold" icon={<RotateCcw />} onClick={doReverse}>Reverse Entry</Btn>
            )}
          </div>
        }
      >
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <EntryStatusBadge status={existing.status} />
          <KindBadge kind={existing.kind} />
          {existing.reversedBy && <span className="muted small">Reversed — see audit log for the reversal entry.</span>}
          {existing.reverses && <span className="muted small">This entry reverses another entry.</span>}
        </div>
        <ReportShell>
          <ReportHeader company={snap.settings} title={`Journal Entry ${existing.entryNo}`} period={fmtDate(existing.date)} />
          <ReportTable
            cols={[
              { label: 'Account' },
              { label: 'Description' },
              { label: 'Debit', align: 'r' },
              { label: 'Credit', align: 'r' },
            ]}
            rows={[
              ...existing.lines.map((l) => ({
                kind: 'data' as const,
                cells: [
                  accountLabel(acc.get(l.accountId)!, snap.settings.showAccountCodes),
                  l.description || existing.description,
                  l.debit ? fmtMoneyFull(l.debit) : '—',
                  l.credit ? fmtMoneyFull(l.credit) : '—',
                ],
              })),
              { kind: 'total' as const, cells: ['', 'Total', fmtMoneyFull(t.debit), fmtMoneyFull(t.credit)] },
            ]}
          />
          <div style={{ marginTop: 16 }} className="small">
            <div className="kv"><span className="k">Reference</span><span className="v">{existing.reference || '—'}</span></div>
            <div className="kv"><span className="k">Type</span><span className="v">{existing.kind}</span></div>
            {existing.source && <div className="kv"><span className="k">Source</span><span className="v">{existing.source}</span></div>}
            {existing.memo && <div className="kv"><span className="k">Memo</span><span className="v">{existing.memo}</span></div>}
          </div>
          <ReportFooter company={snap.settings} period={fmtDate(existing.date)} />
        </ReportShell>
      </Page>
    );
  }

  /* ---------- edit / new ---------- */
  return (
    <Page
      title={title}
      subtitle="Debits must equal credits before posting. Ctrl+S saves a draft, Ctrl+Enter posts."
      actions={
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <Btn icon={<ArrowLeft />} onClick={() => nav('/accounting/journal')}>Back</Btn>
        </div>
      }
    >
      {errors.length > 0 && (
        <div className="rpt-flag">
          <b>Cannot save:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {locked && (
        <div className="rpt-warn" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Lock style={{ width: 16, height: 16 }} /> This date falls in a locked period — the entry can be saved as a draft but not posted.
        </div>
      )}

      <Card title="Entry details">
        <div className="form-grid">
          <Field label="Date" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Entry type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as JournalEntry['kind'])}>
              {ENTRY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Reference" hint="e.g. INV-0001">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" />
          </Field>
          <Field label="Source" hint="e.g. Sales Invoice, Bank, Payroll">
            <TextInput value={source} onChange={(e) => setSource(e.target.value)} placeholder="Optional source" />
          </Field>
        </div>
        <Field label="Description" required>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this entry for?" />
        </Field>
        <Field label="Memo">
          <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Internal notes (optional)" rows={2} />
        </Field>
      </Card>

      <Card title="Lines" actions={<Btn size="sm" icon={<Plus />} onClick={addLine}>Add line</Btn>}>
        <div className="je-lines">
          {lines.map((l, i) => (
            <div key={l.key} className={`je-line${parsed[i]?.invalid ? ' invalid-line' : ''}`}>
              <div className="je-acct">
                <label className="sr-only" htmlFor={`acc-${l.key}`}>Account</label>
                <AccountSelect
                  accounts={snap.accounts}
                  value={l.accountId}
                  onChange={(v) => setLine(l.key, { accountId: v })}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`desc-${l.key}`}>Line description</label>
                <TextInput
                  id={`desc-${l.key}`}
                  placeholder="Line description"
                  value={l.description}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } }}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`dr-${l.key}`}>Debit</label>
                <TextInput
                  id={`dr-${l.key}`} inputMode="decimal" placeholder="Debit" className="num"
                  value={l.debit} style={{ textAlign: 'right' }}
                  onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value.trim() !== '' ? '' : l.credit })}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`cr-${l.key}`}>Credit</label>
                <TextInput
                  id={`cr-${l.key}`} inputMode="decimal" placeholder="Credit" className="num"
                  value={l.credit} style={{ textAlign: 'right' }}
                  onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value.trim() !== '' ? '' : l.debit })}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" style={{ width: 36, height: 36 }} title="Duplicate line" onClick={() => duplicateLine(l.key)}><Copy style={{ width: 15, height: 15 }} /></button>
                <button className="icon-btn" style={{ width: 36, height: 36 }} title="Clear line" onClick={() => clearLine(l.key)}><Eraser style={{ width: 15, height: 15 }} /></button>
                <button className="icon-btn" style={{ width: 36, height: 36 }} title="Remove line" onClick={() => removeLine(l.key)}><Trash2 style={{ width: 15, height: 15 }} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="je-totals num">
          <span className="jt">Debit: <b>{fmtMoneyFull(totals.debit)}</b></span>
          <span className="jt">Credit: <b>{fmtMoneyFull(totals.credit)}</b></span>
          <span className={`jt ${balanced ? 'jt-ok' : 'jt-bad'}`}>
            Difference: <b>{fmtMoneyFull(totals.diff)}</b> {balanced ? '· Balanced' : '· Out of balance'}
          </span>
        </div>

        <div className="divider" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn icon={<Save />} onClick={() => doSave(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Draft'} <span className="tiny muted">(Ctrl+S)</span>
          </Btn>
          <Btn
            variant="primary"
            icon={<CheckCircle2 />}
            onClick={() => doSave(true)}
            disabled={saving || !balanced || locked}
            title={!balanced ? 'Balance the entry to post' : locked ? 'Period is locked' : 'Post entry'}
          >
            {saving ? 'Posting…' : 'Post'} <span className="tiny" style={{ opacity: 0.7 }}>(Ctrl+Enter)</span>
          </Btn>
        </div>
      </Card>
    </Page>
  );
}
