import type { PropsWithChildren } from 'react';
import type { Tone } from '../../data/mock-data';

interface StatusBadgeProps extends PropsWithChildren {
  tone?: Tone;
  dot?: boolean;
}

export function StatusBadge({ children, tone = 'neutral', dot = true }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${tone}`}>
      {dot ? <span className="status-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
