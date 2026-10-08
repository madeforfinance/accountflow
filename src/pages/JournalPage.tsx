import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Copy, RotateCcw, Printer, FileDown, Trash2 } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Btn, Badge, EmptyState, SearchInput, Field, TextInput, Select, ConfirmDialog } from '../components/ui';
import { EntryStatusBadge, KindBadge, LoadingCard } from '../components/acct';
import { deleteDraft, reverseJournalEntry } from '../accounting/data';
import { entryTotals } from '../accounting/engine';
import { ENTRY_KINDS, JournalEntry } from '../accounting/types';
import { fmtDate, fmtMoneyFull, todayISO } from '../lib/format';
import { toast } from '../lib/toast';
import { downloadCSV } from '../lib/files';

const PAGE_SIZE = 25;

export default function JournalPage() {
  const { snap } = useAccounting();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [confirmReverse, setConfirmReverse] = useState<JournalEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);

  const filtered = useMemo(() => {
    if (!snap) return [];
    const needle = q.trim().toLowerCase();
    return snap.entries.filter((e) => {
      if (kind && e.kind !== kind) return false;
      if (status && e.status !== status) return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (needle && !`${e.entryNo} ${e.reference} ${e.description} ${e.memo ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    }).slice().reverse();
  }, [snap, q, kind, status, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!snap) return <Page title="Journal"><LoadingCard /></Page>;

  const doReverse = async () => {
    if (!confirmReverse) return;
    try {
      const rev = await reverseJournalEntry(snap, confirmReverse.id);
      toast(`Reversed with ${rev.entryNo}`);
    } catch (err: any) {
      toast(err.message || 'Reversal failed', 'error');
    }
    setConfirmReverse(null);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDraft(snap, confirmDelete.id);
      toast('Draft deleted');
    } catch (err: any) {
      toast(err.message || 'Delete failed', 'error');
    }
    setConfirmDelete(null);
  };

  const doDuplicate = (e: JournalEntry) => {
    nav('/accounting/journal/new', { state: { duplicateOf: e.id } });
  };

  const doExportCsv = () => {
    const head = ['Date', 'Entry No', 'Reference', 'Kind', 'Description', 'Account Code', 'Account', 'Line Description', 'Debit', 'Credit', 'Status'];
    const acc = new Map(snap.accounts.map((a) => [a.id, a]));
    const body: unknown[][] = [];
    for (const e of filtered) {
      for (const l of e.lines) {
        const a = acc.get(l.accountId);
        body.push([e.date, e.entryNo, e.reference, e.kind, e.description, l.accountCode, a?.name ?? '', l.description, l.debit, l.credit, e.status]);
      }
    }
    downloadCSV(`journal-${todayISO()}.csv`, head, body);
    toast('Journal exported to CSV');
  };

  const printEntry = (e: JournalEntry) => {
    nav(`/accounting/journal/${e.id}`, { state: { print: true } });
  };

  return (
    <Page
      title="Journal"
      subtitle={`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} · the journal is the source of truth`}
      actions={
        <>
          <Btn icon={<FileDown />} onClick={doExportCsv}>CSV</Btn>
          <Link to="/accounting/journal/new"><Btn variant="primary" icon={<Plus />}>New Entry</Btn></Link>
        </>
      }
    >
      <Card>
        <div className="filter-bar">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search no., reference, description…" />
          </div>
          <Field label="Type">
            <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}>
              <option value="">All types</option>
              {ENTRY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="">All</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="reversed">Reversed</option>
            </Select>
          </Field>
          <Field label="From"><TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></Field>
          <Field label="To"><TextInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No journal entries found"
            text="Try adjusting your filters, or post your first journal entry."
            action={<Link to="/accounting/journal/new"><Btn variant="primary" icon={<Plus />}>New Entry</Btn></Link>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th><th>Entry No.</th><th>Reference</th><th>Description</th>
                    <th>Type</th><th style={{ textAlign: 'right' }}>Debit</th>
                    <th style={{ textAlign: 'right' }}>Credit</th><th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const t = entryTotals(e);
                    return (
                      <tr key={e.id}>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                        <td><b>{e.entryNo}</b>{e.reverses && <div className="tiny muted">reverses {e.reverses.slice(0, 12)}…</div>}</td>
                        <td className="muted">{e.reference || '—'}</td>
                        <td style={{ maxWidth: 260 }}>{e.description}</td>
                        <td><KindBadge kind={e.kind} /></td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(t.debit)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(t.credit)}</td>
                        <td><EntryStatusBadge status={e.status} /></td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="View" onClick={() => nav(`/accounting/journal/${e.id}`)}><Eye style={{ width: 16, height: 16 }} /></button>
                            {e.status === 'draft' && (
                              <>
                                <button className="icon-btn" style={{ width: 34, height: 34 }} title="Edit draft" onClick={() => nav(`/accounting/journal/${e.id}?edit=1`)}><Pencil style={{ width: 16, height: 16 }} /></button>
                                <button className="icon-btn" style={{ width: 34, height: 34 }} title="Delete draft" onClick={() => setConfirmDelete(e)}><Trash2 style={{ width: 16, height: 16 }} /></button>
                              </>
                            )}
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="Duplicate" onClick={() => doDuplicate(e)}><Copy style={{ width: 16, height: 16 }} /></button>
                            {e.status === 'posted' && !e.reversedBy && (
                              <button className="icon-btn" style={{ width: 34, height: 34 }} title="Reverse entry" onClick={() => setConfirmReverse(e)}><RotateCcw style={{ width: 16, height: 16 }} /></button>
                            )}
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="Print" onClick={() => printEntry(e)}><Printer style={{ width: 16, height: 16 }} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="muted small">Page {page + 1} of {pages}</span>
              <span style={{ flex: 1 }} />
              <Btn size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmReverse}
        title="Reverse journal entry"
        message={`Create an equal-and-opposite reversal of ${confirmReverse?.entryNo}? The original entry is kept for audit.`}
        confirmLabel="Reverse"
        onConfirm={doReverse}
        onCancel={() => setConfirmReverse(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete draft"
        message={`Delete draft ${confirmDelete?.entryNo}? This cannot be undone.`}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Page>
  );
}

export function JournalStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'posted' ? 'green' : status === 'draft' ? 'amber' : 'gray'}>{status}</Badge>;
}
