import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Landmark, Scale, PieChart, TrendingUp, TrendingDown, Wallet,
  Users, Truck, ArrowRight, Lock, FileCheck, AlertTriangle, Plus,
} from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Stat, Badge, Btn, EmptyState } from '../components/ui';
import { DemoBanner, EntryStatusBadge, LoadingCard } from '../components/acct';
import { resetDemoData } from '../accounting/data';
import {
  balanceSheet, incomeStatement, sumPostings, movementOf, trialBalance,
} from '../accounting/engine';
import { fmtMoney, fmtDate, todayISO } from '../lib/format';
import { toast } from '../lib/toast';

function BarChart({ data, format }: { data: { label: string; value: number; alt?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div>
      <div className="chart-bar" role="img" aria-label="Bar chart">
        {data.map((d, i) => (
          <div className="bar-col" key={i} title={`${d.label}: ${format(d.value)}`}>
            <div className={`bar${d.alt ? ' alt' : ''}`} style={{ height: `${Math.max(3, (Math.abs(d.value) / max) * 100)}%` }} />
            <span className="bar-lbl">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { snap, ready } = useAccounting();
  const nav = useNavigate();

  const m = useMemo(() => {
    if (!snap) return null;
    const { accounts, entries, settings } = snap;
    const fyStart = settings.fiscalYearStart;
    const asOf = settings.fiscalYearEnd < todayISO() ? settings.fiscalYearEnd : todayISO();
    const bs = balanceSheet(accounts, entries, asOf, fyStart);
    const is = incomeStatement(accounts, entries, fyStart, asOf);
    const tb = trialBalance(accounts, entries, asOf);
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const allToDate = sumPostings(entries, { to: asOf });
    const cash = ['1110', '1120'].reduce((t, c) => t + movementOf(byCode.get(c)!, allToDate), 0);
    const ar = movementOf(byCode.get('1130')!, allToDate);
    const ap = movementOf(byCode.get('2110')!, allToDate);
    // monthly revenue / expense / profit
    const months: { label: string; rev: number; exp: number; profit: number }[] = [];
    const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fyYear = Number(settings.fiscalYearStart.slice(0, 4));
    for (let i = 0; i < 12; i++) {
      const mm = String(i + 1).padStart(2, '0');
      const lastDay = new Date(fyYear, i + 1, 0).getDate();
      const mis = incomeStatement(accounts, entries, `${fyYear}-${mm}-01`, `${fyYear}-${mm}-${String(lastDay).padStart(2, '0')}`);
      months.push({ label: mNames[i], rev: mis.totalRevenue, exp: mis.totalCostOfSales + mis.totalExpenses + mis.totalOtherExpenses, profit: mis.netProfit });
    }
    // expense composition by subtype
    const expBy = new Map<string, number>();
    for (const l of is.expenses) {
      expBy.set(l.account.subtype, (expBy.get(l.account.subtype) || 0) + l.amount);
    }
    const expComp = [...expBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const drafts = entries.filter((e) => e.status === 'draft').length;
    const recent = entries.slice(-6).reverse();
    const locked = snap.periods.filter((p) => p.locked);
    return { bs, is, tb, cash, ar, ap, months, expComp, drafts, recent, locked, asOf };
  }, [snap]);

  if (!ready || !snap || !m) return <Page title="Dashboard"><LoadingCard /></Page>;

  const doReset = async () => {
    if (!window.confirm('Reset the demo company? All your changes will be replaced with the original demo dataset.')) return;
    await resetDemoData();
    toast('Demo data reset to the original dataset');
  };

  return (
    <Page
      title="Dashboard"
      subtitle={`${snap.settings.businessName} · as of ${fmtDate(m.asOf)}`}
      actions={<Btn variant="primary" icon={<Plus />} onClick={() => nav('/accounting/journal/new')}>New Journal Entry</Btn>}
    >
      <DemoBanner onReset={doReset} />

      {m.tb.balanced ? (
        <div className="rpt-ok no-print" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCheck style={{ width: 18, height: 18 }} /> Books balanced — trial balance reconciles as of {fmtDate(m.asOf)}.
        </div>
      ) : (
        <div className="rpt-flag no-print" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle style={{ width: 18, height: 18 }} /> Trial balance out of balance by {fmtMoney(m.tb.diff)}.
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Card><Stat label="Total Assets" value={fmtMoney(m.bs.totalAssets)} icon={<Landmark />} tone="navy" /></Card>
        <Card><Stat label="Total Liabilities" value={fmtMoney(m.bs.totalLiabilities)} icon={<Scale />} tone="red" /></Card>
        <Card><Stat label="Equity" value={fmtMoney(m.bs.totalEquity)} icon={<PieChart />} tone="blue" /></Card>
        <Card><Stat label="Net Profit (YTD)" value={fmtMoney(m.is.netProfit)} sub={`Revenue ${fmtMoney(m.is.totalRevenue)}`} icon={<TrendingUp />} tone="green" /></Card>
        <Card><Stat label="Cash & Bank" value={fmtMoney(m.cash)} icon={<Wallet />} tone="gold" /></Card>
        <Card><Stat label="Receivable (AR)" value={fmtMoney(m.ar)} icon={<Users />} tone="blue" /></Card>
        <Card><Stat label="Payable (AP)" value={fmtMoney(m.ap)} icon={<Truck />} tone="red" /></Card>
        <Card><Stat label="Unposted Entries" value={String(m.drafts)} sub={m.locked.length ? `${m.locked.length} period(s) locked` : 'No locked periods'} icon={m.locked.length ? <Lock /> : <FileCheck />} tone={m.drafts ? 'red' : 'green'} /></Card>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <Card title="Revenue vs Expenses — 2026" subtitle="Monthly trend">
          <BarChart data={m.months.map((x) => ({ label: x.label, value: x.rev }))} format={(n) => fmtMoney(n)} />
          <div className="muted small" style={{ marginTop: 8 }}>Revenue (navy) · Expenses shown below</div>
          <BarChart data={m.months.map((x) => ({ label: x.label, value: x.exp, alt: true }))} format={(n) => fmtMoney(n)} />
        </Card>
        <Card title="Net Profit — 2026" subtitle="Monthly profit trend">
          <BarChart data={m.months.map((x) => ({ label: x.label, value: x.profit, alt: x.profit < 0 }))} format={(n) => fmtMoney(n)} />
          <div className="divider" />
          <div className="muted small" style={{ marginBottom: 8 }}>Expense composition (YTD)</div>
          {m.expComp.map(([k, v]) => (
            <div className="kv" key={k}>
              <span className="k">{k}</span>
              <span className="v num">{fmtMoney(v)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Recent Journal Entries" actions={<Link to="/accounting/journal"><Btn size="sm" variant="ghost">View all <ArrowRight style={{ width: 15, height: 15 }} /></Btn></Link>}>
          {m.recent.length === 0 ? (
            <EmptyState title="No entries yet" text="Post your first journal entry to see it here." />
          ) : (
            <div className="list">
              {m.recent.map((e) => (
                <button key={e.id} className="list-row" onClick={() => nav(`/accounting/journal/${e.id}`)}>
                  <span className="lr-main">
                    <span className="lr-title">{e.entryNo} — {e.description.slice(0, 48)}</span>
                    <span className="lr-sub">{fmtDate(e.date)}{e.reference ? ` · ${e.reference}` : ''}</span>
                  </span>
                  <span className="lr-right"><EntryStatusBadge status={e.status} /></span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title="Accounting Health">
          <div className="kv"><span className="k">Trial balance status</span><span className="v">{m.tb.balanced ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Out of balance</Badge>}</span></div>
          <div className="kv"><span className="k">Unposted (draft) entries</span><span className="v num">{m.drafts}</span></div>
          <div className="kv"><span className="k">Locked periods</span><span className="v">{m.locked.length ? m.locked.map((p) => p.label).join(', ') : 'None'}</span></div>
          <div className="kv"><span className="k">Total journal entries</span><span className="v num">{snap.entries.length}</span></div>
          <div className="kv"><span className="k">Accounts in chart</span><span className="v num">{snap.accounts.filter((a) => a.postable).length}</span></div>
          <div className="kv"><span className="k">Fiscal year</span><span className="v num">{fmtDate(snap.settings.fiscalYearStart)} – {fmtDate(snap.settings.fiscalYearEnd)}</span></div>
        </Card>
      </div>
    </Page>
  );
}
