import type { LucideIcon } from 'lucide-react';
import type { Tone } from '../../data/mock-data';

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: string;
}

export function StatCard({ label, value, detail, icon: Icon, tone = 'primary', trend }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-${tone}`}><Icon size={19} aria-hidden="true" /></div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {trend ? <span className={`stat-trend stat-${tone}`}>{trend}</span> : null}
    </article>
  );
}
