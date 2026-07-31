import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

interface FlatOption {
  value: string;
  label: string;
  disabled: boolean;
  placeholder: boolean;
}

function flattenOptions(children: ReactNode): FlatOption[] {
  const options: FlatOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const option = child as ReactElement<{
        value?: string | number;
        disabled?: boolean;
        children?: ReactNode;
      }>;
      const value = String(option.props.value ?? '');
      const label = Children.toArray(option.props.children).join('').trim() || value;
      options.push({
        value,
        label,
        disabled: Boolean(option.props.disabled),
        placeholder: value === '',
      });
      return;
    }
    if (child.type === 'optgroup') {
      const group = child as ReactElement<{ children?: ReactNode }>;
      options.push(...flattenOptions(group.props.children));
    }
  });
  return options;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim();
}

export type SearchableNativeSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'children'
> & {
  children?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};

export function SearchableNativeSelect({
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  className,
  multiple,
  title,
  ...nativeProps
}: SearchableNativeSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [localValue, setLocalValue] = useState(String(value ?? defaultValue ?? ''));
  const [invalid, setInvalid] = useState(false);
  const options = useMemo(() => flattenOptions(children), [children]);
  const selectedValue = value == null ? localValue : String(value);
  const selected = options.find((option) => option.value === selectedValue);
  const filtered = useMemo(() => {
    const query = normalize(search);
    const selectable = options.filter((option) => !option.placeholder);
    const matches = query
      ? selectable.filter((option) => normalize(option.label).includes(query))
      : selectable;
    return [...matches].sort((left, right) =>
      left.label.localeCompare(right.label, 'es', { sensitivity: 'base', numeric: true }),
    );
  }, [options, search]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form || !required) return;
    const handleSubmit = (event: Event) => {
      if (selectedValue) return;
      event.preventDefault();
      event.stopPropagation();
      setInvalid(true);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    form.addEventListener('submit', handleSubmit, true);
    return () => form.removeEventListener('submit', handleSubmit, true);
  }, [required, selectedValue]);

  if (multiple) {
    return (
      <select
        {...nativeProps}
        id={id}
        name={name}
        className={className}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        multiple
        title={title}
      >
        {children}
      </select>
    );
  }

  function choose(nextValue: string) {
    if (value == null) setLocalValue(nextValue);
    setInvalid(false);
    setOpen(false);
    setSearch('');
    const synthetic = {
      target: { value: nextValue, name: name ?? '' },
      currentTarget: { value: nextValue, name: name ?? '' },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange?.(synthetic);
  }

  return (
    <div
      ref={rootRef}
      className={`searchable-native-select ${invalid ? 'field-invalid' : ''} ${className ?? ''}`.trim()}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <button
        id={id}
        className="searchable-native-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        title={title}
        onClick={() => {
          setOpen((current) => !current);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <span className={selected ? '' : 'placeholder'}>
          {selected?.label ?? options.find((option) => option.placeholder)?.label ?? 'Seleccionar'}
        </span>
        <ChevronDown size={17} />
      </button>

      {open ? (
        <div className="searchable-native-popover">
          <div className="searchable-native-search">
            <Search size={15} />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar opción"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
                if (event.key === 'Enter' && filtered[0] && !filtered[0].disabled) {
                  event.preventDefault();
                  choose(filtered[0].value);
                }
              }}
            />
            {search ? (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            ) : null}
          </div>
          <div className="searchable-native-options" role="listbox">
            {options.some((option) => option.placeholder) ? (
              <button
                type="button"
                role="option"
                aria-selected={selectedValue === ''}
                onClick={() => choose('')}
              >
                <span>{options.find((option) => option.placeholder)?.label}</span>
                {selectedValue === '' ? <Check size={15} /> : null}
              </button>
            ) : null}
            {filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                disabled={option.disabled}
                key={`${option.value}-${option.label}`}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {option.value === selectedValue ? <Check size={15} /> : null}
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="searchable-native-empty">Sin resultados</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <select
        {...nativeProps}
        name={name}
        value={selectedValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="searchable-native-hidden"
      >
        {Children.map(children, (child) => (isValidElement(child) ? cloneElement(child) : child))}
      </select>
      {invalid ? <small className="field-error">Selecciona una opción.</small> : null}
    </div>
  );
}
