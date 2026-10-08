import React, { useMemo, useState } from 'react';
import { Plus, Pencil, FileDown, Building2, Info } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import {
  Page, Card, Btn, Badge, EmptyState, SearchInput, Field, TextInput, Select, Modal, Stat,
} from '../components/ui';
import { LoadingCard } from '../components/acct';
import { db, uid } from '../storage/db';
import { logAudit } from '../accounting/data';
import { FixedAsset } from '../accounting/types';
import { toast } from '../lib/toast';
import { downloadCSV } from '../lib/files';
import { fmtDate, fmtMoney, fmtMoneyFull, toNum, todayISO } from '../lib/format';

function AssetModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial: FixedAsset | null;
}) {
  const [form, setForm] = useState({
    code: '', name: '', category: '', purchaseDate: todayISO(),
    cost: '0', usefulLifeMonths: '60', status: 'active' as 'active' | 'disposed',
  });

  React.useEffect(() => {
    if (open) {
      setForm(initial ? {
        code: initial.code, name: initial.name, category: initial.category,
        purchaseDate: initial.purchaseDate, cost: String(initial.cost),
        usefulLifeMonths: String(initial.usefulLifeMonths), status: initial.status,
      } : { code: '', name: '', category: '', purchaseDate: todayISO(), cost: '0', usefulLifeMonths: '60', status: 'active' as const });
    }
  }, [open, initial]);

  const doSave = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) { toast('Asset code is required.', 'error'); return; }
    if (!name) { toast('Asset name is required.', 'error'); return; }
    if (!form.purchaseDate) { toast('Purchase date is required.', 'error'); return; }
    const cost = toNum(form.cost);
    const life = Math.floor(toNum(form.usefulLifeMonths));
    if (cost <= 0) { toast('Cost must be greater than zero.', 'error'); return; }
    if (life <= 0) { toast('Useful life (months) must be greater than zero.', 'error'); return; }
    try {
      const asset: FixedAsset = {
        id: initial?.id ?? uid('fa_'),
        code, name,
        category: form.category.trim() || 'General',
        purchaseDate: form.purchaseDate,
        cost,
        accumulatedDep: initial?.accumulatedDep ?? 0,
        usefulLifeMonths: life,
        depAccountId: initial?.depAccountId ?? '6500',
        accDepAccountId: initial?.accDepAccountId ?? '1220',
        status: form.status,
      };
      await db.put('fixedAssets', asset);
      await logAudit(initial ? 'edited' : 'created', code, `Fixed asset ${code} — ${name} ${initial ? 'updated' : 'capitalized'}.`);
      toast(initial ? 'Asset updated' : 'Asset capitalized');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Save failed', 'error');
    }
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={initial ? `Edit Asset — ${initial.code}` : 'Add Fixed Asset'}
      actions={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={doSave}>{initial ? 'Save Changes' : 'Add Asset'}</Btn>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Asset Code" required>
          <TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. FA-0001" />
        </Field>
        <Field label="Asset Name" required>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Laptop XPS 15" />
        </Field>
        <Field label="Category">
          <TextInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Computer Equipment" />
        </Field>
        <Field label="Purchase Date" required>
          <TextInput type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
        </Field>
        <Field label="Cost" required>
          <TextInput type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </Field>
        <Field label="Useful Life (months)" required hint={toNum(form.cost) > 0 && toNum(form.usefulLifeMonths) > 0 ? `Monthly depreciation ≈ ${fmtMoneyFull(toNum(form.cost) / Math.max(1, Math.floor(toNum(form.usefulLifeMonths))))}` : undefined}>
          <TextInput type="number" min="1" step="1" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'disposed' })}>
            <option value="active">Active</option>
            <option value="disposed">Disposed</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export default function FixedAssetsPage() {
  const { snap } = useAccounting();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);

  const data = useMemo(() => {
    if (!snap) return null;
    const rows = snap.fixedAssets.map((a) => {
      const monthly = a.usefulLifeMonths > 0 ? a.cost / a.usefulLifeMonths : 0;
      return { asset: a, monthly, nbv: a.cost - a.accumulatedDep };
    });
    const totals = rows.reduce((t, r) => ({
      cost: t.cost + r.asset.cost,
      accDep: t.accDep + r.asset.accumulatedDep,
      nbv: t.nbv + r.nbv,
    }), { cost: 0, accDep: 0, nbv: 0 });
    return { rows, totals };
  }, [snap]);

  if (!snap || !data) return <Page title="Fixed Assets"><LoadingCard /></Page>;

  const needle = q.trim().toLowerCase();
  const rows = data.rows.filter(({ asset }) => {
    if (status && asset.status !== status) return false;
    if (needle && !`${asset.code} ${asset.name} ${asset.category}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const openModal = (a: FixedAsset | null) => { setEditing(a); setModalOpen(true); };

  const doExportCsv = () => {
    const head = ['Code', 'Name', 'Category', 'Purchase Date', 'Cost', 'Useful Life (months)', 'Monthly Depreciation', 'Accumulated Depreciation', 'Net Book Value', 'Status'];
    const body = rows.map(({ asset, monthly, nbv }) => [
      asset.code, asset.name, asset.category, asset.purchaseDate, asset.cost,
      asset.usefulLifeMonths, monthly, asset.accumulatedDep, nbv, asset.status,
    ]);
    downloadCSV(`fixed-assets-${todayISO()}.csv`, head, body);
    toast('Fixed assets exported to CSV');
  };

  return (
    <Page
      title="Fixed Assets"
      subtitle={`${data.rows.length} assets · net book value ${fmtMoneyFull(data.totals.nbv)}`}
      actions={
        <>
          <Btn icon={<FileDown />} onClick={doExportCsv}>CSV</Btn>
          <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>Add Asset</Btn>
        </>
      }
    >
      <Card title="Depreciation policy" subtitle="Register-level tracking" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} />
          <p className="small muted" style={{ margin: 0 }}>
            Depreciation is posted to the books through journal entries of kind <b>Depreciation</b> —
            Dr <b>6500</b> Depreciation Expense / Cr <b>1220</b> Accumulated Depreciation.
            This register tracks each asset's cost, accumulated depreciation and net book value;
            posting the monthly depreciation entry updates the ledger, trial balance and financial statements automatically.
          </p>
        </div>
      </Card>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Card><Stat label="Total Cost" value={fmtMoney(data.totals.cost)} icon={<Building2 />} tone="navy" /></Card>
        <Card><Stat label="Accumulated Depreciation" value={fmtMoney(data.totals.accDep)} icon={<Building2 />} tone="gold" /></Card>
        <Card><Stat label="Net Book Value" value={fmtMoney(data.totals.nbv)} icon={<Building2 />} tone="green" /></Card>
      </div>

      <Card>
        <div className="filter-bar">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search code, name or category…" />
          </div>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="disposed">Disposed</option>
            </Select>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No fixed assets found"
            text={needle || status ? 'Try adjusting your filters.' : 'Add your first fixed asset to build the register.'}
            action={(!needle && !status) ? <Btn variant="primary" icon={<Plus />} onClick={() => openModal(null)}>Add Asset</Btn> : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th><th>Asset</th><th>Category</th><th>Purchase Date</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th style={{ textAlign: 'right' }}>Acc. Dep.</th>
                  <th style={{ textAlign: 'right' }}>Net Book Value</th>
                  <th style={{ textAlign: 'right' }}>Monthly Dep.</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ asset, monthly, nbv }) => (
                  <tr key={asset.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{asset.code}</td>
                    <td style={{ fontWeight: 600 }}>{asset.name}</td>
                    <td className="muted">{asset.category}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(asset.purchaseDate)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(asset.cost)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(asset.accumulatedDep)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(nbv)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmtMoneyFull(monthly)}</td>
                    <td>
                      <Badge tone={asset.status === 'active' ? 'green' : 'gray'}>{asset.status}</Badge>
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="icon-btn" style={{ width: 34, height: 34 }} title="Edit asset"
                          onClick={() => openModal(asset)}><Pencil style={{ width: 16, height: 16 }} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(data.totals.cost)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(data.totals.accDep)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyFull(data.totals.nbv)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <AssetModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
    </Page>
  );
}
