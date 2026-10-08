/* Centralized accounting state — one snapshot, every screen derives from it.
   The journal is the source of truth; all reports are computed, never stored. */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccountingSnapshot, ensureSeeded, loadSnapshot } from '../accounting/data';
import { subscribe } from '../storage/db';

interface AcctCtx {
  snap: AccountingSnapshot | null;
  ready: boolean;
  seeding: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AcctCtx>({ snap: null, ready: false, seeding: true, refresh: async () => {} });
export const useAccounting = () => useContext(Ctx);

export function AccountingProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<AccountingSnapshot | null>(null);
  const [seeding, setSeeding] = useState(true);

  const refresh = async () => {
    const s = await loadSnapshot();
    setSnap(s);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureSeeded();
      } catch (e) {
        console.error('Seeding failed', e);
      }
      if (!alive) return;
      setSeeding(false);
      await refresh().catch((e) => console.error('Load failed', e));
    })();
    const unsub = subscribe(() => {
      refresh().catch(() => {});
    });
    return () => { alive = false; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ snap, ready: !!snap, seeding, refresh }), [snap, seeding]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
