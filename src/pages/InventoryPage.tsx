import React, { useMemo, useState } from 'react';
import { Plus, Pencil, FileDown, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import {
  Page, Card, Btn, Badge, EmptyState, SearchInput, Field, TextInput, Select, Modal, Stat,
} from '../components/ui';
import { LoadingCard } from '../components/acct';
import { db, uid } from '../storage/db';
import { logAudit } from '../accounting/data';
import { movementOf, sumPostings } from '../accounting/engine';
import { InventoryItem } from '../accounting/types';
import { toast } from '../lib/toast';
import { downloadCSV } from '../lib/files';
import { fmtMoney, fmtMoneyFull, toNum, todayISO } from '../lib/format';

function ItemModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial: InventoryItem | null;
}) {
  const [form, setForm] = useState({ sku: '', name: '', unit: 'pcs', unitCost: '0', quantity: '0', reorderLevel: '0', status: 'active' as 'active' | 'inactive' });

  React.useEffect(() => {
    if (open) {
      setForm(initial ? {
        sku: initial.sku, name: initial.name, unit: initial.unit,
        unitCost: String(initial.unitCost), quantity: String(initial.quantity),
        reorderLevel: String(initial.reorderLevel), status: initial.status,
      } : { sku: '', name: '', unit: 'pcs', unitCost: '0', quantity: '0', reorderLevel: '0', status: 'active' as const });
    }
  }, [open, initial]);

  const doSave = async () => {
    const sku = form.sku.trim();
    const name = form.name.trim();
    if (!sku) { toast('SKU is required.', 'error'); return; }
    if (!name) { toast('Item name is required.', 'error'); return; }
    if (toNum(form.unitCost) < 0 || toNum(form.quantity) < 0 || toNum(form.reorderLevel) < 0) {
      toast('Unit cost, quantity and reorder level cannot be negative.', 'error'); return;
    }
    try {
      const item: InventoryItem = {
        id: initial?.id ?? uid('inv_'),
        sku, name,
        unit: form.unit.trim() || 'pcs',
        unitCost: toNum(form.unitCost),
        quantity: toNum(form.quantity),
        reorderLevel: toNum(form.reorderLevel),
        status: form.status,
      };
      await db.put('inventoryItems', item);
      await logAudit(initial ? 'edited' : 'created', sku, `Inventory item ${sku} — ${name} ${initial ? 'updated' : 'created'}.`);
      toast(initial ? 'Item updated' : 'Item added');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Save failed', 'error');
    }
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={initial ? `Edit Item — ${initial.sku}` : 'New Inventory Item'}
      actions={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={doSave}>{initial ? 'Save Changes' : 'Add Item'}</Btn>
        </>
      }
    >
      <div className="form-grid">
        <Field label="SKU" required>
          <TextInput value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. SKU-0001" />
        </Field>
        <Field label="Item Name" required>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptop — 14 inch" />
        </Field>
        <Field label="Unit">
          <TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, box, kg…" />
        </Field>
        <Field label="Unit Cost">
          <TextInput type="number" step="0.01" min="0" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
        </Field>
        <Field label="Quantity on Hand">
          <TextInput type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
        <Field label="Reorder Level">
          <TextInput type="number" step="0.01" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
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

export default function InventoryPage() {
  const { snap } = useAccounting();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const data = useMemo(() => {
    if (!snap) return null;
    const invAccount = snap.accounts.find((a) => a.code === '1140') ?? snap.accounts.find((a) => a.postable && a.subtype === 'Inventory');
    const control = invAccount ? movementOf(invAccount, sumPostings(snap.entries, {})) : 0;
    const withValue = snap.items.map((it) => ({ item: it, value: toNum(it.quantity) * toNum(it.unitCost) }));
    const stockValue = withValue.reduce((t, { value }) => t + value, 0);
    const lowStock = withValue.filter(({ item }) => toNum(item.quantity) <= toNum(item.reorderLevel)).length;
    const diff = stockValue - control;
    return { invAccount, control, withValue, stockValue, lowStock, diff, reconciled: Math.abs(diff) < 0.01 };
  }, [snap]);

  if (!snap || !data) return <Page title="Inventory"><LoadingCard /></Page>;

  const needle = q.trim().toLowerCase();
  const rows = data.withValue.filter(({ item }) => {
    if (status && item.status !== status) return false;
    if (needle && !`${item.sku} ${item.name}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const openModal = (it: InventoryItem | null) => { setEditing(it); setModalOpen(true); };

  const doExportCsv = () => {
    const head = ['SKU', 'Name', 'Unit', 'Quantity', 'Unit Cost', 'Stock Value', 'Reorder Level', 'Status'];
    const body = rows.map(({ item, value }) => [
      item.sku, item.name, item.unit, item.quantity, item.unitCost, value, item.reorderLevel, item.status,
    ]);
    downloadCSV(`inventory-${todayISO()}.csv`, head, body);
    toast('Inventory exported to CSV');
  };

  return (
    <Page
      title="Inventory"
      subtitle={`${data.withValue.length} items · stock value ${fmtMoneyFull(data.stockValue)}`}
      actions={
        <>
          <Btn icon={<FileDown />} onClick={doExportCsv}>CSV</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>New Item</Btn>
        </>
      }
    >
      {data.invAccount && (data.reconciled ? (
        <div className="rpt-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle style={{ width: 18, height: 18 }} />
          Inventory value {fmtMoneyFull(data.stockValue)} reconciles to account {data.invAccount.code} — {data.invAccount.name}.
        </div>
      ) : (
        <div className="rpt-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle style={{ width: 18, height: 18 }} />
          Accounting warning — inventory register ({fmtMoneyFull(data.stockValue)}) does not reconcile to account {data.invAccount.code} ({fmtMoneyFull(data.control)}) — difference {fmtMoneyFull(Math.abs(data.diff))}.
        </div>
      ))}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Card><Stat label="Total SKUs" value={String(data.withValue.length)} icon={<Package />} tone="navy" /></Card>
        <Card><Stat label="Stock Value" value={fmtMoney(data.stockValue)} icon={<Package />} tone="green" /></Card>
        <Card>
          <Stat label="Low Stock" value={String(data.lowStock)} icon={<AlertTriangle />}
            sub={data.lowStock ? 'quantity at or below reorder level' : 'all items above reorder level'}
            tone={data.lowStock ? 'red' : 'blue'} />
        </Card>
      </div>

      <Card>
        <div className="filter-bar">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search SKU or name…" />
          </div>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No inventory items found"
            text={needle || status ? 'Try adjusting your filters.' : 'Add your first inventory item to start tracking stock.'}
            action={(!needle && !status) ? <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>New Item</Btn> : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>SKU</th><th>Item</th><th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Stock Value</th>
                  <th style={{ textAlign: 'right' }}>Reorder</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, value }) => {
                  const low = toNum(item.quantity) <= toNum(item.reorderLevel);
                  return (
                    <tr key={item.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{item.sku}</td>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td className="muted">{item.unit}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(item.quantity, 0)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(item.unitCost)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(value)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(item.reorderLevel, 0)}</td>
                      <td>
                        {low
                          ? <Badge tone="red">Low Stock</Badge>
                          : <Badge tone={item.status === 'active' ? 'green' : 'gray'}>{item.status === 'active' ? 'OK' : 'Inactive'}</Badge>}
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="icon-btn" style={{ width: 34, height: 34 }} title="Edit item"
                            onClick={() => openModal(item)}><Pencil style={{ width: 16, height: 16 }} /></button>
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

      <ItemModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
    </Page>
  );
}
