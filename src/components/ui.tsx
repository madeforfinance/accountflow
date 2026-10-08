/* Shared UI primitives — every screen builds with these. */
import React, { useEffect } from 'react';
import { X, Search } from 'lucide-react';

/* ---------- Page ---------- */
export function Page({ title, subtitle, actions, children, wide }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <div className={wide ? '' : ''}>{children}</div>
    </div>
  );
}

/* ---------- Card ---------- */
export function Card({ title, subtitle, actions, children, className = '', style }: {
  title?: string; subtitle?: string; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${className}`} style={style} aria-label={title}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <div className="spacer" />
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Buttons ---------- */
type BtnVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export function Btn({ variant = 'secondary', size, block, icon, children, ...rest }: {
  variant?: BtnVariant; size?: 'sm'; block?: boolean; icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${block ? ' btn-block' : ''}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconBtn({ label, children, ...rest }: {
  label: string; children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Forms ---------- */
export function Field({ label, hint, error, required, children }: {
  label?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <label>
          {label} {required && <span className="req" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export function TextInput({ invalid, ...rest }: InputProps) {
  return <input className={`input${invalid ? ' invalid' : ''}`} {...rest} />;
}
export function NumberInput(props: InputProps) {
  return <TextInput inputMode="decimal" {...props} />;
}
export function Select({ invalid, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={`select${invalid ? ' invalid' : ''}`} {...rest}>
      {children}
    </select>
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}
export function Switch({ label, ...rest }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="check-row" style={{ cursor: 'pointer' }}>
      <span className="switch">
        <input type="checkbox" {...rest} />
        <span className="track" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal / Confirm ---------- */
export function Modal({ open, onClose, title, children, actions, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; actions?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconBtn label="Close" onClick={onClose}><X /></IconBtn>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-foot">{actions}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      actions={
        <>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger-solid" onClick={onConfirm}>{confirmLabel}</Btn>
        </>
      }>
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

/* ---------- Display ---------- */
export function EmptyState({ icon, title, text, action }: {
  icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="e-ic">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = 'navy' }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' | 'blue';
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    navy: { bg: 'linear-gradient(135deg,#0B1F3A,#1d3a66)', fg: '#fff' },
    gold: { bg: 'linear-gradient(135deg,#D4AF37,#a8842a)', fg: '#1a1405' },
    green: { bg: '#e6f6ef', fg: '#12805c' },
    red: { bg: '#fef3f2', fg: '#d92d20' },
    blue: { bg: '#eff8ff', fg: '#175cd3' },
  };
  const t = tones[tone];
  return (
    <div className="stat-row">
      {icon && <div className="stat-ic" style={{ background: t.bg, color: t.fg }}>{icon}</div>}
      <div className="stat">
        <span className="stat-label">{label}</span>
        <span className="stat-value num">{value}</span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'gray', children }: {
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'gold'; children: React.ReactNode;
}) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`progress${pct >= 100 ? ' over' : ''}`} role="progressbar"
      aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: {
  tabs: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value}
          className={value === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Search style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 17, height: 17, color: 'var(--muted)' }} />
      <input className="input" style={{ paddingLeft: 40 }} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Chip({ active, children, onClick }: {
  active?: boolean; children: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button type="button" className={`chip${active ? ' active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Skeleton({ h = 18 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} />;
}
