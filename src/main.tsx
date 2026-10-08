import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SettingsProvider } from './app/settings';
import { AccountingProvider } from './app/accounting';
import { Shell } from './app/shell';
import { ALL_ROUTES, CORE_ROUTES } from './app/registry';
import { Toaster } from './lib/toast';
import './styles/app.css';

function App() {
  return (
    <SettingsProvider>
      <AccountingProvider>
        <BrowserRouter>
          <Toaster />
          <Routes>
            <Route element={<Shell />}>
              {CORE_ROUTES.map((r) => (
                <Route key={r.path} path={r.path} element={<r.element />} />
              ))}
              {ALL_ROUTES.map((r) => (
                <Route key={r.path} path={r.path} element={<r.element />} />
              ))}
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AccountingProvider>
    </SettingsProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline-first: register the service worker so the app works without network after load.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
