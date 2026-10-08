import React, { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useAccounting } from '../app/accounting';
import { Page, Card, Btn, Badge, EmptyState, SearchInput, Field, Select } from '../components/ui';
import { LoadingCard } from '../components/acct';
import { downloadCSV } from '../lib/files';
import { fmtDate, todayISO } from '../lib/format';
import { toast } from '../lib/toast';

function humanize(action: string): string {
  return action
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function toneFor(action: string): 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'gold' {
  if (/delete|reverse/.test(action)) return 'red';
  if (/lock/.test(action)) return 'amber';
  if (/post|created|seed|import/.test(action)) return 'green';
  if (/unlock|export/.test(action)) return 'blue';
  return 'gray';
}

export default function AuditLogPage() {
  const { snap } = useAccounting();
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');

  const actions = useMemo(() => {
    if (!snap) return [];
    return Array.from(new Set(snap.audit.map((a) => a.action))).sort();
  }, [snap]);

  const filtered = useMemo(() => {
    if (!snap) return [];
    const needle = q.trim().toLowerCase();
    return snap.audit.filter((a) => {
      if (action && a.action !== action) return false;
      if (needle && !`${a.record} ${a.actor} ${a.description} ${humanize(a.action)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [snap, action, q]);

  if (!snap) return <Page title="Audit Log"><LoadingCard /></Page>;

  const doExportCsv = () => {
    const head = ['Date', 'Time', 'Action', 'Record', 'Actor', 'Description'];
    const body = filtered.map((a) => [a.at.slice(0, 10), a.at.slice(11, 16), humanize(a.action), a.record, a.actor, a.description]);
    downloadCSV(`audit-log-${todayISO()}.csv`, head, body);
    toast('Audit log exported to CSV');
  };

  return (
    <Page
      title="Audit Log"
      subtitle={`${filtered.length} ${filtered.length === 1 ? 'event' : 'events'} · newest first`}
      actions={<Btn size="sm" icon={<FileDown size={15} />} onClick={doExportCsv}>Export CSV</Btn>}
    >
      <Card>
        <div className="filter-bar">
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search record, actor, description…" />
          </div>
          <Field label="Action">
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
            </Select>
          </Field>
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No audit events" text="Nothing matches the current filters." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Actor</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.at.slice(0, 10))}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{a.at.slice(11, 16)}</td>
                    <td><Badge tone={toneFor(a.action)}>{humanize(a.action)}</Badge></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.record}</td>
                    <td>{a.actor}</td>
                    <td>{a.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
