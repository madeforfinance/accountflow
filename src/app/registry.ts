/* Central route registry — every page registers here. */
import React from 'react';

export interface RouteDef {
  path: string;
  element: React.LazyExoticComponent<React.ComponentType<any>>;
}

const lazy = (p: () => Promise<any>) => React.lazy(p);

export const ALL_ROUTES: RouteDef[] = [
  { path: '/accounting/journal', element: lazy(() => import('../pages/JournalPage')) },
  { path: '/accounting/journal/new', element: lazy(() => import('../pages/JournalFormPage')) },
  { path: '/accounting/journal/:id', element: lazy(() => import('../pages/JournalFormPage')) },
  { path: '/accounting/general-ledger', element: lazy(() => import('../pages/GeneralLedgerPage')) },
  { path: '/accounting/ledger', element: lazy(() => import('../pages/AccountLedgerPage')) },
  { path: '/accounting/trial-balance', element: lazy(() => import('../pages/TrialBalancePage')) },
  { path: '/accounting/adjusted-trial-balance', element: lazy(() => import('../pages/AdjustedTBPage')) },
  { path: '/accounting/adjustments', element: lazy(() => import('../pages/AdjustmentsPage')) },
  { path: '/reports/income-statement', element: lazy(() => import('../pages/IncomeStatementPage')) },
  { path: '/reports/balance-sheet', element: lazy(() => import('../pages/BalanceSheetPage')) },
  { path: '/reports/cash-flow', element: lazy(() => import('../pages/CashFlowPage')) },
  { path: '/reports/changes-in-equity', element: lazy(() => import('../pages/ChangesInEquityPage')) },
  { path: '/accounts/chart-of-accounts', element: lazy(() => import('../pages/ChartOfAccountsPage')) },
  { path: '/accounts/customers', element: lazy(() => import('../pages/CustomersPage')) },
  { path: '/accounts/vendors', element: lazy(() => import('../pages/VendorsPage')) },
  { path: '/accounts/inventory', element: lazy(() => import('../pages/InventoryPage')) },
  { path: '/accounts/fixed-assets', element: lazy(() => import('../pages/FixedAssetsPage')) },
  { path: '/reports/export-center', element: lazy(() => import('../pages/ExportCenterPage')) },
  { path: '/reports/import', element: lazy(() => import('../pages/ImportPage')) },
  { path: '/audit-log', element: lazy(() => import('../pages/AuditLogPage')) },
  { path: '/settings', element: lazy(() => import('../pages/SettingsPage')) },
];

const Dashboard = lazy(() => import('../pages/Dashboard'));
const NotFound = lazy(() => import('../pages/NotFound'));
export const CORE_ROUTES: RouteDef[] = [
  { path: '/', element: Dashboard },
  { path: '/404', element: NotFound },
];
