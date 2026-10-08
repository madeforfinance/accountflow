import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, RotateCcw, FileText, Coins, Landmark, TrendingDown, Banknote, Boxes } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Btn, EmptyState, ConfirmDialog, Stat } from '../components/ui';
import { EntryStatusBadge, LoadingCard } from '../components/acct';
import { reverseJournalEntry } from '../accounting/data';
import { entryTotals } from '../accounting/engine';
import { JournalEntry } from '../accounting/types';
import { fmtDate, fmtMoneyFull } from '../lib/format';
import { toast } from '../lib/toast';

interface QuickCard {
  title: string;
  hint: string;
  example: string;
  icon: React.ReactNode;
}

const QUICK_CARDS: QuickCard[] = [
  {
    title: 'Accrued expense',
    hint: 'Expense incurred but not yet paid (e.g. December salaries payable in January).',
    example: 'Dr Salaries Expense · Cr Salaries Payable',
    icon: <Coins style={{ width: 20, height: 20 }} />,
  },
  {
    title: 'Prepaid adjustment',
    hint: 'Portion of prepaid insurance, rent or subscriptions used during the period.',
    example: 'Dr Insurance Expense · Cr Prepaid Insurance',
    icon: <Landmark style={{ width: 20, height: 20 }} />,
  },
  {
    title: 'Depreciation',
    hint: 'Periodic depreciation charge on property, plant & equipment.',
    example: 'Dr Depreciation Expense · Cr Accumulated Depreciation',
    icon: <TrendingDown style={{ width: 20, height: 20 }} />,
  },
  {
    title: 'Bad debt',
    hint: 'Allowance or write-off for doubtful receivables.',
    example: 'Dr Bad Debt Expense · Cr Allowance for Doubtful Debts',
    icon: <FileText style={{ width: 20, height: 20 }} />,
  },
  {
    title: 'Unearned revenue',
    hint: 'Revenue now earned on amounts received in advance from customers.',
    example: 'Dr Unearned Revenue · Cr Service Revenue',
    icon: <Banknote style={{ width: 20, height: 20 }} />,
  },
  {
    title: 'Inventory adjustment',
    hint: 'Shinkage, spoilage or physical-count corrections to inventory.',
    example: 'Dr Inventory Loss · Cr Inventory',
    icon: <Boxes style={{ width: 20, height: 20 }} />,
  },
];

export default function AdjustmentsPage() {
  const { snap } = useAccounting();
  const nav = useNavigate();
  const [confirmReverse, setConfirmReverse] = useState<JournalEntry | null>(null);

  const adjustments = useMemo(
    () => (snap ? snap.entries.filter((e) => e.kind === 'adjustment').slice().reverse() : []),
    [snap],
  );

  const totals = useMemo(() => {
    let d = 0, c = 0, n = 0;
    for (const e of adjustments) {
      if (e.status !== 'posted') continue;
      const t = entryTotals(e);
      d += t.debit; c += t.credit; n++;
    }
    return { debit: Math.round(d * 100) / 100, credit: Math.round(c * 100) / 100, posted: n };
  }, [adjustments]);

  if (!snap) return <Page title="Adjusting Entries"><LoadingCard /></Page>;

  const newAdjustingEntry = (hint?: string) =>
    nav('/accounting/journal/new', { state: { kind: 'adjustment', ...(hint ? { presetHint: hint } : {}) } });

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

  return (
    <Page
      title="Adjusting Entries"
      subtitle="Period-end adjustments — they flow automatically into the adjusted trial balance"
      actions={
        <Btn variant="primary" icon={<Plus />} onClick={() => newAdjustingEntry()}>
          New Adjusting Entry
        </Btn>
      }
    >
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Stat label="Posted adjusting entries" value={String(totals.posted)} icon={<FileText style={{ width: 18, height: 18 }} />} />
        <Stat label="Total adjustments — debit" value={fmtMoneyFull(totals.debit)} icon={<Coins style={{ width: 18, height: 18 }} />} />
        <Stat label="Total adjustments — credit" value={fmtMoneyFull(totals.credit)} icon={<Banknote style={{ width: 18, height: 18 }} />} />
      </div>

      <Card title="Quick adjustments" subtitle="Start a pre-hinted adjusting entry for a common adjustment type">
        <div className="grid cols-3">
          {QUICK_CARDS.map((qc) => (
            <button
              key={qc.title}
              type="button"
              onClick={() => newAdjustingEntry(qc.title)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'block', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--surface)', boxSizing: 'border-box',
              }}
              title={`New adjusting entry — ${qc.title}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ color: 'var(--accent)' }}>{qc.icon}</span>
                <b>{qc.title}</b>
              </div>
              <p className="small muted" style={{ margin: '0 0 8px' }}>{qc.hint}</p>
              <div className="tiny mono muted">{qc.example}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Adjusting entries" subtitle={`${adjustments.length} ${adjustments.length === 1 ? 'entry' : 'entries'}`} style={{ marginTop: 16 }}>
        {adjustments.length === 0 ? (
          <EmptyState
            title="No adjusting entries yet"
            text="Record accrued expenses, depreciation, prepayments and other period-end adjustments here."
            action={<Btn variant="primary" icon={<Plus />} onClick={() => newAdjustingEntry()}>New Adjusting Entry</Btn>}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Entry No.</th><th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debit</th>
                  <th style={{ textAlign: 'right' }}>Credit</th>
                  <th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((e) => {
                  const t = entryTotals(e);
                  return (
                    <tr key={e.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                      <td><b>{e.entryNo}</b></td>
                      <td style={{ maxWidth: 320 }}>{e.description}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(t.debit)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(t.credit)}</td>
                      <td><EntryStatusBadge status={e.status} /></td>
                      <td>
                        <div className="row-actions">
                          <Link to={`/accounting/journal/${e.id}`} title="View" style={{ display: 'inline-flex' }}>
                            <button className="icon-btn" style={{ width: 34, height: 34 }}><Eye style={{ width: 16, height: 16 }} /></button>
                          </Link>
                          {e.status === 'posted' && !e.reversedBy && (
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="Reverse entry" onClick={() => setConfirmReverse(e)}>
                              <RotateCcw style={{ width: 16, height: 16 }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmReverse}
        title="Reverse adjusting entry"
        message={`Create an equal-and-opposite reversal of ${confirmReverse?.entryNo}? The original entry is kept for audit.`}
        confirmLabel="Reverse"
        onConfirm={doReverse}
        onCancel={() => setConfirmReverse(null)}
      />
    </Page>
  );
}
