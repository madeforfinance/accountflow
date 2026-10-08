/* Company settings provider — theme, currency formatting, document prefs. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CompanySettings, DEFAULT_SETTINGS } from '../accounting/types';
import { loadSettings, saveSettings } from '../accounting/data';
import { configureFormat } from '../lib/format';

interface SettingsCtx {
  settings: CompanySettings;
  ready: boolean;
  update: (p: Partial<CompanySettings>) => Promise<void>;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  update: async () => {},
});
export const useSettings = () => useContext(Ctx);

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0B1220' : '#10233f');
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await loadSettings();
        if (!alive) return;
        setSettings(s);
        applyTheme(s.theme);
        configureFormat({ symbol: s.currencySymbol, code: s.baseCurrency, decimals: s.decimalPlaces });
      } catch {
        /* defaults stand */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const update = async (p: Partial<CompanySettings>) => {
    const next = await saveSettings(p);
    setSettings(next);
    if (p.theme) applyTheme(next.theme);
    configureFormat({ symbol: next.currencySymbol, code: next.baseCurrency, decimals: next.decimalPlaces });
  };

  return <Ctx.Provider value={{ settings, ready, update }}>{children}</Ctx.Provider>;
}
