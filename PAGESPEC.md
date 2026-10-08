# AccountFlow — Page Build Spec (for subagents)

Build the assigned pages in `~/workspace/accountflow/src/pages/`. Follow these contracts exactly.

## Global rules
- TypeScript strict. `import React` where JSX is used. No placeholder functionality — every button works.
- Use shared UI from `../components/ui`: Page, Card, Btn, Field, TextInput, NumberInput, Select, Textarea, Switch, Segmented, Modal, ConfirmDialog, EmptyState, Stat, Badge, Tabs, SearchInput, Chip, Skeleton.
- Report components from `../components/report`: ReportShell, ReportHeader, ReportFooter, ReportTable({cols, rows}), Money, Acct, periodLabel, asOfLabel.
  - `ReportTable` cols: `{ label, align?: 'l'|'r'|'c', width? }`; rows: `{ kind: 'data'|'section'|'sub'|'sub2'|'total'|'grand'|'note', cells: ReactNode[] }`. Number cells: wrap in `<span className="num">`.
- Accounting helpers from `../components/acct`: useDateRange, DateRangeControl, AsOfControl, ExportButtons, AccountSelect, EntryStatusBadge, KindBadge, LoadingCard, fmtPeriod.
- Data: `const { snap, ready } = useAccounting()` (from `../app/accounting`). If `!snap` render `<Page title="…"><LoadingCard /></Page>`. Never invent data — derive everything from `snap.entries` (posted), `snap.accounts`, etc. via the engine.
- Settings: `const { settings } = useSettings()` (from `../app/settings`).
- Engine (`../accounting/engine`): see function list below. All pure.
- Mutations (`../accounting/data`): saveJournalEntry, reverseJournalEntry, deleteDraft, setPeriodLock, resetDemoData, exportBackup, importBackup, logAudit.
- Validation (`../accounting/validation`): validateJournalEntry, validateAccount, validateImportGroups.
- PDF: `exportReportPdf` from `../lib/reportPdf` with `{ filename, company: settings, title, period, orientation: 'portrait'|'landscape', columns: [{label, align, width}], rows: [{cells: string[], bold?, section?, grand?, ruleAbove?, indent?}], notes? }`.
  - **CRITICAL: never put "AccountFlow" or any product name in PDFs/CSVs/exports.** Company identity only (settings.businessName etc.).
- CSV: `downloadCSV(filename, headers: string[], rows: unknown[][])` from `../lib/files`. XLSX: `downloadXLSX(filename, sheets: [{name, headers, rows, widths?}])`.
- Print: put the report inside `<ReportShell>`; `<ExportButtons onPrint={() => window.print()} …/>` (default already prints). Print CSS hides nav/buttons.
- Formatting (`../lib/format`): fmtMoney (compact), fmtMoneyFull (full), fmtAcct (parentheses negatives), fmtNum, fmtDate, todayISO, round2, toNum, parseAmount.
- Toasts: `toast('…')` / `toast('…', 'error')` from `../lib/toast`.
- Every page: professional accounting look, right-aligned numbers, empty states, responsive (tables inside `.table-wrap`).
- Page component must be the **default export**.
- Filters on list/report pages must actually filter.

## Engine API (src/accounting/engine.ts)
- `ledgerForAccount(account, entries, from, to, excludeKinds?)` → `{ account, opening, rows: [{date, entryNo, reference, description, debit, credit, running}], totalDebit, totalCredit, closing }`
- `trialBalance(accounts, entries, asOf, { includeZero? })` → `{ rows: [{account, debit, credit}], totalDebit, totalCredit, diff, balanced }`
- `adjustedTrialBalance(accounts, entries, asOf, includeZero)` → `{ rows: [{account, unadjDebit, unadjCredit, adjDebit, adjCredit, debit, credit}], totalUnadjDebit, totalUnadjCredit, totalAdjDebit, totalAdjCredit, totalDebit, totalCredit, balanced }`
- `incomeStatement(accounts, entries, from, to)` → `{ revenue: [{account, amount}], totalRevenue, costOfSales, totalCostOfSales, grossProfit, expenses, totalExpenses, operatingProfit, otherIncome, totalOtherIncome, otherExpenses, totalOtherExpenses, profitBeforeTax, taxExpense, netProfit }`
- `balanceSheet(accounts, entries, asOf, fyStart)` → `{ currentAssets: [{account, amount}], totalCurrentAssets, nonCurrentAssets, totalNonCurrentAssets, totalAssets, equityLines: [{label, amount}], totalEquity, currentLiabilities, totalCurrentLiabilities, nonCurrentLiabilities, totalNonCurrentLiabilities, totalLiabilities, totalEquityAndLiabilities, balanced, diff }`
- `cashFlow(accounts, entries, from, to, fyStart)` → `{ netProfit, operatingAdjustments: [{label, amount}], netOperating, investing, netInvesting, financing, netFinancing, netChange, openingCash, closingCash, reconciled, diff }`
- `changesInEquity(accounts, entries, from, to, fyStart)` → `{ rows: [{label, opening, movement, closing}], totals: {opening, movement, closing} }`
- `subledger(entries, account, from, to)` → `[{contactId, opening, debit, credit, closing}]` (signed per account normal balance)
- `reconcileSubledger(rows, controlClosing)` → `{ subTotal, control, diff, reconciled }`
- `movementOf(account, sums)`, `sumPostings(entries, {from?, to?, kinds?, excludeKinds?, statuses?})`
- `accountTree(accounts)` → nodes `{...account, children, depth}`; `flatAccounts(accounts)` → `[{account, indent}]`; `accountLabel(a, showCode)`
- `entryTotals(entry)` → `{debit, credit, diff}`; `isDateLocked(periods, date)`; `dayBefore(iso)`
- `buildReversal(original, newEntryNo, date, makeId, now)` (used only via data.reverseJournalEntry)

## Types (src/accounting/types.ts)
Account `{id, code, name, type, subtype, parentId?, normalBalance, status: 'active'|'archived', postable, cashFlowClass, isControl?, controlKind?}`; JournalEntry `{id, entryNo, kind, date, reference, description, source?, memo?, lines: [{id, accountId, accountCode, description, debit, credit, contactId?, contactKind?}], status: 'draft'|'posted'|'reversed', ...}`; Customer/Vendor `{id, code, name, phone?, email?, address?, openingBalance, status}`; InventoryItem `{id, sku, name, unit, unitCost, quantity, reorderLevel, status}`; FixedAsset `{id, code, name, category, purchaseDate, cost, accumulatedDep, usefulLifeMonths, status}`; FiscalPeriod `{id, label, start, end, locked}`; AuditEvent `{id, at, action, record, actor, description}`; CompanySettings (see types.ts DEFAULT_SETTINGS).

## Conventions
- Dates are `YYYY-MM-DD` strings; compare lexicographically. Display with `fmtDate`.
- Money: `fmtMoneyFull(n)` in reports/tables; `fmtMoney(n)` for KPIs.
- `snap.settings.fiscalYearStart/End` for default ranges; `useDateRange(settings)` gives `{preset, setPreset, custom, setCustom, from, to}` + `<DateRangeControl …/>`.
- Journal form route: `/accounting/journal/new` with `location.state = { kind: 'adjustment' }` to preset kind; `/accounting/journal/:id` views an entry.
- After mutations the db `subscribe` auto-refreshes `snap` — no manual refresh needed.
