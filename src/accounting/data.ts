/* Centralized accounting data layer — the only place that reads/writes
   accounting records. UI components never touch IndexedDB directly. */
import { db, uid } from '../storage/db';
import {
  Account, JournalEntry, Customer, Vendor, InventoryItem, FixedAsset,
  FiscalPeriod, AuditEvent, CompanySettings, DEFAULT_SETTINGS, EntryKind,
} from './types';
import { generateDemoData } from './demo';
import { validateJournalEntry } from './validation';
import { buildReversal, entryTotals, isDateLocked } from './engine';
import { nowISO, todayISO } from '../lib/format';

export interface AccountingSnapshot {
  settings: CompanySettings;
  accounts: Account[];
  entries: JournalEntry[];
  customers: Customer[];
  vendors: Vendor[];
  items: InventoryItem[];
  fixedAssets: FixedAsset[];
  periods: FiscalPeriod[];
  audit: AuditEvent[];
}

export async function logAudit(action: AuditEvent['action'], record: string, description: string): Promise<void> {
  await db.put('auditLog', {
    id: uid('au_'),
    at: nowISO(),
    action,
    record,
    actor: 'User',
    description,
  } satisfies AuditEvent);
}

export async function loadSettings(): Promise<CompanySettings> {
  const row = await db.get<{ key: string; value: CompanySettings }>('settings', 'company');
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(patch: Partial<CompanySettings>): Promise<CompanySettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await db.put('settings', { key: 'company', value: next });
  await logAudit('settings-changed', 'company', 'Company settings updated');
  return next;
}

/** Seed the demo company on first run. Deterministic — reset regenerates it. */
export async function ensureSeeded(): Promise<boolean> {
  const existing = await db.get('settings', 'company');
  if (existing) return false;
  const demo = generateDemoData();
  await db.bulkPut('accounts', demo.accounts);
  await db.bulkPut('journalEntries', demo.entries);
  await db.bulkPut('customers', demo.customers);
  await db.bulkPut('vendors', demo.vendors);
  await db.bulkPut('inventoryItems', demo.items);
  await db.bulkPut('fixedAssets', demo.fixedAssets);
  await db.bulkPut('periods', demo.periods);
  await db.put('settings', { key: 'company', value: { ...DEFAULT_SETTINGS, demoSeeded: true } });
  await db.put('docCounters', { key: 'JE', value: demo.entries.length + 1 });
  await db.put('docCounters', { key: 'INV', value: 1000 });
  await db.put('docCounters', { key: 'BILL', value: 1000 });
  await db.put('docCounters', { key: 'RCPT', value: 1000 });
  await db.put('docCounters', { key: 'PAY', value: 1000 });
  await logAudit('seed', 'demo-company', `Demo company seeded with ${demo.entries.length} journal entries`);
  return true;
}

export async function resetDemoData(): Promise<void> {
  for (const s of ['accounts', 'journalEntries', 'customers', 'vendors', 'inventoryItems', 'fixedAssets', 'periods', 'auditLog', 'docCounters'] as const) {
    await db.clear(s);
  }
  await db.del('settings', 'company');
  await ensureSeeded();
}

export async function loadSnapshot(): Promise<AccountingSnapshot> {
  const [settings, accounts, entries, customers, vendors, items, fixedAssets, periods, audit] = await Promise.all([
    loadSettings(),
    db.all<Account>('accounts'),
    db.all<JournalEntry>('journalEntries'),
    db.all<Customer>('customers'),
    db.all<Vendor>('vendors'),
    db.all<InventoryItem>('inventoryItems'),
    db.all<FixedAsset>('fixedAssets'),
    db.all<FiscalPeriod>('periods'),
    db.all<AuditEvent>('auditLog'),
  ]);
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.entryNo < b.entryNo ? -1 : 1));
  audit.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { settings, accounts, entries, customers, vendors, items, fixedAssets, periods, audit };
}

/** Next document number for a prefix (JE, INV, BILL, RCPT, PAY). */
export async function nextDocNumber(prefix: string): Promise<number> {
  const row = await db.get<{ key: string; value: number }>('docCounters', prefix);
  const n = (row?.value ?? 1);
  await db.put('docCounters', { key: prefix, value: n + 1 });
  return n;
}

export function formatEntryNo(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(6, '0')}`;
}

export interface SaveEntryResult { ok: boolean; errors: string[]; entry?: JournalEntry; }

/** Create or update a journal entry (draft or posted). Validates balance + period lock. */
export async function saveJournalEntry(
  snap: AccountingSnapshot,
  input: Partial<JournalEntry> & { lines: JournalEntry['lines'] },
  opts: { post: boolean },
): Promise<SaveEntryResult> {
  const v = validateJournalEntry(
    { date: input.date ?? todayISO(), description: input.description ?? '', lines: input.lines },
    snap.accounts,
    snap.periods,
    { checkLock: opts.post },
  );
  if (!v.ok) return { ok: false, errors: v.errors };

  const now = nowISO();
  if (input.id) {
    const existing = snap.entries.find((e) => e.id === input.id);
    if (!existing) return { ok: false, errors: ['Entry not found.'] };
    if (existing.status === 'posted' && opts.post) {
      return { ok: false, errors: ['Posted entries cannot be edited. Reverse it instead.'] };
    }
    if (existing.status !== 'draft') return { ok: false, errors: ['Only drafts can be edited.'] };
    const updated: JournalEntry = {
      ...existing,
      ...input,
      lines: input.lines,
      status: opts.post ? 'posted' : 'draft',
      updatedAt: now,
    } as JournalEntry;
    const t = entryTotals(updated);
    if (opts.post && t.diff !== 0) return { ok: false, errors: ['Entry is out of balance.'] };
    await db.put('journalEntries', updated);
    await logAudit(opts.post ? 'posted' : 'edited', updated.entryNo, `${opts.post ? 'Posted' : 'Updated draft'} ${updated.entryNo} — ${updated.description}`);
    return { ok: true, errors: [], entry: updated };
  }

  // Honor an explicitly supplied entry number (CSV import); otherwise mint the next one.
  const explicitNo = input.entryNo && input.entryNo.trim() ? input.entryNo.trim() : undefined;
  const n = explicitNo ? null : await nextDocNumber(snap.settings.jePrefix.replace(/-$/, '') || 'JE');
  const entry: JournalEntry = {
    id: uid('je_'),
    entryNo: explicitNo ?? formatEntryNo(snap.settings.jePrefix, n as number),
    kind: (input.kind ?? 'general') as EntryKind,
    date: input.date ?? todayISO(),
    reference: input.reference ?? '',
    description: input.description ?? '',
    source: input.source,
    memo: input.memo,
    lines: input.lines,
    status: opts.post ? 'posted' : 'draft',
    currency: snap.settings.baseCurrency,
    exchangeRate: 1,
    createdAt: now,
    updatedAt: now,
  };
  const t = entryTotals(entry);
  if (opts.post && t.diff !== 0) return { ok: false, errors: ['Entry is out of balance.'] };
  await db.put('journalEntries', entry);
  await logAudit(opts.post ? 'posted' : 'created', entry.entryNo, `${opts.post ? 'Posted' : 'Saved draft'} ${entry.entryNo} — ${entry.description}`);
  return { ok: true, errors: [], entry };
}

export async function deleteDraft(snap: AccountingSnapshot, id: string): Promise<void> {
  const e = snap.entries.find((x) => x.id === id);
  if (!e || e.status !== 'draft') throw new Error('Only drafts can be deleted.');
  await db.del('journalEntries', id);
  await logAudit('deleted-draft', e.entryNo, `Deleted draft ${e.entryNo}`);
}

/** Reverse a posted entry with an equal-and-opposite entry. Never deletes. */
export async function reverseJournalEntry(snap: AccountingSnapshot, id: string, date?: string): Promise<JournalEntry> {
  const original = snap.entries.find((e) => e.id === id);
  if (!original) throw new Error('Entry not found.');
  if (original.status !== 'posted') throw new Error('Only posted entries can be reversed.');
  if (original.reversedBy) throw new Error('This entry has already been reversed.');
  const revDate = date ?? todayISO();
  if (isDateLocked(snap.periods, revDate)) throw new Error('The reversal date falls in a locked period.');
  const n = await nextDocNumber(snap.settings.jePrefix.replace(/-$/, '') || 'JE');
  const reversal = buildReversal(original, formatEntryNo(snap.settings.jePrefix, n), revDate, uid, nowISO());
  await db.put('journalEntries', reversal);
  await db.put('journalEntries', { ...original, status: 'reversed', reversedBy: reversal.id, updatedAt: nowISO() });
  await logAudit('reversed', original.entryNo, `Reversed ${original.entryNo} with ${reversal.entryNo}`);
  return reversal;
}

export async function setPeriodLock(periodId: string, locked: boolean): Promise<void> {
  const p = await db.get<FiscalPeriod>('periods', periodId);
  if (!p) throw new Error('Period not found.');
  await db.put('periods', { ...p, locked });
  await logAudit(locked ? 'period-locked' : 'period-unlocked', p.label, `${p.label} ${locked ? 'locked' : 'unlocked'}`);
}

/* ---------------- backup / restore ---------------- */

export interface BackupData {
  app: string;
  version: number;
  exportedAt: string;
  settings: CompanySettings;
  accounts: Account[];
  entries: JournalEntry[];
  customers: Customer[];
  vendors: Vendor[];
  items: InventoryItem[];
  fixedAssets: FixedAsset[];
  periods: FiscalPeriod[];
  audit: AuditEvent[];
}

export async function exportBackup(): Promise<BackupData> {
  const snap = await loadSnapshot();
  await logAudit('data-exported', 'backup', 'Full data backup exported (JSON)');
  return {
    app: 'accountflow',
    version: 1,
    exportedAt: nowISO(),
    settings: snap.settings,
    accounts: snap.accounts,
    entries: snap.entries,
    customers: snap.customers,
    vendors: snap.vendors,
    items: snap.items,
    fixedAssets: snap.fixedAssets,
    periods: snap.periods,
    audit: snap.audit,
  };
}

export async function importBackup(data: BackupData): Promise<void> {
  if (!data || data.app !== 'accountflow' || !Array.isArray(data.entries) || !Array.isArray(data.accounts)) {
    throw new Error('Invalid backup file.');
  }
  for (const s of ['accounts', 'journalEntries', 'customers', 'vendors', 'inventoryItems', 'fixedAssets', 'periods', 'auditLog'] as const) {
    await db.clear(s);
  }
  await db.bulkPut('accounts', data.accounts);
  await db.bulkPut('journalEntries', data.entries);
  await db.bulkPut('customers', data.customers ?? []);
  await db.bulkPut('vendors', data.vendors ?? []);
  await db.bulkPut('inventoryItems', data.items ?? []);
  await db.bulkPut('fixedAssets', data.fixedAssets ?? []);
  await db.bulkPut('periods', data.periods ?? []);
  await db.bulkPut('auditLog', data.audit ?? []);
  if (data.settings) await db.put('settings', { key: 'company', value: { ...DEFAULT_SETTINGS, ...data.settings } });
  await logAudit('data-imported', 'backup', `Backup restored (${data.entries.length} entries)`);
}
