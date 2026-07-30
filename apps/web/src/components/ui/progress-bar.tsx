interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  return (
    <div className="progress-wrap" aria-label={label ?? `${value}% completado`}>
      <div className="progress-track">
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      {label ? <small>{label}</small> : null}
    </div>
  );
}
