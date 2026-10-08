/* Seed chart of accounts — headers are not postable. */
import { Account } from './types';

interface SeedDef {
  code: string;
  name: string;
  type: Account['type'];
  subtype: string;
  parent?: string;
  postable?: boolean;
  cashFlowClass?: Account['cashFlowClass'];
  isControl?: boolean;
  controlKind?: 'AR' | 'AP';
  nonCash?: boolean;
  description?: string;
}

const DEFS: SeedDef[] = [
  // ---- Assets ----
  { code: '1000', name: 'Assets', type: 'Asset', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '1100', name: 'Current Assets', type: 'Asset', subtype: 'Header', parent: '1000', postable: false, cashFlowClass: null },
  { code: '1110', name: 'Cash', type: 'Asset', subtype: 'Cash & Bank', parent: '1100', cashFlowClass: null },
  { code: '1120', name: 'Bank', type: 'Asset', subtype: 'Cash & Bank', parent: '1100', cashFlowClass: null },
  { code: '1130', name: 'Accounts Receivable', type: 'Asset', subtype: 'Receivables', parent: '1100', cashFlowClass: 'operating', isControl: true, controlKind: 'AR' },
  { code: '1140', name: 'Inventory', type: 'Asset', subtype: 'Inventory', parent: '1100', cashFlowClass: 'operating' },
  { code: '1150', name: 'Prepaid Expenses', type: 'Asset', subtype: 'Prepayments', parent: '1100', cashFlowClass: 'operating' },
  { code: '1160', name: 'Advances to Suppliers', type: 'Asset', subtype: 'Receivables', parent: '1100', cashFlowClass: 'operating' },
  { code: '1170', name: 'Other Current Assets', type: 'Asset', subtype: 'Other', parent: '1100', cashFlowClass: 'operating' },
  { code: '1200', name: 'Non-Current Assets', type: 'Asset', subtype: 'Header', parent: '1000', postable: false, cashFlowClass: null },
  { code: '1210', name: 'Property, Plant & Equipment', type: 'Asset', subtype: 'Fixed Assets', parent: '1200', cashFlowClass: 'investing' },
  { code: '1220', name: 'Accumulated Depreciation', type: 'Asset', subtype: 'Fixed Assets', parent: '1200', cashFlowClass: 'investing' },
  { code: '1230', name: 'Intangible Assets', type: 'Asset', subtype: 'Intangibles', parent: '1200', cashFlowClass: 'investing' },

  // ---- Liabilities ----
  { code: '2000', name: 'Liabilities', type: 'Liability', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '2100', name: 'Current Liabilities', type: 'Liability', subtype: 'Header', parent: '2000', postable: false, cashFlowClass: null },
  { code: '2110', name: 'Accounts Payable', type: 'Liability', subtype: 'Payables', parent: '2100', cashFlowClass: 'operating', isControl: true, controlKind: 'AP' },
  { code: '2120', name: 'Accrued Expenses', type: 'Liability', subtype: 'Accruals', parent: '2100', cashFlowClass: 'operating' },
  { code: '2130', name: 'Taxes Payable', type: 'Liability', subtype: 'Tax', parent: '2100', cashFlowClass: 'operating' },
  { code: '2140', name: 'Unearned Revenue', type: 'Liability', subtype: 'Deferred Revenue', parent: '2100', cashFlowClass: 'operating' },
  { code: '2150', name: 'Short-Term Loan', type: 'Liability', subtype: 'Borrowings', parent: '2100', cashFlowClass: 'financing' },
  { code: '2200', name: 'Non-Current Liabilities', type: 'Liability', subtype: 'Header', parent: '2000', postable: false, cashFlowClass: null },
  { code: '2210', name: 'Long-Term Loan', type: 'Liability', subtype: 'Borrowings', parent: '2200', cashFlowClass: 'financing' },

  // ---- Equity ----
  { code: '3000', name: 'Equity', type: 'Equity', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '3100', name: 'Share Capital', type: 'Equity', subtype: 'Capital', parent: '3000', cashFlowClass: 'financing' },
  { code: '3200', name: 'Retained Earnings', type: 'Equity', subtype: 'Reserves', parent: '3000', cashFlowClass: null },
  { code: '3300', name: 'Current Year Profit', type: 'Equity', subtype: 'Reserves', parent: '3000', cashFlowClass: null },
  { code: '3400', name: "Owner's Drawings", type: 'Equity', subtype: 'Drawings', parent: '3000', cashFlowClass: 'financing' },

  // ---- Revenue ----
  { code: '4000', name: 'Revenue', type: 'Revenue', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '4100', name: 'Sales Revenue', type: 'Revenue', subtype: 'Sales', parent: '4000' },
  { code: '4110', name: 'Sales Returns & Allowances', type: 'Revenue', subtype: 'Sales', parent: '4000' },
  { code: '4120', name: 'Sales Discounts', type: 'Revenue', subtype: 'Sales', parent: '4000' },
  { code: '4200', name: 'Service Revenue', type: 'Revenue', subtype: 'Services', parent: '4000' },
  { code: '4300', name: 'Other Operating Revenue', type: 'Revenue', subtype: 'Other', parent: '4000' },

  // ---- Cost of Sales ----
  { code: '5000', name: 'Cost of Sales', type: 'CostOfSales', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '5100', name: 'Cost of Goods Sold', type: 'CostOfSales', subtype: 'COGS', parent: '5000' },

  // ---- Expenses ----
  { code: '6000', name: 'Operating Expenses', type: 'Expense', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '6100', name: 'Salaries & Wages', type: 'Expense', subtype: 'Staff Costs', parent: '6000' },
  { code: '6200', name: 'Rent', type: 'Expense', subtype: 'Premises', parent: '6000' },
  { code: '6300', name: 'Utilities', type: 'Expense', subtype: 'Premises', parent: '6000' },
  { code: '6400', name: 'Marketing & Advertising', type: 'Expense', subtype: 'Selling', parent: '6000' },
  { code: '6500', name: 'Depreciation', type: 'Expense', subtype: 'Non-Cash', parent: '6000', nonCash: true },
  { code: '6600', name: 'Insurance', type: 'Expense', subtype: 'Premises', parent: '6000' },
  { code: '6700', name: 'Office Expenses', type: 'Expense', subtype: 'Administration', parent: '6000' },
  { code: '6800', name: 'Professional Fees', type: 'Expense', subtype: 'Administration', parent: '6000' },
  { code: '6900', name: 'Other Expenses', type: 'Expense', subtype: 'Administration', parent: '6000' },
  { code: '6910', name: 'Bank Charges', type: 'Expense', subtype: 'Finance', parent: '6000' },
  { code: '6920', name: 'Fuel & Vehicle Running', type: 'Expense', subtype: 'Transport', parent: '6000' },
  { code: '6930', name: 'Repairs & Maintenance', type: 'Expense', subtype: 'Premises', parent: '6000' },
  { code: '6940', name: 'Telephone & Internet', type: 'Expense', subtype: 'Administration', parent: '6000' },

  // ---- Other Income / Expenses ----
  { code: '7000', name: 'Other Income', type: 'OtherIncome', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '7100', name: 'Interest Income', type: 'OtherIncome', subtype: 'Finance', parent: '7000' },
  { code: '7200', name: 'Gain on Disposal of Assets', type: 'OtherIncome', subtype: 'Non-Operating', parent: '7000' },
  { code: '8000', name: 'Other Expenses', type: 'OtherExpense', subtype: 'Header', postable: false, cashFlowClass: null },
  { code: '8100', name: 'Interest Expense', type: 'OtherExpense', subtype: 'Finance', parent: '8000' },
  { code: '8200', name: 'Bad Debt Expense', type: 'OtherExpense', subtype: 'Non-Cash', parent: '8000', description: 'Write-offs against receivables are absorbed by the AR working-capital movement in cash flow (not added back — that would double-count).' },
  { code: '8300', name: 'Loss on Disposal of Assets', type: 'OtherExpense', subtype: 'Non-Operating', parent: '8000' },
  { code: '8400', name: 'Income Tax Expense', type: 'OtherExpense', subtype: 'Tax', parent: '8000' },
];

const NORMAL: Record<Account['type'], 'debit' | 'credit'> = {
  Asset: 'debit',
  Expense: 'debit',
  CostOfSales: 'debit',
  OtherExpense: 'debit',
  Liability: 'credit',
  Equity: 'credit',
  Revenue: 'credit',
  OtherIncome: 'credit',
};

/** Contra accounts keep a debit normal balance even under a credit type. */
const CONTRA_DEBIT = new Set(['4110', '4120', '1220', '3400']);

export function seedChartOfAccounts(): Account[] {
  const byCode = new Map<string, string>();
  const accounts: Account[] = DEFS.map((d) => {
    const id = `acc_${d.code}`;
    byCode.set(d.code, id);
    const normalBalance = CONTRA_DEBIT.has(d.code) ? 'debit' : NORMAL[d.type];
    return {
      id,
      code: d.code,
      name: d.name,
      type: d.type,
      subtype: d.subtype,
      parentId: d.parent ? `acc_${d.parent}` : undefined,
      normalBalance,
      status: 'active',
      postable: d.postable !== false,
      description: d.description,
      cashFlowClass: d.cashFlowClass ?? null,
      isControl: d.isControl,
      controlKind: d.controlKind,
      nonCash: d.nonCash,
    };
  });
  return accounts;
}

/** Signed balance helper: positive means "in the account's normal direction". */
export function signedBalance(account: Account, debits: number, credits: number): number {
  return account.normalBalance === 'debit' ? debits - credits : credits - debits;
}

/** Display side for trial balance columns. */
export function tbSide(account: Account, debits: number, credits: number): { debit: number; credit: number } {
  const net = signedBalance(account, debits, credits);
  if (account.normalBalance === 'debit') {
    return net >= 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
  }
  return net >= 0 ? { debit: 0, credit: net } : { debit: -net, credit: 0 };
}
