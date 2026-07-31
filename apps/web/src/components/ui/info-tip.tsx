import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function InfoTip({
  label,
  children,
  placement = 'bottom',
}: {
  label: string;
  children: ReactNode;
  placement?: 'bottom' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={`info-tip info-tip-${placement}`}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <Info size={15} />
      </button>
      {open ? (
        <span id={id} className="info-tip-content" role="note">
          {children}
        </span>
      ) : null}
    </span>
  );
}

export function ContextNote({
  children,
  tone = 'info',
  title,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
}) {
  return (
    <div className={`context-note context-note-${tone}`} role="note">
      <Info size={18} aria-hidden="true" />
      <div>
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
    </div>
  );
}
