import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore, FileDown, ChevronDown, ChevronRight } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import {
  Page, Card, Btn, Badge, EmptyState, SearchInput, Field, TextInput,
  Select, Textarea, Switch, Modal, ConfirmDialog,
} from '../components/ui';
import { LoadingCard } from '../components/acct';
import { db, uid } from '../storage/db';
import { logAudit } from '../accounting/data';
import { accountTree, flatAccounts, sumPostings, AccountNode } from '../accounting/engine';
import { validateAccount } from '../accounting/validation';
import { Account, AccountType } from '../accounting/types';
import { toast } from '../lib/toast';
import { downloadCSV } from '../lib/files';
import { todayISO } from '../lib/format';

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfSales', 'Expense', 'OtherIncome', 'OtherExpense'];

const TYPE_TONE: Record<AccountType, 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'gold'> = {
  Asset: 'blue', Liability: 'red', Equity: 'gold', Revenue: 'green',
  CostOfSales: 'amber', Expense: 'amber', OtherIncome: 'green', OtherExpense: 'red',
};

const typeLabel = (t: AccountType) =>
  t === 'CostOfSales' ? 'Cost of Sales' : t === 'OtherIncome' ? 'Other Income' : t === 'OtherExpense' ? 'Other Expense' : t;

const defaultNormalBalance = (t: AccountType): 'debit' | 'credit' =>
  t === 'Asset' || t === 'Expense' || t === 'CostOfSales' ? 'debit' : 'credit';

const defaultCashFlowClass = (t: AccountType, postable: boolean): Account['cashFlowClass'] => {
  if (!postable) return null;
  if (t === 'Asset' || t === 'Liability') return 'operating';
  if (t === 'Equity') return 'financing';
  return 'operating';
};

interface AccountFormState {
  code: string; name: string; type: AccountType; subtype: string;
  parentId: string; postable: boolean; description: string;
}

const emptyForm = (defaults?: Partial<AccountFormState>): AccountFormState => ({
  code: '', name: '', type: 'Expense', subtype: '', parentId: '', postable: true, description: '', ...defaults,
});

export default function ChartOfAccountsPage() {
  const { snap } = useAccounting();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm());
  const [confirmArchive, setConfirmArchive] = useState<Account | null>(null);

  const tree = useMemo(() => (snap ? accountTree(snap.accounts) : []), [snap]);
  const flat = useMemo(() => (snap ? flatAccounts(snap.accounts) : []), [snap]);

  const toggle = (id: string) =>
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const rows: AccountNode[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: AccountNode[] = [];
    const walk = (nodes: AccountNode[], hidden: boolean) => {
      for (const n of nodes) {
        if (hidden) continue;
        const matches =
          !needle ||
          n.code.toLowerCase().includes(needle) ||
          n.name.toLowerCase().includes(needle) ||
          typeLabel(n.type).toLowerCase().includes(needle);
        if (matches && (showArchived || n.status === 'active')) out.push(n);
        const hideChildren = !needle && collapsed.has(n.id);
        walk(n.children, hidden || hideChildren);
      }
    };
    walk(tree, false);
    return out;
  }, [tree, collapsed, q, showArchived]);

  if (!snap) return <Page title="Chart of Accounts"><LoadingCard /></Page>;

  const byId = new Map(snap.accounts.map((a) => [a.id, a]));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setForm(emptyForm({
      code: a.code, name: a.name, type: a.type, subtype: a.subtype,
      parentId: a.parentId ?? '', postable: a.postable, description: a.description ?? '',
    }));
    setModalOpen(true);
  };

  const doSave = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    const v = validateAccount({ id: editing?.id, code, name }, snap.accounts);
    if (!v.ok) { toast(v.errors[0], 'error'); return; }
    try {
      const parentId = form.parentId || undefined;
      const account: Account = {
        id: editing?.id ?? uid('acc_'),
        code, name,
        type: form.type,
        subtype: form.subtype.trim() || (form.postable ? 'General' : 'Header'),
        parentId,
        normalBalance: editing ? editing.normalBalance : defaultNormalBalance(form.type),
        status: 'active',
        postable: form.postable,
        description: form.description.trim() || undefined,
        cashFlowClass: defaultCashFlowClass(form.type, form.postable),
      };
      await db.put('accounts', account);
      await logAudit(editing ? 'edited' : 'created', code, `Account ${code} — ${name} ${editing ? 'updated' : 'created'}.`);
      toast(editing ? 'Account updated' : 'Account created');
      setModalOpen(false);
    } catch (err: any) {
      toast(err.message || 'Save failed', 'error');
    }
  };

  const requestArchiveToggle = (a: Account) => {
    if (a.status === 'active') {
      // Never archive an account that already has transactions.
      const sums = sumPostings(snap.entries, {});
      const s = sums.get(a.id);
      if (s && (s.debit !== 0 || s.credit !== 0)) {
        toast(`Cannot archive ${a.code} — it has posted transactions. Archived accounts are read-only, not deleted.`, 'error');
        return;
      }
    }
    setConfirmArchive(a);
  };

  const doArchiveToggle = async () => {
    if (!confirmArchive) return;
    try {
      const next: Account = { ...confirmArchive, status: confirmArchive.status === 'active' ? 'archived' : 'active' };
      await db.put('accounts', next);
      await logAudit('edited', next.code, `Account ${next.code} — ${next.name} ${next.status === 'archived' ? 'archived' : 'restored to active'}.`);
      toast(next.status === 'archived' ? 'Account archived' : 'Account restored');
    } catch (err: any) {
      toast(err.message || 'Update failed', 'error');
    }
    setConfirmArchive(null);
  };

  const doExportCsv = () => {
    const head = ['Code', 'Name', 'Type', 'Subtype', 'Parent Code', 'Normal Balance', 'Status', 'Postable', 'Description'];
    const body = snap.accounts.slice().sort((a, b) => (a.code < b.code ? -1 : 1)).map((a) => [
      a.code, a.name, typeLabel(a.type), a.subtype,
      a.parentId ? (byId.get(a.parentId)?.code ?? '') : '',
      a.normalBalance === 'debit' ? 'Dr' : 'Cr', a.status, a.postable ? 'Yes' : 'No', a.description ?? '',
    ]);
    downloadCSV(`chart-of-accounts-${todayISO()}.csv`, head, body);
    toast('Chart of accounts exported to CSV');
  };

  const activeCount = snap.accounts.filter((a) => a.status === 'active').length;
  const postableCount = snap.accounts.filter((a) => a.postable && a.status === 'active').length;

  return (
    <Page
      title="Chart of Accounts"
      subtitle={`${activeCount} active accounts · ${postableCount} postable`}
      actions={
        <>
          <Btn icon={<FileDown />} onClick={doExportCsv}>CSV</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={openNew}>New Account</Btn>
        </>
      }
    >
      <Card>
        <div className="filter-bar">
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search code, name or type…" />
          </div>
          <Switch label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span style={{ flex: 1 }} />
          <Btn size="sm" onClick={() => setCollapsed(new Set())}>Expand all</Btn>
          <Btn size="sm" onClick={() => setCollapsed(new Set(snap.accounts.map((a) => a.id)))}>Collapse all</Btn>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No accounts found"
            text={q ? 'Try a different search.' : 'Add your first account to build the chart.'}
            action={!q ? <Btn variant="primary" icon={<Plus />} onClick={openNew}>New Account</Btn> : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th><th>Account</th><th>Type</th><th>Subtype</th>
                  <th>Normal Bal.</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => {
                  const hasKids = n.children.length > 0;
                  const isCollapsed = collapsed.has(n.id);
                  return (
                    <tr key={n.id} className={n.status === 'archived' ? 'muted' : undefined}>
                      <td className="num" style={{ fontWeight: n.postable ? 500 : 800, whiteSpace: 'nowrap' }}>{n.code}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: q ? 0 : n.depth * 22 }}>
                          {q ? null : hasKids ? (
                            <button className="icon-btn" style={{ width: 26, height: 26 }} title={isCollapsed ? 'Expand' : 'Collapse'}
                              onClick={() => toggle(n.id)}>
                              {isCollapsed ? <ChevronRight style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                            </button>
                          ) : <span style={{ width: 26 }} />}
                          <span style={{ fontWeight: n.postable ? 500 : 700 }}>{n.name}</span>
                          {!n.postable && <Badge tone="gray">header</Badge>}
                        </div>
                      </td>
                      <td><Badge tone={TYPE_TONE[n.type]}>{typeLabel(n.type)}</Badge></td>
                      <td className="muted">{n.subtype}</td>
                      <td className="num">{n.normalBalance === 'debit' ? 'Dr' : 'Cr'}</td>
                      <td>
                        <Badge tone={n.status === 'active' ? 'green' : 'gray'}>{n.status}</Badge>
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="icon-btn" style={{ width: 34, height: 34 }} title="Edit account" onClick={() => openEdit(n)}>
                            <Pencil style={{ width: 16, height: 16 }} />
                          </button>
                          <button className="icon-btn" style={{ width: 34, height: 34 }}
                            title={n.status === 'active' ? 'Archive account' : 'Restore account'}
                            onClick={() => requestArchiveToggle(n)}>
                            {n.status === 'active'
                              ? <Archive style={{ width: 16, height: 16 }} />
                              : <ArchiveRestore style={{ width: 16, height: 16 }} />}
                          </button>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Account — ${editing.code}` : 'New Account'}
        actions={
          <>
            <Btn variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={doSave}>{editing ? 'Save Changes' : 'Create Account'}</Btn>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Account Code" required>
            <TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 6210" />
          </Field>
          <Field label="Account Name" required>
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office Rent" />
          </Field>
          <Field label="Account Type" required>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </Select>
          </Field>
          <Field label="Subtype">
            <TextInput value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })} placeholder="e.g. Operating, Receivables…" />
          </Field>
          <Field label="Parent Account">
            <Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— None (top-level) —</option>
              {flat.filter(({ account }) => account.id !== editing?.id).map(({ account, indent }) => (
                <option key={account.id} value={account.id}>
                  {'\u00a0\u00a0'.repeat(indent)}{account.code} — {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </Field>
          <Switch
            label="Postable — allow journal lines on this account (headers are not postable)"
            checked={form.postable}
            onChange={(e) => setForm({ ...form, postable: e.target.checked })}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmArchive}
        title={confirmArchive?.status === 'active' ? 'Archive account' : 'Restore account'}
        message={
          confirmArchive?.status === 'active'
            ? `Archive ${confirmArchive?.code} — ${confirmArchive?.name}? It will no longer appear in account pickers. Archived accounts are never deleted.`
            : `Restore ${confirmArchive?.code} — ${confirmArchive?.name} to active?`
        }
        confirmLabel={confirmArchive?.status === 'active' ? 'Archive' : 'Restore'}
        onConfirm={doArchiveToggle}
        onCancel={() => setConfirmArchive(null)}
      />
    </Page>
  );
}
