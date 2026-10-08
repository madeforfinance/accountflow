import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, BookMarked, NotebookPen, Scale, SlidersHorizontal,
  FileText, Landmark, Droplets, PieChart, Users, Truck, Package, Building2,
  Download, Upload, ScrollText, Settings as SettingsIcon, Search, Moon, Sun,
  Plus, FlaskConical, X,
} from 'lucide-react';
import { useAccounting } from './accounting';
import { useSettings } from './settings';
import { Modal, SearchInput, Badge } from '../components/ui';
import { accountLabel } from '../accounting/engine';

interface NavEntry { label: string; path: string; icon: React.ReactNode; end?: boolean }

const NAV: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/', icon: <LayoutDashboard />, end: true }],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Journal', path: '/accounting/journal', icon: <BookOpen /> },
      { label: 'General Ledger', path: '/accounting/general-ledger', icon: <BookMarked /> },
      { label: 'Account Ledgers', path: '/accounting/ledger', icon: <NotebookPen /> },
      { label: 'Trial Balance', path: '/accounting/trial-balance', icon: <Scale /> },
      { label: 'Adjustments', path: '/accounting/adjustments', icon: <SlidersHorizontal /> },
    ],
  },
  {
    label: 'Financial Statements',
    items: [
      { label: 'Income Statement', path: '/reports/income-statement', icon: <FileText /> },
      { label: 'Balance Sheet', path: '/reports/balance-sheet', icon: <Landmark /> },
      { label: 'Cash Flow', path: '/reports/cash-flow', icon: <Droplets /> },
      { label: 'Changes in Equity', path: '/reports/changes-in-equity', icon: <PieChart /> },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Chart of Accounts', path: '/accounts/chart-of-accounts', icon: <BookMarked /> },
      { label: 'Customers', path: '/accounts/customers', icon: <Users /> },
      { label: 'Vendors', path: '/accounts/vendors', icon: <Truck /> },
      { label: 'Inventory', path: '/accounts/inventory', icon: <Package /> },
      { label: 'Fixed Assets', path: '/accounts/fixed-assets', icon: <Building2 /> },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Export Center', path: '/reports/export-center', icon: <Download /> },
      { label: 'Import Data', path: '/reports/import', icon: <Upload /> },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Log', path: '/audit-log', icon: <ScrollText /> },
      { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
    ],
  },
];

const BOTTOM_NAV: NavEntry[] = [
  { label: 'Home', path: '/', icon: <LayoutDashboard />, end: true },
  { label: 'Journal', path: '/accounting/journal', icon: <BookOpen /> },
  { label: 'Reports', path: '/reports/income-statement', icon: <FileText /> },
  { label: 'More', path: '/settings', icon: <SettingsIcon /> },
];

/* ---------------- global search ---------------- */
interface Hit { title: string; sub: string; path: string; kind: string }

function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { snap } = useAccounting();
  const nav = useNavigate();
  const hits = useMemo<Hit[]>(() => {
    if (!snap || q.trim().length < 2) return [];
    const needle = q.trim().toLowerCase();
    const out: Hit[] = [];
    const push = (h: Hit) => { if (out.length < 25) out.push(h); };
    for (const a of snap.accounts) {
      if (!a.postable) continue;
      if (`${a.code} ${a.name}`.toLowerCase().includes(needle)) {
        push({ title: accountLabel(a, true), sub: `${a.type} · ${a.normalBalance}`, path: `/accounting/ledger?account=${a.id}`, kind: 'Account' });
      }
    }
    for (const e of snap.entries.slice().reverse()) {
      if (`${e.entryNo} ${e.reference} ${e.description}`.toLowerCase().includes(needle)) {
        push({ title: `${e.entryNo} — ${e.description.slice(0, 42)}`, sub: `${e.date} · ${e.status}`, path: `/accounting/journal/${e.id}`, kind: 'Journal' });
      }
      if (out.length >= 25) break;
    }
    for (const c of snap.customers) {
      if (`${c.code} ${c.name}`.toLowerCase().includes(needle)) push({ title: c.name, sub: c.code, path: '/accounts/customers', kind: 'Customer' });
    }
    for (const v of snap.vendors) {
      if (`${v.code} ${v.name}`.toLowerCase().includes(needle)) push({ title: v.name, sub: v.code, path: '/accounts/vendors', kind: 'Vendor' });
    }
    return out;
  }, [q, snap]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open ]);

  return (
    <Modal open={open} onClose={onClose} title="Search">
      <SearchInput value={q} onChange={setQ} placeholder="Account code, journal no., customer…" />
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', maxHeight: 360, overflowY: 'auto' }}>
        {q.trim().length >= 2 && hits.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', padding: 20 }}>No results for &ldquo;{q}&rdquo;.</p>
        )}
        {hits.map((h, i) => (
          <button key={i} className="list-row" onClick={() => { onClose(); nav(h.path); }}>
            <span className="lr-main">
              <span className="lr-title">{h.title}</span>
              <span className="lr-sub">{h.sub}</span>
            </span>
            <span className="lr-right"><Badge tone="gray">{h.kind}</Badge></span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- shell ---------------- */
export function Shell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { settings, update } = useSettings();
  const { snap, seeding } = useAccounting();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleTheme = () => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' });

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-block">
          <img src="/favicon.svg" alt="AccountFlow" />
          <div className="brand-text">
            <div className="brand-name">AccountFlow</div>
            <div className="brand-sub">Double-entry <b>accounting</b></div>
          </div>
        </div>
        <nav className="nav-scroll">
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.items.map((it) => (
                <NavLink key={it.path} to={it.path} end={it.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  {it.icon}
                  <span className="lbl">{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <img src="/favicon.svg" alt="AccountFlow" />
            <div>
              <div className="mb-name">AccountFlow</div>
            </div>
          </div>
          <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search style={{ width: 17, height: 17 }} />
            <span className="st-text">Search accounts, journals, customers…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            {snap?.settings.demoSeeded && (
              <Badge tone="gold"><FlaskConical style={{ width: 13, height: 13 }} /> Demo Company</Badge>
            )}
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {settings.theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button className="icon-btn" onClick={() => nav('/accounting/journal/new')} aria-label="New journal entry" title="New journal entry">
              <Plus />
            </button>
          </div>
        </header>

        <main className="content wide">
          {seeding ? (
            <div className="card"><p className="muted">Preparing your accounting workspace…</p></div>
          ) : (
            <React.Suspense fallback={<div className="card"><p className="muted">Loading…</p></div>}>
              <Outlet />
            </React.Suspense>
          )}
        </main>

        <nav className="bottom-nav" aria-label="Primary">
          <div className="bn-grid">
            {BOTTOM_NAV.slice(0, 2).map((it) => (
              <NavLink key={it.path} to={it.path} end={it.end} className={({ isActive }) => `bn-item${isActive ? ' active' : ''}`}>
                {it.icon}<span>{it.label}</span>
              </NavLink>
            ))}
            <div className="bn-item bn-add">
              <button className="fab-mini" onClick={() => nav('/accounting/journal/new')} aria-label="New journal entry">
                <Plus />
              </button>
              <span>New</span>
            </div>
            {BOTTOM_NAV.slice(2).map((it) => (
              <NavLink key={it.path} to={it.path} end={it.end} className={({ isActive }) => `bn-item${isActive ? ' active' : ''}`}>
                {it.icon}<span>{it.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button className="icon-btn" onClick={onClose} aria-label="Close">
      <X />
    </button>
  );
}

export { useLocation as useShellLocation };
