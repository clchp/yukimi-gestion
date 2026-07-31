import { useEffect, useRef } from 'react';
import { useFeedback } from './feedback-provider';

function friendlyValidationMessage(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  const label = control
    .closest('label')
    ?.querySelector('span')
    ?.textContent?.replace('*', '')
    .trim();
  const field = label || control.getAttribute('aria-label') || control.name || 'Este campo';
  const validity = control.validity;
  if (validity.valueMissing) return `${field} es obligatorio.`;
  if (validity.typeMismatch) return `${field} no tiene un formato válido.`;
  if (validity.tooShort) {
    const minLength =
      control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
        ? control.minLength
        : 0;
    return `${field} debe tener al menos ${minLength} caracteres.`;
  }
  if (validity.tooLong) return `${field} supera la longitud permitida.`;
  if (validity.rangeUnderflow) {
    const min = control instanceof HTMLInputElement ? control.min : '';
    return `${field} debe ser mayor o igual que ${min}.`;
  }
  if (validity.rangeOverflow) {
    const max = control instanceof HTMLInputElement ? control.max : '';
    return `${field} debe ser menor o igual que ${max}.`;
  }
  if (validity.stepMismatch) return `${field} no coincide con el incremento permitido.`;
  if (validity.patternMismatch) return `${field} no cumple el formato solicitado.`;
  return `${field} contiene un valor no válido.`;
}

function clearFieldError(control: HTMLElement) {
  const field = control.closest('.field');
  if (!field) return;
  field.classList.remove('field-invalid');
  field.querySelector('[data-global-field-error="true"]')?.remove();
}

export function GlobalFormValidationBridge() {
  const { notify } = useFeedback();
  const lastNotificationAt = useRef(0);

  useEffect(() => {
    const handleInvalid = (event: Event) => {
      const control = event.target;
      if (
        !(control instanceof HTMLInputElement) &&
        !(control instanceof HTMLSelectElement) &&
        !(control instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      event.preventDefault();
      const field = control.closest('.field');
      const message = friendlyValidationMessage(control);
      if (field) {
        field.classList.add('field-invalid');
        const current = field.querySelector<HTMLElement>('[data-global-field-error="true"]');
        const error = current ?? document.createElement('small');
        error.dataset.globalFieldError = 'true';
        error.className = 'field-error';
        error.textContent = message;
        if (!current) field.appendChild(error);
      }
      control.setAttribute('aria-invalid', 'true');
      control.focus({ preventScroll: true });
      control.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const now = Date.now();
      if (now - lastNotificationAt.current > 400) {
        lastNotificationAt.current = now;
        notify({
          title: 'Revisa el formulario',
          message: 'Corrige los campos marcados en rojo antes de continuar.',
          tone: 'error',
        });
      }
    };

    const handleInput = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLElement)) return;
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        if (control.validity.valid) {
          control.removeAttribute('aria-invalid');
          clearFieldError(control);
        }
      }
    };

    document.addEventListener('invalid', handleInvalid, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleInput, true);
    return () => {
      document.removeEventListener('invalid', handleInvalid, true);
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('change', handleInput, true);
    };
  }, [notify]);

  return null;
}
