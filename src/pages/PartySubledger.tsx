import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, FileDown, BookOpen } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { useDateRange, DateRangeControl, LoadingCard } from '../components/acct';
import {
  Page, Card, Btn, Badge, EmptyState, SearchInput, Field, TextInput, Select, Textarea, Modal,
} from '../components/ui';
import { db, uid } from '../storage/db';
import { logAudit } from '../accounting/data';
import { subledger, reconcileSubledger, movementOf, sumPostings } from '../accounting/engine';
import { validateSubledgerReconciliation } from '../accounting/validation';
import { Customer, Vendor } from '../accounting/types';
import { toast } from '../lib/toast';
import { downloadCSV } from '../lib/files';
import { fmtMoneyFull, toNum, todayISO } from '../lib/format';

type Party = Customer | Vendor;
type PartyKind = 'customer' | 'vendor';

interface PartyConfig {
  title: string;
  subtitle: string;
  store: 'customers' | 'vendors';
  controlSetting: 'arControlAccount' | 'apControlAccount';
  controlKind: 'AR' | 'AP';
  controlLabel: string;
  moveDebitLabel: string;
  moveCreditLabel: string;
  emptyTitle: string;
  emptyText: string;
  newLabel: string;
}

const CONFIGS: Record<PartyKind, PartyConfig> = {
  customer: {
    title: 'Customers', subtitle: 'customer balances reconcile to the Accounts Receivable control account',
    store: 'customers', controlSetting: 'arControlAccount', controlKind: 'AR',
    controlLabel: 'Accounts receivable', moveDebitLabel: 'Invoiced', moveCreditLabel: 'Received',
    emptyTitle: 'No customers found', emptyText: 'Add your first customer to start tracking receivables.',
    newLabel: 'New Customer',
  },
  vendor: {
    title: 'Vendors', subtitle: 'vendor balances reconcile to the Accounts Payable control account',
    store: 'vendors', controlSetting: 'apControlAccount', controlKind: 'AP',
    controlLabel: 'Accounts payable', moveDebitLabel: 'Paid', moveCreditLabel: 'Billed',
    emptyTitle: 'No vendors found', emptyText: 'Add your first vendor to start tracking payables.',
    newLabel: 'New Vendor',
  },
};

interface PartyForm {
  code: string; name: string; phone: string; email: string;
  address: string; taxNumber: string; openingBalance: string; status: 'active' | 'inactive';
}

const emptyPartyForm = (prefix: string): PartyForm => ({
  code: '', name: '', phone: '', email: '', address: '', taxNumber: '', openingBalance: '0', status: 'active',
});

function PartyModal({ kind, open, onClose, initial }: {
  kind: PartyKind; open: boolean; onClose: () => void; initial: Party | null;
}) {
  const { snap } = useAccounting();
  const cfg = CONFIGS[kind];
  const [form, setForm] = useState<PartyForm>(emptyPartyForm(''));

  React.useEffect(() => {
    if (open) {
      setForm(initial ? {
        code: initial.code, name: initial.name, phone: initial.phone ?? '', email: initial.email ?? '',
        address: initial.address ?? '', taxNumber: initial.taxNumber ?? '',
        openingBalance: String(initial.openingBalance), status: initial.status,
      } : emptyPartyForm(''));
    }
  }, [open, initial]);

  if (!snap) return null;

  const doSave = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) { toast('Code is required.', 'error'); return; }
    if (!name) { toast('Name is required.', 'error'); return; }
    const list: Party[] = snap[cfg.store];
    if (list.some((p) => p.id !== initial?.id && p.code.toLowerCase() === code.toLowerCase())) {
      toast(`Code "${code}" already exists.`, 'error'); return;
    }
    try {
      const party: Party = {
        id: initial?.id ?? uid(kind === 'customer' ? 'cust_' : 'vend_'),
        code, name,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        taxNumber: form.taxNumber.trim() || undefined,
        openingBalance: toNum(form.openingBalance),
        status: form.status,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      } as Party;
      await db.put(cfg.store, party);
      await logAudit(initial ? 'edited' : 'created', code, `${kind === 'customer' ? 'Customer' : 'Vendor'} ${code} — ${name} ${initial ? 'updated' : 'created'}.`);
      toast(initial ? `${name} updated` : `${name} added`);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Save failed', 'error');
    }
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={initial ? `Edit ${kind === 'customer' ? 'Customer' : 'Vendor'} — ${initial.code}` : cfg.newLabel}
      actions={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={doSave}>{initial ? 'Save Changes' : `Add ${kind === 'customer' ? 'Customer' : 'Vendor'}`}</Btn>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Code" required>
          <TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={kind === 'customer' ? 'CUST-009' : 'VEND-007'} />
        </Field>
        <Field label="Name" required>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name / business name" />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92 …" />
        </Field>
        <Field label="Email">
          <TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
        </Field>
        <Field label="Address" >
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </Field>
        <Field label="Tax Number (NTN/STRN)">
          <TextInput value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
        </Field>
        <Field label="Opening Balance" hint="Informational — balances come from posted journal entries">
          <TextInput type="number" step="0.01" value={form.openingBalance}
            onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export function PartySubledgerPage({ kind }: { kind: PartyKind }) {
  const { snap } = useAccounting();
  const { settings } = useSettings();
  const nav = useNavigate();
  const cfg = CONFIGS[kind];
  const range = useDateRange(settings);
  const { from, to } = range;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);

  const data = useMemo(() => {
    if (!snap) return null;
    const control = snap.accounts.find((a) => a.code === settings[cfg.controlSetting])
      ?? snap.accounts.find((a) => a.controlKind === cfg.controlKind);
    if (!control) return { control: null as null, merged: [], rec: null, validation: null };
    const rows = subledger(snap.entries, control, from, to);
    const byId = new Map(rows.map((r) => [r.contactId, r]));
    const merged = (snap[cfg.store] as Party[]).map((p) => ({
      party: p,
      row: byId.get(p.id) ?? { contactId: p.id, opening: 0, debit: 0, credit: 0, closing: 0 },
    }));
    const controlClosing = movementOf(control, sumPostings(snap.entries, { to }));
    const rec = reconcileSubledger(rows, controlClosing);
    const validation = validateSubledgerReconciliation(cfg.controlLabel, rec.subTotal, rec.control);
    return { control, merged, rec, validation };
  }, [snap, settings, cfg, from, to]);

  if (!snap) return <Page title={cfg.title}><LoadingCard /></Page>;
  if (!data) return <Page title={cfg.title}><LoadingCard /></Page>;

  const { control, merged, rec, validation } = data;

  const needle = q.trim().toLowerCase();
  const filtered = merged.filter(({ party }) => {
    if (status && party.status !== status) return false;
    if (needle && !`${party.code} ${party.name} ${party.phone ?? ''} ${party.email ?? ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const totals = filtered.reduce((t, { row }) => ({
    opening: t.opening + row.opening,
    debit: t.debit + row.debit,
    credit: t.credit + row.credit,
    closing: t.closing + row.closing,
  }), { opening: 0, debit: 0, credit: 0, closing: 0 });

  const openModal = (p: Party | null) => { setEditing(p); setModalOpen(true); };

  const doExportCsv = () => {
    const head = ['Code', 'Name', 'Phone', 'Email', 'Address', 'Opening', cfg.moveDebitLabel, cfg.moveCreditLabel, 'Closing Balance', 'Status'];
    const body = filtered.map(({ party, row }) => [
      party.code, party.name, party.phone ?? '', party.email ?? '', party.address ?? '',
      row.opening, row.debit, row.credit, row.closing, party.status,
    ]);
    downloadCSV(`${kind}s-${todayISO()}.csv`, head, body);
    toast(`${cfg.title} exported to CSV`);
  };

  const goLedger = () => { if (control) nav(`/accounting/ledger?account=${control.id}`); };

  return (
    <Page
      title={cfg.title}
      subtitle={`${filtered.length} ${kind === 'customer' ? 'customers' : 'vendors'} · ${cfg.subtitle}`}
      actions={
        <>
          <Btn icon={<FileDown />} onClick={doExportCsv}>CSV</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>{cfg.newLabel}</Btn>
        </>
      }
    >
      {!control ? (
        <Card>
          <EmptyState title="Control account not found"
            text={`The ${cfg.controlLabel} control account (${settings[cfg.controlSetting]}) is missing from the chart of accounts.`}
          />
        </Card>
      ) : (
        <>
          {rec && (rec.reconciled ? (
            <div className="rpt-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cfg.controlLabel[0].toUpperCase() + cfg.controlLabel.slice(1)} subledger reconciles to the control account — {fmtMoneyFull(rec.subTotal)}.
            </div>
          ) : (
            <div className="rpt-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Accounting warning — {validation?.errors[0] ?? `subledger differs from control by ${fmtMoneyFull(rec.diff)}`}.
            </div>
          ))}

          <Card>
            <DateRangeControl preset={range.preset} setPreset={range.setPreset} custom={range.custom} setCustom={range.setCustom} />
            <div className="filter-bar">
              <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                <SearchInput value={q} onChange={setQ} placeholder="Search code, name, phone, email…" />
              </div>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
              <span style={{ flex: 1 }} />
              <Btn size="sm" icon={<BookOpen />} onClick={goLedger}>Control Account Ledger</Btn>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title={cfg.emptyTitle}
                text={needle || status ? 'Try adjusting your filters.' : cfg.emptyText}
                action={(!needle && !status) ? <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>{cfg.newLabel}</Btn> : undefined}
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Code</th><th>Name</th><th>Phone</th><th>Email</th>
                      <th style={{ textAlign: 'right' }}>Opening</th>
                      <th style={{ textAlign: 'right' }}>{cfg.moveDebitLabel}</th>
                      <th style={{ textAlign: 'right' }}>{cfg.moveCreditLabel}</th>
                      <th style={{ textAlign: 'right' }}>Closing</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ party, row }) => (
                      <tr key={party.id}>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{party.code}</td>
                        <td>
                          <Link to={`/accounting/ledger?account=${control.id}`} style={{ fontWeight: 600 }}>{party.name}</Link>
                        </td>
                        <td className="muted">{party.phone ?? '—'}</td>
                        <td className="muted">{party.email ?? '—'}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(row.opening)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(row.debit)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(row.credit)}</td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(row.closing)}</td>
                        <td><Badge tone={party.status === 'active' ? 'green' : 'gray'}>{party.status}</Badge></td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="View ledger"
                              onClick={goLedger}><BookOpen style={{ width: 16, height: 16 }} /></button>
                            <button className="icon-btn" style={{ width: 34, height: 34 }} title="Edit"
                              onClick={() => openModal(party)}><Pencil style={{ width: 16, height: 16 }} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(totals.opening)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(totals.debit)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(totals.credit)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(totals.closing)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <PartyModal kind={kind} open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
    </Page>
  );
}
