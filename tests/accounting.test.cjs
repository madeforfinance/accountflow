/* Accounting invariant verification for the AccountFlow demo dataset.
 * Usage: npm test
 * Compiles the pure accounting modules with the project's TypeScript and
 * asserts every invariant the app depends on. No browser needed. */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'af-test-'));

console.log('Compiling accounting modules…');
execSync(
  `npx tsc src/accounting/types.ts src/accounting/chart.ts src/accounting/engine.ts ` +
  `src/accounting/validation.ts src/accounting/demo.ts src/lib/format.ts ` +
  `--outDir ${OUT} --module commonjs --target es2020 --moduleResolution node ` +
  `--skipLibCheck --esModuleInterop --declaration false`,
  { cwd: ROOT, stdio: 'pipe' },
);

const { generateDemoData } = require(path.join(OUT, 'accounting/demo.js'));
const E = require(path.join(OUT, 'accounting/engine.js'));
const V = require(path.join(OUT, 'accounting/validation.js'));

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}
const r2 = (n) => Math.round(n * 100) / 100;

console.log('Generating demo data…');
const t0 = Date.now();
const data = generateDemoData();
console.log(`  generated in ${Date.now() - t0}ms`);
const { accounts, entries, customers, vendors, items, fixedAssets } = data;
const byCode = new Map(accounts.map((a) => [a.code, a]));
const FY_START = '2026-01-01', FY_END = '2026-12-31';

console.log('\n[0] Determinism (reset must restore the identical dataset)');
const again = generateDemoData();
check('two generations byte-identical', JSON.stringify(again.entries) === JSON.stringify(entries), `${entries.length} entries`);

console.log('\n[1] Volume & distribution');
check('entry count 1200-1500', entries.length >= 1200 && entries.length <= 1500, `${entries.length} entries`);
const months = new Set(entries.map((e) => e.date.slice(0, 7)));
check('all 12 months covered', months.size === 12, `${months.size} months`);
const perMonth = {};
for (const e of entries) perMonth[e.date.slice(0, 7)] = (perMonth[e.date.slice(0, 7)] || 0) + 1;
const counts = Object.values(perMonth);
check('no month dominates (>25% of entries)', Math.max(...counts) / entries.length < 0.25,
  `max month ${(100 * Math.max(...counts) / entries.length).toFixed(1)}%`);

console.log('\n[2] Journal integrity');
let unbalanced = 0;
for (const e of entries) { const t = E.entryTotals(e); if (t.diff !== 0) unbalanced++; }
check('every entry balances (Dr=Cr)', unbalanced === 0, `${unbalanced} unbalanced`);
const kinds = new Set(entries.map((e) => e.kind));
for (const k of ['opening','sales','purchase','cash-receipt','cash-payment','bank-receipt','bank-payment','payroll','expense','depreciation','inventory','adjustment'])
  check(`kind present: ${k}`, kinds.has(k), kinds.has(k) ? '' : 'MISSING');

console.log('\n[3] Trial balance');
const tb = E.trialBalance(accounts, entries, FY_END);
check('TB balanced', tb.balanced, `Dr ${tb.totalDebit.toLocaleString()} = Cr ${tb.totalCredit.toLocaleString()}`);
check('TB has rows', tb.rows.length > 30, `${tb.rows.length} accounts`);
const atb = E.adjustedTrialBalance(accounts, entries, FY_END);
check('Adjusted TB balanced', atb.balanced, `Dr ${atb.totalDebit.toLocaleString()}`);
check('Adjusted TB has adjustments', atb.totalAdjDebit > 0, `adj Dr ${atb.totalAdjDebit.toLocaleString()}`);

console.log('\n[4] Financial statements');
const is = E.incomeStatement(accounts, entries, FY_START, FY_END);
check('net profit positive & sane', is.netProfit > 1000000 && is.netProfit < 60000000, `Rs. ${is.netProfit.toLocaleString()}`);
check('profit identity Rev-Exp=NP',
  r2(is.totalRevenue - is.totalCostOfSales - is.totalExpenses + is.totalOtherIncome - is.totalOtherExpenses) === r2(is.netProfit),
  `rev ${is.totalRevenue.toLocaleString()} cos ${is.totalCostOfSales.toLocaleString()} exp ${is.totalExpenses.toLocaleString()}`);
const bs = E.balanceSheet(accounts, entries, FY_END, FY_START);
check('BS balances (A = E+L)', bs.balanced,
  `A ${bs.totalAssets.toLocaleString()} vs E+L ${bs.totalEquityAndLiabilities.toLocaleString()} diff ${bs.diff}`);
const cf = E.cashFlow(accounts, entries, FY_START, FY_END, FY_START);
check('cash flow reconciles', cf.reconciled,
  `net change ${cf.netChange.toLocaleString()} vs Δcash ${(cf.closingCash - cf.openingCash).toLocaleString()}`);
check('CF closing cash positive', cf.closingCash > 0, cf.closingCash.toLocaleString());
const ce = E.changesInEquity(accounts, entries, FY_START, FY_END, FY_START);
check('equity movement ties to BS', r2(ce.totals.closing) === r2(bs.totalEquity),
  `CE ${ce.totals.closing.toLocaleString()} vs BS ${bs.totalEquity.toLocaleString()}`);

console.log('\n[5] Subledger reconciliations');
const arSub = E.subledger(entries, byCode.get('1130'), FY_START, FY_END);
const arCtrl = E.movementOf(byCode.get('1130'), E.sumPostings(entries, { to: FY_END }));
const arRec = E.reconcileSubledger(arSub, arCtrl);
check('AR subledger = control', arRec.reconciled, `sub ${arRec.subTotal.toLocaleString()} vs ctrl ${arRec.control.toLocaleString()}`);
const apSub = E.subledger(entries, byCode.get('2110'), FY_START, FY_END);
const apCtrl = E.movementOf(byCode.get('2110'), E.sumPostings(entries, { to: FY_END }));
const apRec = E.reconcileSubledger(apSub, apCtrl);
check('AP subledger = control', apRec.reconciled, `sub ${apRec.subTotal.toLocaleString()} vs ctrl ${apRec.control.toLocaleString()}`);
check('no negative customer balances', arSub.every((r) => r.closing >= -0.01), '');
check('no negative vendor balances', apSub.every((r) => r.closing >= -0.01), '');

console.log('\n[6] Inventory');
const invCtrl = E.movementOf(byCode.get('1140'), E.sumPostings(entries, { to: FY_END }));
const invVal = r2(items.reduce((t, i) => t + r2(i.unitCost * i.quantity), 0));
check('inventory items = 1140 control', Math.abs(invVal - invCtrl) < 0.05,
  `items ${invVal.toLocaleString()} vs ctrl ${invCtrl.toLocaleString()}`);
check('no negative item qty', items.every((i) => i.quantity >= 0), '');

console.log('\n[7] Ledger spot-check (Cash 1110)');
const cash = byCode.get('1110');
const led = E.ledgerForAccount(cash, entries, FY_START, FY_END);
check('ledger: opening + net = closing',
  r2(led.opening + led.totalDebit - led.totalCredit) === r2(led.closing),
  `open ${led.opening.toLocaleString()} close ${led.closing.toLocaleString()}`);
check('cash never deeply negative in ledger', Math.min(...led.rows.map((r) => r.running), led.opening) > -100000, '');

console.log('\n[8] Reversal math');
const sample = entries.find((e) => e.kind === 'sales' && e.lines.length === 2);
const rev = E.buildReversal(sample, 'JE-999999', '2026-12-31', (p) => p + 'x', new Date().toISOString());
const rt = E.entryTotals(rev);
check('reversal balances', rt.diff === 0, '');
const combined = [...sample.lines, ...rev.lines].reduce((s, l) => ({ d: s.d + l.debit - l.credit, c: s.c + l.credit - l.debit }), { d: 0, c: 0 });
check('original + reversal nets to zero', r2(combined.d) === 0 && r2(combined.c) === 0, '');

console.log('\n[9] Validation engine');
const bad = { date: '2026-05-01', description: 'x', lines: [{ accountId: byCode.get('1110').id, debit: 100, credit: 0, id: 'a', accountCode: '1110', description: '' }] };
const vr = V.validateJournalEntry(bad, accounts, []);
check('rejects unbalanced entry', !vr.ok && vr.errors.length > 0, vr.errors[0] || '');

console.log('\n[10] Scenario coverage');
const descs = entries.map((e) => e.description);
const has = (re) => descs.some((d) => re.test(d));
const scenarios = [
  [/Cash sale/, 'cash sale'], [/Credit sale/, 'credit sale'], [/Cash purchase/, 'cash purchase'],
  [/Credit purchase/, 'credit purchase'], [/Payment received from/, 'customer payment'],
  [/Payment to supplier/, 'supplier payment'], [/Sales return/, 'sales return'], [/Purchase return/, 'purchase return'],
  [/salaries/i, 'salary'], [/Office rent/, 'rent'], [/Electricity/, 'utility'], [/Bank charges/, 'bank charges'],
  [/Term loan received/, 'loan receipt'], [/Loan installment/, 'loan repayment'], [/interest/i, 'interest'],
  [/server & networking/i, 'asset purchase'], [/Depreciation/, 'depreciation'], [/Insurance prepaid amortization/, 'prepaid'],
  [/Accrued electricity/, 'accrued expense'], [/unearned revenue/i, 'unearned revenue'], [/Bad debt/, 'bad debt'],
  [/physical count/, 'inventory adjustment'], [/Additional capital/, 'owner investment'], [/drawings/i, 'owner withdrawal'],
  [/Advance income tax/, 'tax transaction'], [/Provision for income tax/, 'year-end tax'],
];
for (const [re, label] of scenarios) check(`scenario: ${label}`, has(re), '');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
console.log(`Entries: ${entries.length}, Lines: ${entries.reduce((t, e) => t + e.lines.length, 0)}`);
console.log(`Revenue: Rs. ${is.totalRevenue.toLocaleString()}  Net profit: Rs. ${is.netProfit.toLocaleString()}`);
console.log(`Assets: Rs. ${bs.totalAssets.toLocaleString()}  Equity: Rs. ${bs.totalEquity.toLocaleString()}`);
process.exit(failures === 0 ? 0 : 1);
