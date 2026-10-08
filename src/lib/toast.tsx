/* Minimal toast system — no external deps. */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let pushFn: ((kind: ToastKind, message: string) => void) | null = null;

export function toast(message: string, kind: ToastKind = 'success') {
  if (pushFn) pushFn(kind, message);
  else console.log(`[toast:${kind}]`, message);
}

let nextId = 1;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
    };
  }, [push ]);

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'success' ? 'success' : t.kind === 'error' ? 'error' : ''}`}>
          {t.kind === 'success' ? <CheckCircle2 /> : t.kind === 'error' ? <AlertTriangle /> : <Info />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
