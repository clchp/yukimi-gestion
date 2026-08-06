import type { PropsWithChildren } from 'react';
import type { Tone } from '../../data/mock-data';

interface StatusBadgeProps extends PropsWithChildren {
  tone?: Tone;
  dot?: boolean;
}

export function StatusBadge({ children, tone = 'neutral', dot = true }: StatusBadgeProps) {
  const label = typeof children === 'string' ? children : undefined;

  return (
    <span className={`status-badge status-${tone}`} data-label={label}>
      {dot ? <span className="status-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
