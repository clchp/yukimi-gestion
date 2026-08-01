import type { CreateClientAddressInput } from '@yukimi/shared';
import { MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DeliveryAddressModalProps {
  open: boolean;
  clientName: string;
  isPending: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateClientAddressInput) => void;
}

export function DeliveryAddressModal({
  open,
  clientName,
  isPending,
  errorMessage,
  onClose,
  onSubmit,
}: DeliveryAddressModalProps) {
  const [label, setLabel] = useState('Principal');
  const [addressLine, setAddressLine] = useState('');
  const [district, setDistrict] = useState('');
  const [province, setProvince] = useState('');
  const [department, setDepartment] = useState('Lima');
  const [reference, setReference] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLabel('Principal');
    setAddressLine('');
    setDistrict('');
    setProvince('');
    setDepartment('Lima');
    setReference('');
    setIsDefault(true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <form
        className="modal-card delivery-address-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-address-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            label: label.trim(),
            addressLine: addressLine.trim(),
            district: district.trim() || null,
            province: province.trim() || null,
            department: department.trim() || null,
            reference: reference.trim() || null,
            preferredPartnerId: null,
            isDefault,
          });
        }}
      >
        <div className="modal-header">
          <div>
            <small>Nueva dirección o punto de entrega</small>
            <h2 id="delivery-address-title">{clientName}</h2>
            <p>Se guardará en la ficha del cliente y quedará seleccionado en esta entrega.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Cerrar"
            disabled={isPending}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="delivery-address-heading">
          <MapPin size={18} />
          <span>Datos del destino</span>
        </div>

        <div className="form-grid form-grid-2">
          <label className="field">
            <span>Nombre del lugar *</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Casa, trabajo, agencia Olva…"
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            <span>Distrito</span>
            <input
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              placeholder="Los Olivos"
              maxLength={120}
            />
          </label>
          <label className="field field-span-2">
            <span>Dirección o punto de entrega *</span>
            <input
              value={addressLine}
              onChange={(event) => setAddressLine(event.target.value)}
              placeholder="Av., calle, oficina de agencia o punto acordado"
              minLength={5}
              maxLength={300}
              required
            />
          </label>
          <label className="field">
            <span>Provincia</span>
            <input
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              placeholder="Lima"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Departamento</span>
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Lima"
              maxLength={120}
            />
          </label>
          <label className="field field-span-2">
            <span>Referencia</span>
            <textarea
              rows={3}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Puerta, horario, persona que recibe o referencia del lugar"
              maxLength={500}
            />
          </label>
        </div>

        <label className="delivery-address-default">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
          />
          <span>Usar como dirección principal del cliente</span>
        </label>

        {errorMessage ? <div className="alert alert-error">{errorMessage}</div> : null}

        <div className="modal-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={isPending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button button-primary" type="submit" disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar y seleccionar'}
          </button>
        </div>
      </form>
    </div>
  );
}
