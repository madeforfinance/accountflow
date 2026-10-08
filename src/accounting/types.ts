/* Accounting domain model — the journal is the source of truth. Everything else
   (ledger, trial balance, statements) is derived from posted journal entries. */

export type AccountType =
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Revenue'
  | 'CostOfSales'
  | 'Expense'
  | 'OtherIncome'
  | 'OtherExpense';

export type NormalBalance = 'debit' | 'credit';

export type CashFlowClass = 'operating' | 'investing' | 'financing' | null;

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  parentId?: string;
  normalBalance: NormalBalance;
  status: 'active' | 'archived';
  postable: boolean;
  description?: string;
  /** classification used by the indirect cash-flow statement */
  cashFlowClass: CashFlowClass;
  /** true for AR / AP control accounts that must reconcile to subledgers */
  isControl?: boolean;
  controlKind?: 'AR' | 'AP';
  /** non-cash expense added back in operating cash flow (depreciation, bad debts…) */
  nonCash?: boolean;
}

export type EntryStatus = 'draft' | 'posted' | 'reversed';

export type EntryKind =
  | 'general'
  | 'sales'
  | 'purchase'
  | 'cash-receipt'
  | 'cash-payment'
  | 'bank-receipt'
  | 'bank-payment'
  | 'payroll'
  | 'expense'
  | 'depreciation'
  | 'inventory'
  | 'adjustment'
  | 'opening'
  | 'closing';

export const ENTRY_KINDS: { value: EntryKind; label: string }[] = [
  { value: 'general', label: 'General Journal' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'cash-receipt', label: 'Cash Receipt' },
  { value: 'cash-payment', label: 'Cash Payment' },
  { value: 'bank-receipt', label: 'Bank Receipt' },
  { value: 'bank-payment', label: 'Bank Payment' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'expense', label: 'Expense' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'opening', label: 'Opening Balance' },
  { value: 'closing', label: 'Closing Entry' },
];

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  contactId?: string;
  contactKind?: 'customer' | 'vendor';
  project?: string;
}

export interface JournalEntry {
  id: string;
  entryNo: string;
  kind: EntryKind;
  date: string; // YYYY-MM-DD
  reference: string;
  description: string;
  source?: string;
  memo?: string;
  lines: JournalLine[];
  status: EntryStatus;
  reversedBy?: string;
  reverses?: string;
  currency: string;
  exchangeRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  openingBalance: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  openingBalance: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  quantity: number;
  reorderLevel: number;
  status: 'active' | 'inactive';
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost: number;
  accumulatedDep: number;
  usefulLifeMonths: number;
  depAccountId: string;
  accDepAccountId: string;
  status: 'active' | 'disposed';
}

export interface FiscalPeriod {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  locked: boolean;
}

export interface AuditEvent {
  id: string;
  at: string; // ISO
  action: string;
  record: string;
  actor: string;
  description: string;
}

export interface CompanySettings {
  businessName: string;
  legalName: string;
  regNumber: string;
  taxNumber: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  baseCurrency: string;
  currencySymbol: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  decimalPlaces: number;
  accountingBasis: 'accrual' | 'cash';
  numberFormat: 'en-PK' | 'en-US';
  jePrefix: string;
  invPrefix: string;
  billPrefix: string;
  rcptPrefix: string;
  payPrefix: string;
  arControlAccount: string;
  apControlAccount: string;
  retainedEarningsAccount: string;
  currentYearProfitAccount: string;
  cashAccount: string;
  bankAccount: string;
  showAccountCodes: boolean;
  showZeroBalances: boolean;
  comparativePeriods: boolean;
  negativeStyle: 'parentheses' | 'minus';
  logo?: string;
  docFooter: string;
  theme: 'light' | 'dark';
  demoSeeded: boolean;
}

export const DEFAULT_SETTINGS: CompanySettings = {
  businessName: 'PakTech Trading (Pvt.) Ltd.',
  legalName: 'PakTech Trading (Private) Limited',
  regNumber: 'NTN 1234567-8',
  taxNumber: 'STRN 03-77-9999-001-28',
  address: '2nd Floor, Al-Rehman Plaza, Blue Area',
  city: 'Islamabad',
  country: 'Pakistan',
  phone: '+92 51 111 222 333',
  email: 'accounts@paktechtrading.example.pk',
  website: 'www.paktechtrading.example.pk',
  baseCurrency: 'PKR',
  currencySymbol: 'Rs.',
  fiscalYearStart: '2026-01-01',
  fiscalYearEnd: '2026-12-31',
  decimalPlaces: 2,
  accountingBasis: 'accrual',
  numberFormat: 'en-PK',
  jePrefix: 'JE-',
  invPrefix: 'INV-',
  billPrefix: 'BILL-',
  rcptPrefix: 'RCPT-',
  payPrefix: 'PAY-',
  arControlAccount: '1130',
  apControlAccount: '2110',
  retainedEarningsAccount: '3200',
  currentYearProfitAccount: '3300',
  cashAccount: '1110',
  bankAccount: '1120',
  showAccountCodes: true,
  showZeroBalances: false,
  comparativePeriods: false,
  negativeStyle: 'parentheses',
  docFooter: 'This is a computer-generated document.',
  theme: 'light',
  demoSeeded: false,
};
