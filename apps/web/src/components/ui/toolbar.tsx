import { Filter, Search } from 'lucide-react';
import type { ChangeEvent, PropsWithChildren } from 'react';

interface ToolbarProps extends PropsWithChildren {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  showFilterButton?: boolean;
}

export function Toolbar({
  placeholder = 'Buscar…',
  value,
  onChange,
  showFilterButton = true,
  children,
}: ToolbarProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value);
  }

  return (
    <div className="toolbar">
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? handleChange : undefined}
        />
      </label>
      <div className="toolbar-actions">
        {showFilterButton ? (
          <button className="button button-secondary button-compact" type="button">
            <Filter size={17} /> Filtros
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
