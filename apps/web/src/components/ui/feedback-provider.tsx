import {
  AlertCircle,
  CheckCircle2,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiClientError } from '../../app/api-client';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: FeedbackTone;
  durationMs?: number;
  requestId?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  detail?: string;
}

export interface DialogOption {
  value: string;
  label: string;
}

export interface DialogField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'time';
  initialValue?: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  minLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: DialogOption[];
  disabled?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  fields: DialogField[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  validate?: (values: Record<string, string>) => Record<string, string> | null;
}

type DialogState =
  | {
      kind: 'confirm';
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      options: PromptOptions;
      resolve: (value: Record<string, string> | null) => void;
    }
  | null;

interface ToastRecord extends ToastOptions {
  id: number;
  tone: FeedbackTone;
}

interface FeedbackContextValue {
  notify: (options: ToastOptions) => void;
  notifyError: (error: unknown, fallback?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<Record<string, string> | null>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function detailMessage(details: unknown): string | null {
  if (!details) return null;
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) {
    const messages = details
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'message' in item) {
          const message = (item as { message?: unknown }).message;
          const path = (item as { path?: unknown }).path;
          const field = Array.isArray(path) ? path.join('.') : null;
          return typeof message === 'string' ? `${field ? `${field}: ` : ''}${message}` : null;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(' · ') : null;
  }
  if (typeof details === 'object') {
    const candidate = details as Record<string, unknown>;
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.hint === 'string') return candidate.hint;
    if (Array.isArray(candidate.issues)) return detailMessage(candidate.issues);
  }
  return null;
}

export function friendlyError(error: unknown, fallback = 'No se pudo completar la operación.') {
  if (error instanceof ApiClientError) {
    const technicalDetail = detailMessage(error.details);
    const generic = /datos enviados no son v[aá]lidos/i.test(error.message);
    return {
      title: generic ? 'Revisa la información ingresada' : 'No se pudo completar la operación',
      message: generic
        ? technicalDetail ?? 'Corrige los campos obligatorios o marcados en rojo y vuelve a intentarlo.'
        : technicalDetail && technicalDetail !== error.message
          ? `${error.message} ${technicalDetail}`
          : error.message,
      requestId: error.requestId,
    };
  }
  if (error instanceof Error) {
    return { title: 'No se pudo completar la operación', message: error.message || fallback };
  }
  return { title: 'No se pudo completar la operación', message: fallback };
}

function ToneIcon({ tone }: { tone: FeedbackTone }) {
  if (tone === 'success') return <CheckCircle2 size={20} />;
  if (tone === 'error') return <AlertCircle size={20} />;
  if (tone === 'warning') return <TriangleAlert size={20} />;
  return <Info size={20} />;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discardWarning, setDiscardWarning] = useState(false);
  const nextId = useRef(1);
  const firstControlRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const notify = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    const record: ToastRecord = { ...options, id, tone: options.tone ?? 'info' };
    setToasts((current) => [...current.slice(-3), record]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, options.durationMs ?? 5000);
  }, []);

  const notifyError = useCallback(
    (error: unknown, fallback?: string) => {
      const parsed = friendlyError(error, fallback);
      notify({ ...parsed, tone: 'error', durationMs: 8000 });
    },
    [notify],
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setValues({});
      setErrors({});
      setDiscardWarning(false);
      setDialog({ kind: 'confirm', options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<Record<string, string> | null>((resolve) => {
      setValues(
        Object.fromEntries(options.fields.map((field) => [field.name, field.initialValue ?? ''])),
      );
      setErrors({});
      setDiscardWarning(false);
      setDialog({ kind: 'prompt', options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean | Record<string, string> | null) => {
      if (!dialog) return;
      if (dialog.kind === 'confirm') dialog.resolve(Boolean(result));
      else dialog.resolve(result && typeof result === 'object' ? result : null);
      setDialog(null);
      setValues({});
      setErrors({});
      setDiscardWarning(false);
    },
    [dialog],
  );

  const hasPromptChanges = useMemo(() => {
    if (dialog?.kind !== 'prompt') return false;
    return dialog.options.fields.some(
      (field) => values[field.name] !== (field.initialValue ?? ''),
    );
  }, [dialog, values]);

  const requestClose = useCallback(() => {
    if (dialog?.kind === 'prompt' && hasPromptChanges && !discardWarning) {
      setDiscardWarning(true);
      return;
    }
    close(dialog?.kind === 'confirm' ? false : null);
  }, [close, dialog, discardWarning, hasPromptChanges]);

  useEffect(() => {
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => firstControlRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dialog, requestClose]);

  function validatePrompt() {
    if (dialog?.kind !== 'prompt') return null;
    const nextErrors: Record<string, string> = {};
    for (const field of dialog.options.fields) {
      const value = values[field.name]?.trim() ?? '';
      if (field.required && !value) nextErrors[field.name] = `${field.label} es obligatorio.`;
      else if (field.minLength && value.length < field.minLength) {
        nextErrors[field.name] = `${field.label} debe tener al menos ${field.minLength} caracteres.`;
      } else if (field.type === 'number' && value) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) nextErrors[field.name] = 'Ingresa un número válido.';
        else if (field.min !== undefined && numberValue < field.min)
          nextErrors[field.name] = `El valor mínimo es ${field.min}.`;
        else if (field.max !== undefined && numberValue > field.max)
          nextErrors[field.name] = `El valor máximo es ${field.max}.`;
      }
    }
    const customErrors = dialog.options.validate?.(values);
    if (customErrors) Object.assign(nextErrors, customErrors);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? values : null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'confirm') {
      close(true);
      return;
    }
    const validValues = validatePrompt();
    if (validValues) close(validValues);
  }

  const contextValue = useMemo(
    () => ({ notify, notifyError, confirm, prompt }),
    [confirm, notify, notifyError, prompt],
  );

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-label="Mensajes del sistema">
        {toasts.map((toast) => (
          <div className={`app-toast app-toast-${toast.tone}`} key={toast.id} role="status">
            <span className="app-toast-icon"><ToneIcon tone={toast.tone} /></span>
            <div>
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
              {toast.requestId ? <small>Referencia para soporte: {toast.requestId}</small> : null}
            </div>
            <button
              type="button"
              className="icon-button app-toast-close"
              aria-label="Cerrar mensaje"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {dialog ? (
        <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}>
          <form
            className={`app-modal-card ${dialog.options.tone === 'danger' ? 'app-modal-danger' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onSubmit={handleSubmit}
          >
            <header className="app-modal-header">
              <div>
                <span className="eyebrow">Yukimi Gestión</span>
                <h2 id={titleId}>{dialog.options.title}</h2>
                {'message' in dialog.options && dialog.options.message ? (
                  <p id={descriptionId}>{dialog.options.message}</p>
                ) : null}
              </div>
              <button type="button" className="icon-button" aria-label="Cerrar" onClick={requestClose}>
                <X size={20} />
              </button>
            </header>

            {dialog.kind === 'confirm' && dialog.options.detail ? (
              <div className="context-note context-note-warning">
                <TriangleAlert size={18} />
                <span>{dialog.options.detail}</span>
              </div>
            ) : null}

            {dialog.kind === 'prompt' ? (
              <div className="app-modal-fields">
                {Object.keys(errors).length > 0 ? (
                  <div className="form-error-summary" role="alert">
                    <AlertCircle size={18} />
                    <span>
                      No se pudo continuar. Corrige {Object.keys(errors).length}{' '}
                      {Object.keys(errors).length === 1 ? 'campo marcado' : 'campos marcados'} en rojo.
                    </span>
                  </div>
                ) : null}
                {dialog.options.fields.map((field, index) => {
                  const common = {
                    id: `dialog-${field.name}`,
                    name: field.name,
                    value: values[field.name] ?? '',
                    disabled: field.disabled,
                    'aria-invalid': Boolean(errors[field.name]),
                    'aria-describedby': `${field.name}-help ${field.name}-error`,
                    onChange: (
                      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
                    ) => {
                      setValues((current) => ({ ...current, [field.name]: event.target.value }));
                      setErrors((current) => {
                        if (!current[field.name]) return current;
                        const next = { ...current };
                        delete next[field.name];
                        return next;
                      });
                      setDiscardWarning(false);
                    },
                  };
                  return (
                    <label className={`form-field ${errors[field.name] ? 'field-invalid' : ''}`} key={field.name}>
                      <span>
                        {field.label} {field.required ? <b aria-hidden="true">*</b> : null}
                      </span>
                      {field.type === 'textarea' ? (
                        <textarea
                          {...common}
                          ref={index === 0 ? (firstControlRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                          placeholder={field.placeholder}
                          rows={5}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          {...common}
                          ref={index === 0 ? (firstControlRef as React.RefObject<HTMLSelectElement>) : undefined}
                        >
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...common}
                          ref={index === 0 ? (firstControlRef as React.RefObject<HTMLInputElement>) : undefined}
                          type={field.type ?? 'text'}
                          placeholder={field.placeholder}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                        />
                      )}
                      {field.help ? <small id={`${field.name}-help`}>{field.help}</small> : null}
                      {errors[field.name] ? (
                        <small className="field-error" id={`${field.name}-error`} role="alert">
                          {errors[field.name]}
                        </small>
                      ) : null}
                    </label>
                  );
                })}
                <small className="required-note">* Campo obligatorio</small>
              </div>
            ) : null}

            {discardWarning ? (
              <div className="discard-warning" role="alert">
                <div>
                  <strong>Tienes cambios sin guardar.</strong>
                  <span>¿Deseas descartarlos?</span>
                </div>
                <div>
                  <button type="button" className="button button-secondary" onClick={() => setDiscardWarning(false)}>
                    Seguir editando
                  </button>
                  <button type="button" className="button button-danger" onClick={() => close(null)}>
                    Descartar cambios
                  </button>
                </div>
              </div>
            ) : null}

            <footer className="app-modal-actions">
              <button type="button" className="button button-secondary" onClick={requestClose}>
                {dialog.options.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="submit"
                className={`button ${dialog.options.tone === 'danger' ? 'button-danger' : 'button-primary'}`}
                disabled={discardWarning}
              >
                {dialog.options.confirmLabel ?? 'Confirmar'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback debe utilizarse dentro de FeedbackProvider.');
  return value;
}

export function BusyLabel({ label }: { label: string }) {
  return <span className="busy-label"><LoaderCircle size={16} className="spin" /> {label}</span>;
}
