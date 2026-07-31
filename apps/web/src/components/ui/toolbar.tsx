import { Columns3, Search, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  searchAriaLabel?: string;
  showFilterButton?: boolean;
  onFilterClick?: () => void;
  filterCount?: number;
  showColumnButton?: boolean;
  onColumnsClick?: () => void;
  columnsDisabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Toolbar({
  placeholder = 'Buscar…',
  value = '',
  onChange,
  searchAriaLabel = 'Buscar',
  showFilterButton = true,
  onFilterClick,
  filterCount = 0,
  showColumnButton = false,
  onColumnsClick,
  columnsDisabled = false,
  className,
  children,
}: ToolbarProps) {
  return (
    <div className={`table-toolbar ${className ?? ''}`.trim()}>
      <label className="toolbar-search">
        <Search size={18} />
        <input
          aria-label={searchAriaLabel}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      </label>
      <div className="toolbar-actions">
        {children}
        {showFilterButton && onFilterClick ? (
          <button
            className="button button-secondary button-compact"
            type="button"
            onClick={onFilterClick}
          >
            <SlidersHorizontal size={16} /> Filtros
            {filterCount > 0 ? <span className="filter-count-badge">{filterCount}</span> : null}
          </button>
        ) : null}
        {showColumnButton && onColumnsClick ? (
          <button
            className="button button-secondary button-compact"
            type="button"
            disabled={columnsDisabled}
            onClick={onColumnsClick}
          >
            <Columns3 size={16} /> Columnas
          </button>
        ) : null}
      </div>
    </div>
  );
}
