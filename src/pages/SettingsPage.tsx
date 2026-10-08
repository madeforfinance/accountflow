import React, { useEffect, useState } from 'react';
import { Building2, Wallet, BookOpen, FileText, BarChart3, Palette, Lock, Database, Download, Upload, X, ShieldCheck } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { useSettings } from '../app/settings';
import { Page, Card, Btn, Field, TextInput, NumberInput, Select, Textarea, Switch, Segmented, ConfirmDialog, Badge } from '../components/ui';
import { AccountSelect, LoadingCard } from '../components/acct';
import { setPeriodLock, resetDemoData, exportBackup } from '../accounting/data';
import { CompanySettings, DEFAULT_SETTINGS, FiscalPeriod } from '../accounting/types';
import { pickFile, readFileDataURL, downloadJSON } from '../lib/files';
import { todayISO } from '../lib/format';
import { toast } from '../lib/toast';

const NOTE = 'Changes apply to future reports immediately; existing transactions are untouched.';

function SaveRow({ onSave, children }: { onSave: () => void; children?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Btn variant="primary" size="sm" onClick={onSave}>Save</Btn>
      <span className="muted small">{children ?? NOTE}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { snap } = useAccounting();
  const { settings, update, ready } = useSettings();
  const [form, setForm] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [lockTarget, setLockTarget] = useState<FiscalPeriod | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready) setForm(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!snap || !ready) return <Page title="Settings"><LoadingCard /></Page>;

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async (patch: Partial<CompanySettings>) => {
    try {
      await update(patch);
      toast('Settings saved');
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'error');
    }
  };

  /* account-code settings are stored as codes; AccountSelect works with ids */
  const idForCode = (code: string) => snap.accounts.find((a) => a.code === code)?.id ?? '';
  const codeForId = (id: string) => snap.accounts.find((a) => a.id === id)?.code ?? '';
  const acctField = (k: 'arControlAccount' | 'apControlAccount' | 'retainedEarningsAccount' | 'currentYearProfitAccount' | 'cashAccount' | 'bankAccount', label: string, types: string[]) => (
    <Field label={label}>
      <AccountSelect
        accounts={snap.accounts.filter((a) => types.includes(a.type))}
        value={idForCode(form[k])}
        onChange={(id) => set(k, codeForId(id))}
        label={label}
      />
    </Field>
  );

  const pickLogo = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      const url = await readFileDataURL(f);
      set('logo', url);
    } catch {
      toast('Could not read the image file', 'error');
    }
  };

  const doLock = async () => {
    if (!lockTarget) return;
    try {
      await setPeriodLock(lockTarget.id, true);
      toast(`Period "${lockTarget.label}" locked`);
    } catch (e: any) {
      toast(e?.message || 'Lock failed', 'error');
    }
    setLockTarget(null);
  };

  const doUnlock = async (p: FiscalPeriod) => {
    try {
      await setPeriodLock(p.id, false);
      toast(`Period "${p.label}" unlocked`);
    } catch (e: any) {
      toast(e?.message || 'Unlock failed', 'error');
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      await resetDemoData();
      toast('Demo company restored');
    } catch (e: any) {
      toast(e?.message || 'Reset failed', 'error');
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const doBackup = async () => {
    try {
      const data = await exportBackup();
      downloadJSON(`accounting-backup-${todayISO()}.json`, data);
      toast('Backup exported');
    } catch (e: any) {
      toast(e?.message || 'Backup failed', 'error');
    }
  };

  return (
    <Page title="Settings" subtitle="Company identity, accounting rules, periods and data">
      {/* ---------- company information ---------- */}
      <Card title="Company Information" subtitle="Used on every report, PDF and printed document" actions={<Building2 size={18} />}>
        <div className="form-grid">
          <Field label="Business name" required><TextInput value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
          <Field label="Legal name"><TextInput value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
          <Field label="Registration number"><TextInput value={form.regNumber} onChange={(e) => set('regNumber', e.target.value)} /></Field>
          <Field label="Tax registration number"><TextInput value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></Field>
          <Field label="Address"><TextInput value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="City"><TextInput value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Country"><TextInput value={form.country} onChange={(e) => set('country', e.target.value)} /></Field>
          <Field label="Phone"><TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Website"><TextInput value={form.website} onChange={(e) => set('website', e.target.value)} /></Field>
        </div>
        <SaveRow onSave={() => save({
          businessName: form.businessName, legalName: form.legalName, regNumber: form.regNumber,
          taxNumber: form.taxNumber, address: form.address, city: form.city, country: form.country,
          phone: form.phone, email: form.email, website: form.website,
        })} />
      </Card>

      {/* ---------- financial settings ---------- */}
      <Card title="Financial Settings" subtitle="Currency, fiscal year and presentation" actions={<Wallet size={18} />}>
        <div className="form-grid">
          <Field label="Base currency"><TextInput value={form.baseCurrency} onChange={(e) => set('baseCurrency', e.target.value)} maxLength={8} /></Field>
          <Field label="Currency symbol"><TextInput value={form.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} maxLength={8} /></Field>
          <Field label="Fiscal year start"><TextInput type="date" value={form.fiscalYearStart} onChange={(e) => set('fiscalYearStart', e.target.value)} /></Field>
          <Field label="Fiscal year end"><TextInput type="date" value={form.fiscalYearEnd} onChange={(e) => set('fiscalYearEnd', e.target.value)} /></Field>
          <Field label="Decimal places"><NumberInput type="number" min={0} max={4} value={String(form.decimalPlaces)} onChange={(e) => set('decimalPlaces', Math.max(0, Math.min(4, Number(e.target.value) || 0)))} /></Field>
          <Field label="Accounting basis">
            <Select value={form.accountingBasis} onChange={(e) => set('accountingBasis', e.target.value as CompanySettings['accountingBasis'])}>
              <option value="accrual">Accrual</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
          <Field label="Number format">
            <Select value={form.numberFormat} onChange={(e) => set('numberFormat', e.target.value as CompanySettings['numberFormat'])}>
              <option value="en-PK">en-PK (12,34,567.89)</option>
              <option value="en-US">en-US (1,234,567.89)</option>
            </Select>
          </Field>
        </div>
        <SaveRow onSave={() => save({
          baseCurrency: form.baseCurrency, currencySymbol: form.currencySymbol,
          fiscalYearStart: form.fiscalYearStart, fiscalYearEnd: form.fiscalYearEnd,
          decimalPlaces: form.decimalPlaces, accountingBasis: form.accountingBasis, numberFormat: form.numberFormat,
        })} />
      </Card>

      {/* ---------- accounting settings ---------- */}
      <Card title="Accounting Settings" subtitle="Default control and closing accounts" actions={<BookOpen size={18} />}>
        <div className="form-grid">
          {acctField('arControlAccount', 'Accounts receivable control', ['Asset'])}
          {acctField('apControlAccount', 'Accounts payable control', ['Liability'])}
          {acctField('retainedEarningsAccount', 'Retained earnings account', ['Equity'])}
          {acctField('currentYearProfitAccount', 'Current year profit account', ['Equity'])}
          {acctField('cashAccount', 'Cash account', ['Asset'])}
          {acctField('bankAccount', 'Bank account', ['Asset'])}
        </div>
        <SaveRow onSave={() => save({
          arControlAccount: form.arControlAccount, apControlAccount: form.apControlAccount,
          retainedEarningsAccount: form.retainedEarningsAccount, currentYearProfitAccount: form.currentYearProfitAccount,
          cashAccount: form.cashAccount, bankAccount: form.bankAccount,
        })} />
      </Card>

      {/* ---------- document settings ---------- */}
      <Card title="Document Settings" subtitle="Numbering prefixes, footer and logo" actions={<FileText size={18} />}>
        <div className="form-grid">
          <Field label="Journal prefix"><TextInput value={form.jePrefix} onChange={(e) => set('jePrefix', e.target.value)} /></Field>
          <Field label="Invoice prefix"><TextInput value={form.invPrefix} onChange={(e) => set('invPrefix', e.target.value)} /></Field>
          <Field label="Bill prefix"><TextInput value={form.billPrefix} onChange={(e) => set('billPrefix', e.target.value)} /></Field>
          <Field label="Receipt prefix"><TextInput value={form.rcptPrefix} onChange={(e) => set('rcptPrefix', e.target.value)} /></Field>
          <Field label="Payment prefix"><TextInput value={form.payPrefix} onChange={(e) => set('payPrefix', e.target.value)} /></Field>
          <Field label="Document footer"><Textarea rows={2} value={form.docFooter} onChange={(e) => set('docFooter', e.target.value)} /></Field>
        </div>
        <Field label="Company logo" hint="Appears on PDFs and printed reports. No logo is generated for you.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Btn size="sm" icon={<Upload size={15} />} onClick={pickLogo}>Upload logo</Btn>
            {form.logo && (
              <>
                <img src={form.logo} alt="Company logo preview" style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, padding: 4, background: '#fff' }} />
                <Btn size="sm" variant="ghost" icon={<X size={15} />} onClick={() => set('logo', undefined)}>Remove</Btn>
              </>
            )}
          </div>
        </Field>
        <SaveRow onSave={() => save({
          jePrefix: form.jePrefix, invPrefix: form.invPrefix, billPrefix: form.billPrefix,
          rcptPrefix: form.rcptPrefix, payPrefix: form.payPrefix, docFooter: form.docFooter, logo: form.logo,
        })} />
      </Card>

      {/* ---------- report settings ---------- */}
      <Card title="Report Settings" subtitle="How financial reports are presented" actions={<BarChart3 size={18} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Switch label="Show account codes on reports" checked={form.showAccountCodes} onChange={(e) => set('showAccountCodes', e.target.checked)} />
          <Switch label="Show zero-balance accounts" checked={form.showZeroBalances} onChange={(e) => set('showZeroBalances', e.target.checked)} />
          <Switch label="Show comparative periods" checked={form.comparativePeriods} onChange={(e) => set('comparativePeriods', e.target.checked)} />
        </div>
        <div style={{ marginTop: 12, maxWidth: 320 }}>
          <Field label="Negative number style">
            <Select value={form.negativeStyle} onChange={(e) => set('negativeStyle', e.target.value as CompanySettings['negativeStyle'])}>
              <option value="parentheses">Parentheses — (250,000)</option>
              <option value="minus">Minus — -250,000</option>
            </Select>
          </Field>
        </div>
        <SaveRow onSave={() => save({
          showAccountCodes: form.showAccountCodes, showZeroBalances: form.showZeroBalances,
          comparativePeriods: form.comparativePeriods, negativeStyle: form.negativeStyle,
        })} />
      </Card>

      {/* ---------- appearance ---------- */}
      <Card title="Appearance" actions={<Palette size={18} />}>
        <Field label="Theme">
          <Segmented<'light' | 'dark'>
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            value={form.theme}
            onChange={(v) => set('theme', v)}
          />
        </Field>
        <SaveRow onSave={() => save({ theme: form.theme })}>
          Applies immediately. {NOTE}
        </SaveRow>
      </Card>

      {/* ---------- period management ---------- */}
      <Card title="Period Management" subtitle="Locked periods reject new postings, edits and deletes" actions={<Lock size={18} />}>
        <div className="coa-tree">
          {snap.periods.map((p) => (
            <div key={p.id} className="coa-row">
              <div className="coa-name">
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div className="muted small">{p.start} → {p.end}</div>
              </div>
              <Badge tone={p.locked ? 'red' : 'green'}>{p.locked ? 'Locked' : 'Open'}</Badge>
              {p.locked
                ? <Btn size="sm" onClick={() => doUnlock(p)}>Unlock</Btn>
                : <Btn size="sm" variant="danger" onClick={() => setLockTarget(p)}>Lock</Btn>}
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <ShieldCheck size={14} /> Reversing entries may still be created for locked periods when dated outside them; unlocks are recorded in the audit log.
        </p>
      </Card>

      {/* ---------- demo data ---------- */}
      <Card title="Demo Data" subtitle="The fictional demo company ships with a full year of balanced transactions" actions={<Database size={18} />}>
        <p className="muted" style={{ marginTop: 0 }}>
          Resetting deletes every journal entry, customer, vendor, item and period you have created
          and restores the original demo dataset. Reports are recalculated automatically.
        </p>
        <Btn variant="danger" icon={<Database size={15} />} onClick={() => setConfirmReset(true)} disabled={busy}>
          Reset Demo Company
        </Btn>
      </Card>

      {/* ---------- backup ---------- */}
      <Card title="Data" subtitle="Full accounting-data backup" actions={<Download size={18} />}>
        <p className="muted" style={{ marginTop: 0 }}>
          Exports company settings, chart of accounts, journal entries, customers, vendors,
          inventory, fixed assets, periods and the audit log as a single JSON file.
        </p>
        <Btn icon={<Download size={15} />} onClick={doBackup}>Export backup (JSON)</Btn>
      </Card>

      <ConfirmDialog
        open={lockTarget !== null}
        title="Lock accounting period"
        message={lockTarget ? `Lock ${lockTarget.label}? New entries cannot be posted into a locked period, and posted entries can no longer be edited or deleted.` : ''}
        confirmLabel="Lock period"
        onConfirm={doLock}
        onCancel={() => setLockTarget(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset demo company"
        message="This permanently deletes all current data and restores the original demo dataset. Continue?"
        confirmLabel="Reset everything"
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </Page>
  );
}
