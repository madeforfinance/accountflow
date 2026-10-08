/* Deterministic demo dataset — PakTech Trading (Pvt.) Ltd., FY 2026.
   Seeded PRNG => identical dataset on every generation (reset = regenerate).
   Every entry balances; subledgers reconcile to control accounts by construction. */

import {
  Account, JournalEntry, JournalLine, Customer, Vendor,
  InventoryItem, FixedAsset, FiscalPeriod, EntryKind,
} from './types';
import { seedChartOfAccounts } from './chart';
import { round2 } from '../lib/format';

export interface DemoData {
  accounts: Account[];
  entries: JournalEntry[];
  customers: Customer[];
  vendors: Vendor[];
  items: InventoryItem[];
  fixedAssets: FixedAsset[];
  periods: FiscalPeriod[];
}

/* ---------- seeded RNG ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
const money = (min: number, max: number) => round2(ri(Math.ceil(min / 100), Math.floor(max / 100)) * 100);
/** Deterministic shuffle: always consumes exactly (n-1) RNG draws, unlike
 *  sort(() => rnd() - 0.5) whose draw count depends on the engine's sort. */
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const SEASON = [0.85, 0.9, 1.1, 1.0, 1.05, 0.95, 0.9, 1.15, 1.05, 1.0, 1.1, 1.35];

/* Module-level RNG handle — re-seeded at the start of every generateDemoData()
   call so reset always restores the identical original dataset. */
let rnd: () => number = mulberry32(20260108);

interface ItemState { sku: string; name: string; unit: string; qty: number; value: number; reorderLevel: number; }

export function generateDemoData(): DemoData {
  rnd = mulberry32(20260108); // deterministic: every generation is identical
  const accounts = seedChartOfAccounts();
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  const entries: JournalEntry[] = [];
  let seq = 0;
  const counters: Record<string, number> = {};
  const nextRef = (prefix: string) => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
  };

  const customers: Customer[] = [
    { id: 'cust_001', code: 'CUST-001', name: 'City Office Supplies', phone: '+92 51 234 5678', email: 'orders@cityofficesupplies.example.pk', address: 'G-9 Markaz, Islamabad', openingBalance: 420000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_002', code: 'CUST-002', name: 'Al-Noor Traders', phone: '+92 51 345 6789', email: 'info@alnoortraders.example.pk', address: 'Raja Bazaar, Rawalpindi', openingBalance: 380000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_003', code: 'CUST-003', name: 'TechZone Retail', phone: '+92 51 456 7890', email: 'sales@techzone.example.pk', address: 'F-10 Markaz, Islamabad', openingBalance: 310000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_004', code: 'CUST-004', name: 'Bright Future Schools', phone: '+92 51 567 8901', email: 'procurement@brightfuture.example.pk', address: 'DHA Phase 2, Islamabad', openingBalance: 260000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_005', code: 'CUST-005', name: 'MediCare Clinics', phone: '+92 51 678 9012', email: 'admin@medicare.example.pk', address: 'Satellite Town, Rawalpindi', openingBalance: 210000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_006', code: 'CUST-006', name: 'HomeComfort Furniture', phone: '+92 51 789 0123', email: 'hello@homecomfort.example.pk', address: 'Giga Mall, DHA Phase 2, Islamabad', openingBalance: 150000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_007', code: 'CUST-007', name: 'QuickPrint Services', phone: '+92 51 890 1234', email: 'jobs@quickprint.example.pk', address: 'Blue Area, Islamabad', openingBalance: 120000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cust_008', code: 'CUST-008', name: 'NewStart Enterprises', phone: '+92 51 901 2345', email: 'contact@newstart.example.pk', address: 'I-8 Markaz, Islamabad', openingBalance: 0, status: 'active', createdAt: '2026-03-14T09:00:00.000Z' },
  ];
  const vendors: Vendor[] = [
    { id: 'vend_001', code: 'VEND-001', name: 'MegaDistributors', phone: '+92 42 111 2233', email: 'sales@megadistributors.example.pk', address: 'Hall Road, Lahore', openingBalance: 850000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'vend_002', code: 'VEND-002', name: 'PakElectronics Wholesale', phone: '+92 21 345 6789', email: 'bulk@pakelectronics.example.pk', address: 'Saddar, Karachi', openingBalance: 620000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'vend_003', code: 'VEND-003', name: 'FurniCraft Industries', phone: '+92 55 123 4567', email: 'orders@furnicraft.example.pk', address: 'G.T. Road, Gujranwala', openingBalance: 430000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'vend_004', code: 'VEND-004', name: 'StationeryHub', phone: '+92 51 222 3344', email: 'info@stationeryhub.example.pk', address: 'Urdu Bazaar, Rawalpindi', openingBalance: 240000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'vend_005', code: 'VEND-005', name: 'LogiMove Freight', phone: '+92 51 333 4455', email: 'bookings@logimove.example.pk', address: 'Pirwadhai, Rawalpindi', openingBalance: 160000, status: 'active', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'vend_006', code: 'VEND-006', name: 'PrintPack Suppliers', phone: '+92 51 444 5566', email: 'sales@printpack.example.pk', address: 'I-9 Industrial Area, Islamabad', openingBalance: 0, status: 'active', createdAt: '2026-04-02T09:00:00.000Z' },
  ];

  // Balances tracked from zero — the opening entry (with contactIds) establishes them.
  const custBal = new Map(customers.map((c) => [c.id, 0]));
  const vendBal = new Map(vendors.map((v) => [v.id, 0]));

  const items: ItemState[] = [
    { sku: 'LT-HP15', name: 'HP Laptop 15s', unit: 'pcs', qty: 25, value: 1950000, reorderLevel: 8 },
    { sku: 'PR-CANON', name: 'Canon Printer MF445', unit: 'pcs', qty: 30, value: 960000, reorderLevel: 10 },
    { sku: 'CH-ERGO', name: 'Ergonomic Office Chair', unit: 'pcs', qty: 60, value: 570000, reorderLevel: 15 },
    { sku: 'DK-OAK', name: 'Oak Office Desk', unit: 'pcs', qty: 40, value: 480000, reorderLevel: 10 },
    { sku: 'TN-88A', name: 'Toner Cartridge 88A', unit: 'pcs', qty: 120, value: 240000, reorderLevel: 40 },
  ];
  const avgCost = (it: ItemState) => (it.qty > 0 ? it.value / it.qty : 0);

  const fixedAssets: FixedAsset[] = [
    { id: 'fa_001', code: 'FA-001', name: 'Delivery Van (Suzuki Bolan)', category: 'Vehicles', purchaseDate: '2023-06-15', cost: 3200000, accumulatedDep: 1100000, usefulLifeMonths: 60, depAccountId: byCode.get('6500')!.id, accDepAccountId: byCode.get('1220')!.id, status: 'active' },
    { id: 'fa_002', code: 'FA-002', name: 'Computer Equipment', category: 'IT Equipment', purchaseDate: '2024-01-10', cost: 1800000, accumulatedDep: 550000, usefulLifeMonths: 48, depAccountId: byCode.get('6500')!.id, accDepAccountId: byCode.get('1220')!.id, status: 'active' },
    { id: 'fa_003', code: 'FA-003', name: 'Office Furniture', category: 'Furniture', purchaseDate: '2022-03-01', cost: 1500000, accumulatedDep: 300000, usefulLifeMonths: 120, depAccountId: byCode.get('6500')!.id, accDepAccountId: byCode.get('1220')!.id, status: 'active' },
  ];

  let cashBal = 0;
  let bankBal = 0;

  interface LineSpec {
    code: string; debit?: number; credit?: number; desc?: string;
    contactId?: string; contactKind?: 'customer' | 'vendor';
  }

  function addEntry(o: {
    date: string; kind: EntryKind; reference?: string; description: string;
    source?: string; memo?: string; lines: LineSpec[];
  }): JournalEntry {
    seq += 1;
    const lines: JournalLine[] = o.lines.map((l, i) => {
      const a = byCode.get(l.code);
      if (!a) throw new Error(`Unknown account code ${l.code}`);
      const debit = round2(l.debit || 0);
      const credit = round2(l.credit || 0);
      // track cash/bank for realism guards
      if (l.code === '1110') cashBal = round2(cashBal + debit - credit);
      if (l.code === '1120') bankBal = round2(bankBal + debit - credit);
      if (l.code === '1130' && l.contactId) {
        custBal.set(l.contactId, round2((custBal.get(l.contactId) || 0) + debit - credit));
      }
      if (l.code === '2110' && l.contactId) {
        vendBal.set(l.contactId, round2((vendBal.get(l.contactId) || 0) + credit - debit));
      }
      return {
        id: `jl_${seq}_${i}`, accountId: a.id, accountCode: a.code,
        description: l.desc || '', debit, credit,
        contactId: l.contactId, contactKind: l.contactKind,
      };
    });
    const t = lines.reduce((s, l) => ({ d: round2(s.d + l.debit), c: round2(s.c + l.credit) }), { d: 0, c: 0 });
    if (t.d !== t.c) throw new Error(`Unbalanced generated entry on ${o.date}: ${o.description} (${t.d} vs ${t.c})`);
    const e: JournalEntry = {
      id: `je_${String(seq).padStart(5, '0')}`,
      entryNo: `JE-${String(seq).padStart(6, '0')}`,
      kind: o.kind,
      date: o.date,
      reference: o.reference || '',
      description: o.description,
      source: o.source,
      memo: o.memo,
      lines,
      status: 'posted',
      currency: 'PKR',
      exchangeRate: 1,
      createdAt: `${o.date}T10:00:00.000Z`,
      updatedAt: `${o.date}T10:00:00.000Z`,
    };
    entries.push(e);
    return e;
  }

  /** Keep cash positive: sweep bank -> cash when needed. */
  function ensureCash(date: string, needed: number) {
    if (cashBal >= needed + 20000) return;
    const amt = round2(Math.ceil((needed + 300000 - cashBal) / 1000) * 1000);
    addEntry({
      date, kind: 'bank-payment', reference: nextRef('PAY'),
      description: 'Cash withdrawn from bank for office float',
      source: 'Bank',
      lines: [
        { code: '1110', debit: amt, desc: 'Cash withdrawal' },
        { code: '1120', credit: amt, desc: 'Cash withdrawal' },
      ],
    });
  }

  const AR = byCode.get('1130')!.id;
  const AP = byCode.get('2110')!.id;
  void AR; void AP;

  /* ============ 01-Jan: opening balances ============ */
  addEntry({
    date: '2026-01-01', kind: 'opening', reference: 'OB-2026',
    description: 'Opening balances as at 1 January 2026', source: 'Opening Balance',
    lines: [
      { code: '1110', debit: 2500000, desc: 'Cash in hand' },
      { code: '1120', debit: 8000000, desc: 'Bank balance' },
      ...customers.filter((c) => c.openingBalance > 0).map((c) => ({
        code: '1130', debit: c.openingBalance, desc: `Opening receivable — ${c.name}`,
        contactId: c.id, contactKind: 'customer' as const,
      })),
      { code: '1140', debit: 4200000, desc: 'Opening inventory' },
      { code: '1150', debit: 360000, desc: 'Prepaid insurance' },
      { code: '1210', debit: 6500000, desc: 'Fixed assets at cost' },
      { code: '1220', credit: 1950000, desc: 'Accumulated depreciation' },
      ...vendors.filter((v) => v.openingBalance > 0).map((v) => ({
        code: '2110', credit: v.openingBalance, desc: `Opening payable — ${v.name}`,
        contactId: v.id, contactKind: 'vendor' as const,
      })),
      { code: '2120', credit: 180000, desc: 'Accrued expenses b/f' },
      { code: '2210', credit: 5000000, desc: 'Long-term bank loan' },
      { code: '3100', credit: 10000000, desc: 'Share capital' },
      { code: '3200', credit: 3980000, desc: 'Retained earnings b/f' },
    ],
  });

  /* ============ depreciation schedule ============ */
  interface DepPlan { asset: FixedAsset; months: number[]; monthly: number; last: number; }
  const depPlans: DepPlan[] = fixedAssets.map((fa) => {
    const perMonth = fa.cost / fa.usefulLifeMonths;
    const total = round2(perMonth * 12);
    const monthly = round2(total / 12);
    return { asset: fa, months: [0,1,2,3,4,5,6,7,8,9,10,11], monthly, last: round2(total - monthly * 11) };
  });

  let monthCOGS = 0;
  let loanOutstanding = 5000000;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
  const weekday = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }; // 0 Sun
  const isWeekday = (iso: string) => { const w = weekday(iso); return w >= 1 && w <= 5; };

  /* ============ daily loop ============ */
  for (let m = 0; m < 12; m++) {
    const mm = pad2(m + 1);
    const dim = daysInMonth(2026, m + 1);
    const seasonal = SEASON[m];
    monthCOGS = 0;

    for (let d = 1; d <= dim; d++) {
      const dd = pad2(d);
      const date = `2026-${mm}-${dd}`;
      const lastDay = d === dim;

      // ---- rent (1st) ----
      if (d === 1) {
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: `Office rent for ${monthName(m)} 2026`, source: 'Bank',
          lines: [
            { code: '6200', debit: 180000, desc: 'Office rent' },
            { code: '1120', credit: 180000, desc: 'Rent paid via bank' },
          ],
        });
      }
      // ---- additional capital (01-Jul) ----
      if (m === 6 && d === 1) {
        addEntry({
          date, kind: 'general', reference: nextRef('JE'), description: 'Additional capital introduced by owner', source: 'Journal',
          lines: [
            { code: '1120', debit: 2000000, desc: 'Capital received in bank' },
            { code: '3100', credit: 2000000, desc: 'Additional share capital' },
          ],
        });
      }
      // ---- drawings (5th) ----
      if (d === 5) {
        ensureCash(date, 150000);
        addEntry({
          date, kind: 'cash-payment', reference: nextRef('PAY'), description: "Owner's monthly drawings", source: 'Cash',
          lines: [
            { code: '3400', debit: 150000, desc: "Owner's drawings" },
            { code: '1110', credit: 150000, desc: 'Cash paid to owner' },
          ],
        });
      }
      // ---- fuel (8th & 22nd) ----
      if (d === 8 || d === 22) {
        const amt = money(12000, 20000);
        ensureCash(date, amt);
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Fuel for delivery van', source: 'Cash',
          lines: [
            { code: '6920', debit: amt, desc: 'Fuel expense' },
            { code: '1110', credit: amt, desc: 'Fuel paid in cash' },
          ],
        });
      }
      // ---- internet (10th) ----
      if (d === 10) {
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Internet & telephone bill', source: 'Bank',
          lines: [
            { code: '6940', debit: 18500, desc: 'Internet & telephone' },
            { code: '1120', credit: 18500, desc: 'Bill paid via bank' },
          ],
        });
      }
      // ---- office expenses (Fridays) ----
      if (weekday(date) === 5) {
        const amt = money(3000, 12000);
        ensureCash(date, amt);
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Office supplies & misc expenses', source: 'Cash',
          lines: [
            { code: '6700', debit: amt, desc: pick(['Stationery', 'Cleaning supplies', 'Pantry items', 'Printing & photocopy', 'Courier charges']) },
            { code: '1110', credit: amt, desc: 'Paid in cash' },
          ],
        });
      }
      // ---- utilities (15th) ----
      if (d === 15) {
        const amt = money(35000 * (m >= 4 && m <= 8 ? 1.4 : 1), 65000 * (m >= 4 && m <= 8 ? 1.4 : 1));
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Electricity & gas bill', source: 'Bank',
          lines: [
            { code: '6300', debit: amt, desc: 'Utilities' },
            { code: '1120', credit: amt, desc: 'Utility bill paid' },
          ],
        });
        // advance tax (quarterly)
        if (m === 2 || m === 5 || m === 8 || m === 11) {
          addEntry({
            date, kind: 'bank-payment', reference: nextRef('PAY'), description: 'Advance income tax paid (quarterly)', source: 'Bank',
            lines: [
              { code: '2130', debit: 200000, desc: 'Advance tax' },
              { code: '1120', credit: 200000, desc: 'Tax paid via bank' },
            ],
          });
        }
        // loan received (15-Mar)
        if (m === 2) {
          addEntry({
            date, kind: 'bank-receipt', reference: nextRef('RCPT'), description: 'Term loan received from bank', source: 'Bank',
            lines: [
              { code: '1120', debit: 3000000, desc: 'Loan credited by bank' },
              { code: '2210', credit: 3000000, desc: 'Long-term loan' },
            ],
          });
          loanOutstanding += 3000000;
        }
      }
      // ---- marketing (20th) ----
      if (d === 20) {
        const amt = money(50000, 120000 * seasonal);
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Marketing & advertising campaign', source: 'Bank',
          lines: [
            { code: '6400', debit: amt, desc: pick(['Social media ads', 'Flyers & banners', 'Radio spots', 'Google ads']) },
            { code: '1120', credit: amt, desc: 'Marketing paid' },
          ],
        });
        // bad debt write-off (20-Dec) — whatever remains of QuickPrint's balance
        if (m === 11) {
          const bdBal = Math.round((custBal.get('cust_007') || 0) * 100) / 100;
          const bdAmt = Math.min(45000, bdBal);
          if (bdAmt > 0) {
            addEntry({
              date, kind: 'adjustment', reference: nextRef('JE'), description: 'Bad debt written off — QuickPrint Services (unrecoverable)', source: 'Adjustment',
              lines: [
                { code: '8200', debit: bdAmt, desc: 'Bad debt expense' },
                { code: '1130', credit: bdAmt, desc: 'Write off QuickPrint Services', contactId: 'cust_007', contactKind: 'customer' },
              ],
            });
          }
        }
      }
      // ---- professional fees (quarterly, 25th) ----
      if (d === 25 && (m === 2 || m === 5 || m === 8 || m === 11)) {
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: 'Professional fee — tax consultant (quarterly)', source: 'Bank',
          lines: [
            { code: '6800', debit: 75000, desc: 'Professional fees' },
            { code: '1120', credit: 75000, desc: 'Fee paid via bank' },
          ],
        });
      }
      // ---- loan repayment (25th, Apr–Dec) ----
      if (d === 25 && m >= 3) {
        const principal = 120000;
        const interest = round2(loanOutstanding * 0.01);
        loanOutstanding = round2(loanOutstanding - principal);
        addEntry({
          date, kind: 'bank-payment', reference: nextRef('PAY'), description: `Loan installment — principal ${principal.toLocaleString('en-PK')} + interest`, source: 'Bank',
          lines: [
            { code: '2210', debit: principal, desc: 'Loan principal repaid' },
            { code: '8100', debit: interest, desc: 'Interest on loan' },
            { code: '1120', credit: round2(principal + interest), desc: 'Installment paid' },
          ],
        });
      }
      // ---- sales return (12th & 26th, sometimes) ----
      if ((d === 12 || d === 26) && chance(0.6)) {
        const owing = customers.filter((c) => (custBal.get(c.id) || 0) > 50000);
        if (owing.length) {
          const cust = pick(owing);
          const bal = custBal.get(cust.id)!;
          const amt = Math.min(money(25000, 120000), round2(bal));
          if (amt < 1000) continue;
          const it = pick(items.filter((i) => i.qty > 0));
          const qty = Math.min(it.qty, ri(1, 4));
          const cost = round2(avgCost(it) * qty);
          it.qty += qty; it.value = round2(it.value + cost);
          addEntry({
            date, kind: 'sales', reference: nextRef('INV'), description: `Sales return — ${cust.name}`, source: 'Sales',
            lines: [
              { code: '4110', debit: amt, desc: 'Sales returns' },
              { code: '1130', credit: amt, desc: `Credit note — ${cust.name}`, contactId: cust.id, contactKind: 'customer' },
              { code: '1140', debit: cost, desc: 'Goods returned to stock' },
              { code: '5100', credit: cost, desc: 'COGS reversal on return' },
            ],
          });
        }
      }
      // ---- purchase return (18th, sometimes) ----
      if (d === 18 && chance(0.4)) {
        const candidates = vendors.filter((v) => (vendBal.get(v.id) || 0) > 80000);
        if (candidates.length) {
          const vend = pick(candidates);
          const vbal = vendBal.get(vend.id)!;
          const it = pick(items.filter((i) => i.value > 1000));
          if (it) {
            const cost = round2(Math.min(money(20000, 90000), it.value, vbal));
            if (cost < 1000) continue;
            const qty = Math.min(it.qty, Math.max(1, Math.round(cost / avgCost(it))));
            const actual = round2(avgCost(it) * qty);
            it.qty -= qty;
            it.value = round2(it.value - actual);
            addEntry({
              date, kind: 'purchase', reference: nextRef('BILL'), description: `Purchase return — ${vend.name}`, source: 'Purchase',
              lines: [
                { code: '2110', debit: actual, desc: `Debit note — ${vend.name}`, contactId: vend.id, contactKind: 'vendor' },
                { code: '1140', credit: actual, desc: 'Goods returned to supplier' },
              ],
            });
          }
        }
      }
      // ---- salaries (28th) ----
      if (d === 28) {
        const amt = money(1420000, 1520000);
        addEntry({
          date, kind: 'payroll', reference: nextRef('PAY'), description: `Staff salaries for ${monthName(m)} 2026`, source: 'Payroll',
          lines: [
            { code: '6100', debit: amt, desc: 'Salaries & wages' },
            { code: '1120', credit: amt, desc: 'Salaries paid via bank' },
          ],
        });
        // insurance amortization
        addEntry({
          date, kind: 'adjustment', reference: nextRef('JE'), description: `Insurance prepaid amortization — ${monthName(m)}`, source: 'Adjustment',
          lines: [
            { code: '6600', debit: 30000, desc: 'Insurance expense' },
            { code: '1150', credit: 30000, desc: 'Prepaid insurance amortized' },
          ],
        });
      }
      // ---- repairs (random) ----
      if (chance(0.06)) {
        const amt = money(8000, 35000);
        const viaCash = chance(0.5);
        if (viaCash) ensureCash(date, amt);
        addEntry({
          date, kind: 'expense', reference: nextRef('PAY'), description: pick(['Van repair & service', 'Office AC repair', 'Computer repair', 'Furniture repair']), source: viaCash ? 'Cash' : 'Bank',
          lines: [
            { code: '6930', debit: amt, desc: 'Repairs & maintenance' },
            { code: viaCash ? '1110' : '1120', credit: amt, desc: 'Repair paid' },
          ],
        });
      }

      /* ---- trading activity on business days ---- */
      if (isWeekday(date) || weekday(date) === 6) {
        // sales invoices
        const nSales = ri(1, 2) + (chance(0.5 * seasonal) ? 1 : 0) + (weekday(date) === 6 ? -1 : 0);
        for (let s = 0; s < Math.max(nSales, 0); s++) {
          const isCashSale = chance(0.3);
          const cust = isCashSale ? undefined : pick(customers);
          const nItems = ri(1, 3);
          let saleTotal = 0;
          let costTotal = 0;
          const descParts: string[] = [];
          for (let k = 0; k < nItems; k++) {
            const avail = items.filter((i) => i.qty >= 2);
            if (!avail.length) break;
            const it = pick(avail);
            const qty = Math.min(it.qty, ri(1, 6));
            const cost = avgCost(it);
            const price = round2(cost * (1.28 + rnd() * 0.25));
            const lineTotal = round2(price * qty);
            const lineCost = round2(cost * qty);
            saleTotal = round2(saleTotal + lineTotal);
            costTotal = round2(costTotal + lineCost);
            it.qty -= qty;
            it.value = round2(it.value - lineCost);
            descParts.push(`${qty} x ${it.name}`);
          }
          if (saleTotal <= 0) continue;
          monthCOGS = round2(monthCOGS + costTotal);
          const invRef = nextRef('INV');
          const discount = isCashSale && chance(0.25) ? round2(saleTotal * 0.03) : 0;
          const netCash = round2(saleTotal - discount);
          if (isCashSale) {
            addEntry({
              date, kind: 'sales', reference: invRef,
              description: `Cash sale ${invRef} — ${descParts.join(', ')}`, source: 'Sales',
              lines: [
                ...(discount > 0 ? [{ code: '4120', debit: discount, desc: 'Cash sale discount' }] : []),
                { code: '1110', debit: netCash, desc: 'Cash received' },
                { code: '4100', credit: saleTotal, desc: 'Sales revenue' },
              ],
            });
          } else {
            addEntry({
              date, kind: 'sales', reference: invRef,
              description: `Credit sale ${invRef} — ${cust!.name}: ${descParts.join(', ')}`, source: 'Sales',
              lines: [
                { code: '1130', debit: saleTotal, desc: `Invoice ${invRef} — ${cust!.name}`, contactId: cust!.id, contactKind: 'customer' },
                { code: '4100', credit: saleTotal, desc: 'Sales revenue' },
              ],
            });
          }
        }
        // purchases — reorder-point logic: restock items running low
        if ([1, 3, 5].includes(weekday(date))) {
          const needy = items.filter((i) => i.qty < i.reorderLevel * 4);
          if (needy.length && chance(0.85)) {
            const vend = pick(vendors);
            const batch = shuffle(needy).slice(0, ri(1, 2));
            let purchTotal = 0;
            const descParts: string[] = [];
            for (const it of batch) {
              const target = it.reorderLevel * 8;
              const qty = Math.max(10, target - it.qty);
              const cost = round2(avgCost(it) * (0.97 + rnd() * 0.06));
              const lineTotal = round2(cost * qty);
              purchTotal = round2(purchTotal + lineTotal);
              it.qty += qty;
              it.value = round2(it.value + lineTotal);
              descParts.push(`${qty} x ${it.name}`);
            }
            const billRef = nextRef('BILL');
            const isCash = chance(0.2);
            if (isCash) {
              const viaBank = chance(0.7);
              if (!viaBank) ensureCash(date, purchTotal);
              addEntry({
                date, kind: 'purchase', reference: billRef,
                description: `Cash purchase ${billRef} — ${vend.name}: ${descParts.join(', ')}`, source: 'Purchase',
                lines: [
                  { code: '1140', debit: purchTotal, desc: 'Inventory purchased' },
                  { code: viaBank ? '1120' : '1110', credit: purchTotal, desc: 'Purchase paid' },
                ],
              });
            } else {
              addEntry({
                date, kind: 'purchase', reference: billRef,
                description: `Credit purchase ${billRef} — ${vend.name}: ${descParts.join(', ')}`, source: 'Purchase',
                lines: [
                  { code: '1140', debit: purchTotal, desc: 'Inventory purchased' },
                  { code: '2110', credit: purchTotal, desc: `Bill ${billRef} — ${vend.name}`, contactId: vend.id, contactKind: 'vendor' },
                ],
              });
            }
          }
        }
        // customer receipts (skip QuickPrint after Aug — its balance will be written off)
        if (chance(0.75)) {
          const owing = customers.filter((c) => (custBal.get(c.id) || 0) > 20000 && !(m >= 8 && c.id === 'cust_007'));
          if (owing.length) {
            const cust = pick(owing);
            const bal = custBal.get(cust.id)!;
            const amt = Math.min(bal, money(200000, 900000));
            const viaBank = chance(0.8);
            addEntry({
              date, kind: viaBank ? 'bank-receipt' : 'cash-receipt', reference: nextRef('RCPT'),
              description: `Payment received from ${cust.name}`, source: viaBank ? 'Bank' : 'Cash',
              lines: [
                { code: viaBank ? '1120' : '1110', debit: amt, desc: `Receipt from ${cust.name}` },
                { code: '1130', credit: amt, desc: `Against invoices — ${cust.name}`, contactId: cust.id, contactKind: 'customer' },
              ],
            });
          }
        }
        // vendor payments — capped by available bank balance
        if (chance(0.5)) {
          const owed = vendors.filter((v) => (vendBal.get(v.id) || 0) > 20000);
          if (owed.length && bankBal > 400000) {
            const vend = pick(owed);
            const bal = vendBal.get(vend.id)!;
            const amt = Math.min(bal, money(150000, 800000), round2(bankBal - 300000));
            if (amt >= 20000) {
              addEntry({
                date, kind: 'bank-payment', reference: nextRef('PAY'),
                description: `Payment to supplier ${vend.name}`, source: 'Bank',
                lines: [
                  { code: '2110', debit: amt, desc: `Paid — ${vend.name}`, contactId: vend.id, contactKind: 'vendor' },
                  { code: '1120', credit: amt, desc: 'Paid via bank transfer' },
                ],
              });
            }
          }
        }
        // Monday: sweep excess cash to bank
        if (weekday(date) === 1 && cashBal > 900000) {
          const amt = round2(Math.floor((cashBal - 500000) / 1000) * 1000);
          if (amt > 0) {
            addEntry({
              date, kind: 'bank-receipt', reference: nextRef('RCPT'),
              description: 'Cash deposited into bank', source: 'Bank',
              lines: [
                { code: '1120', debit: amt, desc: 'Cash deposit' },
                { code: '1110', credit: amt, desc: 'Cash deposited' },
              ],
            });
          }
        }
      }

      /* ---- month-end ---- */
      if (lastDay) {
        // bank charges
        const bcAmt = money(2500, 6000);
        addEntry({
          date, kind: 'bank-payment', reference: nextRef('PAY'),
          description: `Bank charges — ${monthName(m)} 2026`, source: 'Bank',
          lines: [
            { code: '6910', debit: bcAmt, desc: 'Bank charges' },
            { code: '1120', credit: bcAmt, desc: 'Charges debited by bank' },
          ],
        });

        // depreciation
        for (const plan of depPlans) {
          if (!plan.months.includes(m)) continue;
          const isLast = m === 11 || (plan.asset.id === 'fa_004' && m === 11);
          const amt = isLast ? plan.last : plan.monthly;
          addEntry({
            date, kind: 'depreciation', reference: nextRef('JE'),
            description: `Depreciation — ${plan.asset.name} (${monthName(m)} 2026)`, source: 'Depreciation',
            lines: [
              { code: '6500', debit: amt, desc: `Depreciation — ${plan.asset.code}` },
              { code: '1220', credit: amt, desc: `Accumulated depreciation — ${plan.asset.code}` },
            ],
          });
        }
        // COGS for the month
        if (monthCOGS > 0) {
          addEntry({
            date, kind: 'inventory', reference: nextRef('JE'),
            description: `Cost of goods sold — ${monthName(m)} 2026`, source: 'Inventory',
            lines: [
              { code: '5100', debit: monthCOGS, desc: 'COGS for the month' },
              { code: '1140', credit: monthCOGS, desc: 'Inventory consumed' },
            ],
          });
        }
        // earned revenue (Sep–Dec)
        if (m >= 8) {
          addEntry({
            date, kind: 'adjustment', reference: nextRef('JE'),
            description: `Unearned revenue recognized — service contract (${monthName(m)} 2026)`, source: 'Adjustment',
            lines: [
              { code: '2140', debit: 125000, desc: 'Unearned revenue recognized' },
              { code: '4200', credit: 125000, desc: 'Service revenue' },
            ],
          });
        }
        // unearned revenue receipt (01-Sep handled below on first Sep day? do here for m==8 && d==1? no—separate)
      }

      // unearned revenue receipt (01-Sep)
      if (m === 8 && d === 1) {
        addEntry({
          date, kind: 'bank-receipt', reference: nextRef('RCPT'),
          description: 'Advance received — annual maintenance contract (City Office Supplies)', source: 'Bank',
          lines: [
            { code: '1120', debit: 500000, desc: 'Advance received' },
            { code: '2140', credit: 500000, desc: 'Unearned revenue' },
          ],
        });
      }
      // asset purchase (10-Jun)
      if (m === 5 && d === 10) {
        addEntry({
          date, kind: 'general', reference: nextRef('JE'),
          description: 'Purchased server & networking equipment', source: 'Journal',
          lines: [
            { code: '1210', debit: 650000, desc: 'Server & networking equipment' },
            { code: '1120', credit: 650000, desc: 'Paid via bank' },
          ],
        });
        const fa4: FixedAsset = {
          id: 'fa_004', code: 'FA-004', name: 'Server & Networking Equipment', category: 'IT Equipment',
          purchaseDate: '2026-06-10', cost: 650000, accumulatedDep: 0, usefulLifeMonths: 48,
          depAccountId: byCode.get('6500')!.id, accDepAccountId: byCode.get('1220')!.id, status: 'active',
        };
        fixedAssets.push(fa4);
        const perMonth = 650000 / 48;
        const total = round2(perMonth * 6);
        const monthly = round2(total / 6);
        depPlans.push({ asset: fa4, months: [6, 7, 8, 9, 10, 11], monthly, last: round2(total - monthly * 5) });
      }
    }
  }

  /* ============ 31-Dec year-end adjustments ============ */
  // accrued electricity
  addEntry({
    date: '2026-12-31', kind: 'adjustment', reference: nextRef('JE'),
    description: 'Accrued electricity expense for December 2026 (bill received in January)', source: 'Adjustment',
    lines: [
      { code: '6300', debit: 58000, desc: 'Accrued utilities' },
      { code: '2120', credit: 58000, desc: 'Accrued expenses' },
    ],
  });
  // income tax provision
  addEntry({
    date: '2026-12-31', kind: 'adjustment', reference: nextRef('JE'),
    description: 'Provision for income tax — Tax Year 2026', source: 'Adjustment',
    lines: [
      { code: '8400', debit: 1450000, desc: 'Income tax expense' },
      { code: '2130', credit: 1450000, desc: 'Tax provision' },
    ],
  });
  // inventory shortage (toner)
  {
    const toner = items.find((i) => i.sku === 'TN-88A')!;
    const qty = Math.min(8, toner.qty);
    const cost = round2(avgCost(toner) * qty);
    toner.qty -= qty;
    toner.value = round2(toner.value - cost);
    addEntry({
      date: '2026-12-31', kind: 'adjustment', reference: nextRef('JE'),
      description: 'Inventory shortage on physical count — toner cartridges', source: 'Adjustment',
      lines: [
        { code: '6900', debit: cost, desc: 'Inventory shortage' },
        { code: '1140', credit: cost, desc: 'Inventory written down' },
      ],
    });
  }
  // inventory valuation rounding — force exact reconciliation
  {
    let invBal = 0;
    for (const e of entries) {
      if (e.status !== 'posted') continue;
      for (const l of e.lines) {
        if (l.accountCode === '1140') invBal = round2(invBal + l.debit - l.credit);
      }
    }
    const itemsVal = round2(items.reduce((t, i) => t + i.value, 0));
    const diff = round2(invBal - itemsVal);
    if (diff !== 0) {
      addEntry({
        date: '2026-12-31', kind: 'adjustment', reference: nextRef('JE'),
        description: 'Inventory valuation rounding adjustment (physical count reconciliation)', source: 'Adjustment',
        lines: diff > 0
          ? [
              { code: '6900', debit: diff, desc: 'Inventory valuation difference' },
              { code: '1140', credit: diff, desc: 'Align book to count' },
            ]
          : [
              { code: '1140', debit: -diff, desc: 'Align book to count' },
              { code: '6900', credit: -diff, desc: 'Inventory valuation difference' },
            ],
      });
    }
  }

  /* ============ finalize ============ */
  const periods: FiscalPeriod[] = [
    { id: 'FY2026', label: 'FY 2026', start: '2026-01-01', end: '2026-12-31', locked: false },
  ];

  const invItems: InventoryItem[] = items.map((it, i) => ({
    id: `item_${String(i + 1).padStart(3, '0')}`,
    sku: it.sku,
    name: it.name,
    unit: it.unit,
    // full-precision unit cost: unitCost * quantity === tracked value (display rounds)
    unitCost: it.qty > 0 ? it.value / it.qty : 0,
    quantity: it.qty,
    reorderLevel: it.reorderLevel,
    status: 'active',
  }));

  return { accounts, entries, customers, vendors, items: invItems, fixedAssets, periods };
}

function monthName(m: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];
}

/** Item states at any point — used by the verification harness. */
export function itemValues(items: InventoryItem[]): number {
  return round2(items.reduce((t, i) => t + round2(i.unitCost * i.quantity), 0));
}
