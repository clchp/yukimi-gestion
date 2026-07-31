import { Filter, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface FilterPanelProps {
  open: boolean;
  activeCount: number;
  title?: string;
  description?: string;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  children: ReactNode;
}

export function FilterButton({
  activeCount,
  onClick,
  label = 'Filtros',
}: {
  activeCount: number;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`button button-secondary filter-button ${activeCount > 0 ? 'filter-button-active' : ''}`}
      onClick={onClick}
      aria-label={`${label}${activeCount > 0 ? `, ${activeCount} activos` : ''}`}
    >
      <Filter size={17} />
      {label}
      {activeCount > 0 ? <span className="filter-count">{activeCount}</span> : null}
    </button>
  );
}

export function FilterPanel({
  open,
  activeCount,
  title = 'Filtrar resultados',
  description = 'Combina los filtros necesarios y aplícalos a la lista actual.',
  onClose,
  onApply,
  onClear,
  children,
}: FilterPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="filter-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="filter-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="filter-panel-header">
          <div>
            <span className="eyebrow">
              <SlidersHorizontal size={14} /> Filtros
            </span>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar filtros"
          >
            <X size={20} />
          </button>
        </header>
        <div className="filter-panel-body">{children}</div>
        <footer className="filter-panel-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            <RotateCcw size={16} /> Limpiar filtros
          </button>
          <button type="button" className="button button-primary" onClick={onApply}>
            Aplicar filtros
          </button>
        </footer>
      </div>
    </div>
  );
}
