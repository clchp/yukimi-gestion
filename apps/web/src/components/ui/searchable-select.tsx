import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string | undefined;
  disabled?: boolean;
}

interface SearchableSelectProps {
  label?: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  help?: string;
  error?: string | undefined;
  allowClear?: boolean;
  className?: string;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE');
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Escribe para buscar…',
  emptyMessage = 'Sin resultados',
  disabled = false,
  required = false,
  help,
  error,
  allowClear = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const sorted = useMemo(
    () =>
      [...options].sort((left, right) =>
        left.label.localeCompare(right.label, 'es', { sensitivity: 'base', numeric: true }),
      ),
    [options],
  );
  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return sorted;
    return sorted.filter((option) =>
      normalize(`${option.label} ${option.description ?? ''}`).includes(needle),
    );
  }, [query, sorted]);
  const selected = sorted.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlighted];
      if (option && !option.disabled) choose(option.value);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`searchable-select ${error ? 'field-invalid' : ''} ${className}`.trim()}
    >
      {label ? (
        <label className="searchable-select-label">
          {label} {required ? <b aria-hidden="true">*</b> : null}
        </label>
      ) : null}
      <div className="searchable-select-control">
        <button
          type="button"
          className="searchable-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={selected ? '' : 'placeholder'}>{selected?.label ?? placeholder}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {allowClear && value && !disabled ? (
          <button
            type="button"
            className="searchable-select-clear"
            aria-label="Limpiar selección"
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="searchable-select-popover">
          <div className="searchable-select-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
          <div id={listId} className="searchable-select-list" role="listbox">
            {filtered.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                className={`searchable-select-option ${index === highlighted ? 'highlighted' : ''}`}
                key={option.value}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option.value)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.value === value ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">{emptyMessage}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {help ? <small className="field-help">{help}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}
