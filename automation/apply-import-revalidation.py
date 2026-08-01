from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: se esperaba 1 coincidencia y se encontraron {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Diálogos globales: el asterisco ya vive junto a cada campo; la leyenda final
# confundía campos opcionales como tracking y notas.
# ---------------------------------------------------------------------------
path = "apps/web/src/components/ui/feedback-provider.tsx"
text = read(path)
text = replace_once(
    text,
    '                <small className="required-note">* Campo obligatorio</small>\n',
    "",
    "quitar leyenda global de campos obligatorios",
)
write(path, text)


# ---------------------------------------------------------------------------
# Nueva importación: operadores reutilizables, validación local y resumen que
# no cubra el formulario.
# ---------------------------------------------------------------------------
path = "apps/web/src/pages/new-import-page.tsx"
text = read(path)
text = replace_once(
    text,
    "      confirmLabel: 'Crear proveedor',\n    });",
    """      confirmLabel: 'Crear proveedor',
      validate: (draft) => {
        const next: Record<string, string> = {};
        const country = (draft.countryCode ?? '').trim();
        const email = (draft.email ?? '').trim();
        if (country.length !== 2) next.countryCode = 'Usa el código de país de 2 letras, por ejemplo JP o PE.';
        if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) next.email = 'Ingresa un correo válido o déjalo vacío.';
        return Object.keys(next).length > 0 ? next : null;
      },
    });""",
    "validación de proveedor",
)
operator_function = r'''
  async function createOperator(
    boxIndex: number,
    partnerTypeCode: 'INTERNATIONAL_OPERATOR' | 'LOCAL_OPERATOR',
  ) {
    const international = partnerTypeCode === 'INTERNATIONAL_OPERATOR';
    const values = await promptDialog({
      title: international ? 'Nuevo operador internacional' : 'Nuevo operador local',
      message: 'El operador quedará disponible para esta caja y para futuras importaciones.',
      fields: [
        { name: 'name', label: 'Nombre', required: true, minLength: 2 },
        { name: 'countryCode', label: 'País', initialValue: international ? 'JP' : 'PE', required: true },
        { name: 'contactName', label: 'Contacto' },
        { name: 'email', label: 'Correo' },
        { name: 'phone', label: 'Teléfono' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ],
      validate: (draft) => {
        const next: Record<string, string> = {};
        const country = (draft.countryCode ?? '').trim();
        const email = (draft.email ?? '').trim();
        if (country.length !== 2) next.countryCode = 'Usa el código de país de 2 letras.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Ingresa un correo válido o déjalo vacío.';
        return Object.keys(next).length > 0 ? next : null;
      },
      confirmLabel: 'Crear operador',
    });
    if (!values) return;
    try {
      const result = await createImportPartner({
        partnerTypeCode,
        legalName: (values.name ?? '').trim(),
        tradeName: (values.name ?? '').trim(),
        countryCode: (values.countryCode ?? '').trim().toUpperCase(),
        contactName: (values.contactName ?? '').trim() || null,
        email: (values.email ?? '').trim() || null,
        phone: (values.phone ?? '').trim() || null,
        notes: (values.notes ?? '').trim() || null,
      });
      updateBox(
        boxIndex,
        international
          ? { internationalOperatorId: result.id }
          : { localOperatorId: result.id },
      );
      await queryClient.invalidateQueries({ queryKey: ['import-support'] });
      notify({ title: 'Operador creado y seleccionado', tone: 'success' });
    } catch (error) {
      notifyError(error, 'No se pudo crear el operador.');
    }
  }

'''
text = replace_once(text, "  function validate() {\n", operator_function + "  function validate() {\n", "insertar creación de operador")
text = replace_once(
    text,
    """    setErrors(next);
    return Object.keys(next).length === 0;
  }
""",
    """    setErrors(next);
    if (Object.keys(next).length > 0) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('.field-invalid, [aria-invalid="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    return Object.keys(next).length === 0;
  }
""",
    "enfocar primer error de importación",
)
text = text.replace('                <span>Tracking maestro</span>', '                <span>Tracking maestro (opcional)</span>')
text = text.replace('            <small className="required-note">* Campo obligatorio</small>\n', '')

international_select = r'''                    <SearchableSelect
                      label="Operador internacional"
                      value={box.internationalOperatorId}
                      allowClear
                      options={(support.data?.internationalOperators ?? []).map((partner) => ({
                        value: partner.id,
                        label: partner.name,
                      }))}
                      onChange={(value) => updateBox(boxIndex, { internationalOperatorId: value })}
                    />'''
international_replacement = r'''                    <div className="field-with-action">
                      <SearchableSelect
                        label="Operador internacional"
                        value={box.internationalOperatorId}
                        allowClear
                        options={(support.data?.internationalOperators ?? []).map((partner) => ({
                          value: partner.id,
                          label: partner.name,
                        }))}
                        onChange={(value) => updateBox(boxIndex, { internationalOperatorId: value })}
                      />
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => void createOperator(boxIndex, 'INTERNATIONAL_OPERATOR')}
                      >
                        <Plus size={15} /> Crear
                      </button>
                    </div>'''
text = replace_once(text, international_select, international_replacement, "botón operador internacional")
local_select = r'''                    <SearchableSelect
                      label="Operador local"
                      value={box.localOperatorId}
                      allowClear
                      options={(support.data?.localOperators ?? []).map((partner) => ({
                        value: partner.id,
                        label: partner.name,
                      }))}
                      onChange={(value) => updateBox(boxIndex, { localOperatorId: value })}
                    />'''
local_replacement = r'''                    <div className="field-with-action">
                      <SearchableSelect
                        label="Operador local"
                        value={box.localOperatorId}
                        allowClear
                        options={(support.data?.localOperators ?? []).map((partner) => ({
                          value: partner.id,
                          label: partner.name,
                        }))}
                        onChange={(value) => updateBox(boxIndex, { localOperatorId: value })}
                      />
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => void createOperator(boxIndex, 'LOCAL_OPERATOR')}
                      >
                        <Plus size={15} /> Crear
                      </button>
                    </div>'''
text = replace_once(text, local_select, local_replacement, "botón operador local")
write(path, text)


# ---------------------------------------------------------------------------
# Detalle de importación: consolidación visual por cajas, costos recibidos,
# etiquetas correctas, recepción sin banner obsoleto y acciones compactas.
# ---------------------------------------------------------------------------
path = "apps/web/src/pages/import-detail-page.tsx"
text = read(path)
text = text.replace("  SHIPPED: 'Enviada',", "  SHIPPED: 'Embarcada',")
text = text.replace("  SHIPPED: 'La mercadería salió del origen.',", "  SHIPPED: 'La mercadería fue embarcada y salió del origen.',")
progress_helper = r'''
function deriveImportProgress(data: ImportDetail) {
  const activeBoxes = data.boxes.filter((box) => box.stateCode !== 'CANCELLED');
  const storedState = data.stateCode;
  if (storedState === 'CANCELLED' || storedState === 'STOCKED' || activeBoxes.length === 0) {
    return {
      stateCode: storedState,
      label: stateLabels[storedState] ?? storedState,
      partial: false,
      independentBoxes: false,
    };
  }
  const indices = activeBoxes
    .map((box) => boxFlow.indexOf(box.stateCode))
    .filter((index) => index >= 0);
  if (indices.length === 0) {
    return {
      stateCode: storedState,
      label: stateLabels[storedState] ?? storedState,
      partial: false,
      independentBoxes: false,
    };
  }
  const maxIndex = Math.max(...indices);
  const minIndex = Math.min(...indices);
  const shippedIndex = boxFlow.indexOf('SHIPPED');
  if (maxIndex < shippedIndex) {
    return {
      stateCode: storedState,
      label: stateLabels[storedState] ?? storedState,
      partial: false,
      independentBoxes: false,
    };
  }
  const maxState = boxFlow[maxIndex] as ImportStateCode;
  const countAtMax = indices.filter((index) => index === maxIndex).length;
  const partialLabels: Partial<Record<ImportStateCode, string>> = {
    SHIPPED: 'Embarque parcial',
    IN_TRANSIT: 'Tránsito parcial',
    RECEIVED_PERU: 'Recepción parcial',
    STOCKED: 'Ingreso parcial a stock',
  };
  return {
    stateCode: maxState,
    label:
      minIndex === maxIndex
        ? (stateLabels[maxState] ?? maxState)
        : `${partialLabels[maxState] ?? 'Avance parcial'} — ${countAtMax} de ${activeBoxes.length} cajas`,
    partial: minIndex !== maxIndex,
    independentBoxes: true,
  };
}

'''
text = replace_once(text, "function stateTone(state: string) {\n", progress_helper + "function stateTone(state: string) {\n", "insertar consolidación de estado")
text = replace_once(
    text,
    """interface ReceiveDialogState {
  box: ImportDetail['boxes'][number];
  repair: boolean;
  quantities: Record<string, string>;
  notes: Record<string, string>;
  reason: string;
  errors: Record<string, string>;
}
""",
    """interface ReceiveDialogState {
  box: ImportDetail['boxes'][number];
  repair: boolean;
  quantities: Record<string, string>;
  notes: Record<string, string>;
  receivedAt: string;
  reason: string;
  errors: Record<string, string>;
}
""",
    "fecha de recepción",
)
text = replace_once(
    text,
    """      notes: Object.fromEntries(box.items.map((item) => [item.id, ''])),
      reason: repair
""",
    """      notes: Object.fromEntries(box.items.map((item) => [item.id, ''])),
      receivedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16),
      reason: repair
""",
    "inicializar fecha recepción",
)
text = replace_once(
    text,
    """      if (!Number.isInteger(value) || value < 0 || value > item.expectedQuantity) {
        errors[item.id] = `Ingresa un entero entre 0 y ${item.expectedQuantity}.`;
      } else {
        total += value;
      }
""",
    """      if (!Number.isInteger(value) || value < 0 || value > item.expectedQuantity) {
        errors[item.id] = `Ingresa un entero entre 0 y ${item.expectedQuantity}.`;
      } else {
        total += value;
        if (value < item.expectedQuantity && (receiveDialog.notes[item.id] ?? '').trim().length < 3) {
          errors[`note-${item.id}`] = 'Explica el faltante o daño de esta línea.';
        }
      }
""",
    "nota obligatoria por faltante",
)
text = replace_once(
    text,
    """    if (total <= 0) errors.total = 'No puedes finalizar una caja con cero unidades recibidas.';
    if (receiveDialog.reason.trim().length < 5)
""",
    """    if (total <= 0) errors.total = 'No puedes finalizar una caja con cero unidades recibidas.';
    if (!receiveDialog.receivedAt || Number.isNaN(new Date(receiveDialog.receivedAt).getTime()))
      errors.receivedAt = 'Selecciona la fecha real de recepción.';
    if (receiveDialog.reason.trim().length < 5)
""",
    "validar fecha recepción",
)
text = text.replace("        occurredAt: new Date().toISOString(),", "        occurredAt: new Date(receiveDialog.receivedAt).toISOString(),", 1)
text = replace_once(
    text,
    """  const currentShipmentIndex = shipmentFlow.indexOf(importData.stateCode);

  return (
""",
    """  const progress = deriveImportProgress(importData);
  const currentShipmentIndex = shipmentFlow.indexOf(progress.stateCode);
  const receivedInventoryValue = importData.boxes.reduce(
    (shipmentTotal, box) =>
      shipmentTotal +
      box.items.reduce(
        (boxTotal, item) =>
          boxTotal +
          item.receivedQuantity *
            (item.finalUnitCostPen ?? item.originalUnitCost * item.exchangeRateToPen),
        0,
      ),
    0,
  );
  const missingInventoryValue = importData.boxes.reduce(
    (shipmentTotal, box) =>
      shipmentTotal +
      box.items.reduce(
        (boxTotal, item) =>
          boxTotal +
          Math.max(0, item.expectedQuantity - item.receivedQuantity) *
            (item.finalUnitCostPen ?? item.originalUnitCost * item.exchangeRateToPen),
        0,
      ),
    0,
  );

  return (
""",
    "métricas y progreso importación",
)
text = replace_once(
    text,
    """          <StatusBadge tone={stateTone(importData.stateCode)}>
            {stateLabels[importData.stateCode]}
          </StatusBadge>
""",
    """          <StatusBadge tone={stateTone(progress.stateCode)}>{progress.label}</StatusBadge>
""",
    "estado consolidado cabecera",
)
old_summary = r'''      <section className="summary-strip">
        <div>
          <span>Unidades esperadas</span>
          <strong>{importData.totals.expectedUnits}</strong>
        </div>
        <div>
          <span>Unidades recibidas</span>
          <strong>{importData.totals.receivedUnits}</strong>
        </div>
        <div>
          <span>Compra estimada</span>
          <strong>{money(importData.totals.purchaseValuePen)}</strong>
        </div>
        <div>
          <span>Costos adicionales</span>
          <strong>{money(importData.totals.extraCostsPen)}</strong>
        </div>
      </section>'''
new_summary = r'''      <section className="summary-strip import-cost-summary">
        <div>
          <span>Unidades esperadas</span>
          <strong>{importData.totals.expectedUnits}</strong>
        </div>
        <div>
          <span>Unidades recibidas</span>
          <strong>{importData.totals.receivedUnits}</strong>
        </div>
        <div>
          <span>Compra esperada</span>
          <strong>{money(importData.totals.purchaseValuePen)}</strong>
        </div>
        <div>
          <span>Valor ingresado a inventario</span>
          <strong>{money(receivedInventoryValue)}</strong>
        </div>
        <div>
          <span>Diferencia no recibida</span>
          <strong>{money(missingInventoryValue)}</strong>
        </div>
        <div>
          <span>Costos adicionales</span>
          <strong>{money(importData.totals.extraCostsPen)}</strong>
        </div>
      </section>
      <ContextNote title="Valorización, no movimiento bancario">
        Estos montos valorizan la compra y los lotes recibidos. Finanzas solo descontará una cuenta cuando se registre el pago real al proveedor.
      </ContextNote>'''
text = replace_once(text, old_summary, new_summary, "resumen de costos de importación")
text = replace_once(
    text,
    """            {nextShipment ? (
              <button
""",
    """            {progress.independentBoxes && importData.stateCode !== 'STOCKED' ? (
              <ContextNote title="Continúa desde cada caja">
                Desde el embarque, cada caja puede viajar y llegar en fechas diferentes. Usa la acción de cada caja; la cabecera resume el avance parcial automáticamente.
              </ContextNote>
            ) : nextShipment ? (
              <button
""",
    "acción general por cajas",
)
text = replace_once(
    text,
    """            const repair = isZeroReceiptBox(box);
            return (
""",
    """            const repair = isZeroReceiptBox(box);
            const pendingLabel =
              box.stateCode === 'STOCKED'
                ? 'Faltantes'
                : box.stateCode === 'RECEIVED_PERU'
                  ? 'Pendientes de confirmar'
                  : 'Pendientes de recibir';
            return (
""",
    "etiqueta pendiente por caja",
)
text = replace_once(
    text,
    """                  <span>
                    Faltantes <strong>{Math.max(0, expected - received)}</strong>
                  </span>
""",
    """                  <span>
                    {pendingLabel} <strong>{Math.max(0, expected - received)}</strong>
                  </span>
""",
    "usar etiqueta pendiente",
)
text = text.replace(
    "{Object.keys(receiveDialog.errors).length > 0 ? (",
    "{Object.values(receiveDialog.errors).some(Boolean) ? (",
)
text = text.replace(
    "errors: { ...receiveDialog.errors, [item.id]: '' },",
    "errors: Object.fromEntries(Object.entries(receiveDialog.errors).filter(([key]) => key !== item.id)),",
)
text = text.replace(
    "errors: { ...receiveDialog.errors, reason: '' },",
    "errors: Object.fromEntries(Object.entries(receiveDialog.errors).filter(([key]) => key !== 'reason')),
",
)
text = replace_once(
    text,
    """                    <label className="field receive-notes">
                      <span>Nota de la línea</span>
                      <input
                        value={receiveDialog.notes[item.id] ?? ''}
                        onChange={(event) =>
                          setReceiveDialog({
                            ...receiveDialog,
                            notes: { ...receiveDialog.notes, [item.id]: event.target.value },
                          })
                        }
                        placeholder="Ej. Llegó una unidad con caja dañada…"
                      />
                    </label>
""",
    """                    <label
                      className={`field receive-notes ${receiveDialog.errors[`note-${item.id}`] ? 'field-invalid' : ''}`}
                    >
                      <span>Nota de la línea</span>
                      <input
                        value={receiveDialog.notes[item.id] ?? ''}
                        onChange={(event) =>
                          setReceiveDialog({
                            ...receiveDialog,
                            notes: { ...receiveDialog.notes, [item.id]: event.target.value },
                            errors: Object.fromEntries(
                              Object.entries(receiveDialog.errors).filter(
                                ([key]) => key !== `note-${item.id}`,
                              ),
                            ),
                          })
                        }
                        placeholder="Ej. Falta 1 unidad o llegó dañada…"
                      />
                      {receiveDialog.errors[`note-${item.id}`] ? (
                        <small className="field-error">{receiveDialog.errors[`note-${item.id}`]}</small>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>Diferencia</span>
                      <input
                        value={Math.max(
                          0,
                          item.expectedQuantity -
                            (Number(receiveDialog.quantities[item.id]) || 0),
                        )}
                        disabled
                      />
                    </label>
""",
    "nota y diferencia por línea",
)
text = replace_once(
    text,
    """            <label className={`field ${receiveDialog.errors.reason ? 'field-invalid' : ''}`}>
              <span>Motivo de la recepción *</span>
""",
    """            <label className={`field ${receiveDialog.errors.receivedAt ? 'field-invalid' : ''}`}>
              <span>Fecha real de recepción *</span>
              <input
                type="datetime-local"
                value={receiveDialog.receivedAt}
                onChange={(event) =>
                  setReceiveDialog({
                    ...receiveDialog,
                    receivedAt: event.target.value,
                    errors: Object.fromEntries(
                      Object.entries(receiveDialog.errors).filter(([key]) => key !== 'receivedAt'),
                    ),
                  })
                }
              />
              {receiveDialog.errors.receivedAt ? (
                <small className="field-error">{receiveDialog.errors.receivedAt}</small>
              ) : null}
            </label>
            <label className={`field ${receiveDialog.errors.reason ? 'field-invalid' : ''}`}>
              <span>Motivo de la recepción *</span>
""",
    "campo fecha real recepción",
)
# Compactar formularios largos mediante acciones desplegables.
text = replace_once(
    text,
    """      <section className="import-management-grid">
        <Panel
          title="Registrar costo"
""",
    """      <section className="import-management-grid compact-import-actions">
        <details className="import-action-disclosure">
          <summary>
            <CircleDollarSign size={17} /> Registrar costo adicional
          </summary>
        <Panel
          title="Registrar costo"
""",
    "abrir costo desplegable",
)
text = replace_once(
    text,
    """        </Panel>

        <Panel
          title="Registrar incidencia"
""",
    """        </Panel>
        </details>
        <details className="import-action-disclosure">
          <summary>
            <ShieldAlert size={17} /> Registrar incidencia
          </summary>
        <Panel
          title="Registrar incidencia"
""",
    "abrir incidencia desplegable",
)
text = replace_once(
    text,
    """        </Panel>
      </section>

      <Panel
        title="Vincular preventa"
""",
    """        </Panel>
        </details>
      </section>

      <details className="import-action-disclosure import-preorder-disclosure">
        <summary>
          <Link2 size={17} /> Vincular preventa
        </summary>
      <Panel
        title="Vincular preventa"
""",
    "abrir preventa desplegable",
)
text = replace_once(
    text,
    """      </Panel>

      <section className="import-lower-grid">
""",
    """      </Panel>
      </details>

      <section className="import-lower-grid">
""",
    "cerrar preventa desplegable",
)
text = replace_once(
    text,
    """      >
        <div className="form-grid form-grid-3">
""",
    """      >
        {importData.stateCode === 'STOCKED' ? (
          <ContextNote title="La importación ya ingresó a stock">
            Las preventas se vinculan antes de recibir las cajas. Desde ahora, separa unidades mediante una venta normal.
          </ContextNote>
        ) : null}
        <div className="form-grid form-grid-3">
""",
    "explicar preventa finalizada",
)
text = replace_once(
    text,
    """            allocationMutation.isPending
          }
""",
    """            allocationMutation.isPending ||
            importData.stateCode === 'STOCKED'
          }
""",
    "desactivar preventa después de stock",
)
write(path, text)


# ---------------------------------------------------------------------------
# Lista de importaciones: muestra compra esperada, valor recibido y diferencia
# usando el detalle existente, sin confundirlos con costos extra.
# ---------------------------------------------------------------------------
path = "apps/web/src/pages/imports-page.tsx"
text = read(path)
text = text.replace("import { useQuery } from '@tanstack/react-query';", "import { useQueries, useQuery } from '@tanstack/react-query';")
text = text.replace("import { useState } from 'react';", "import { useMemo, useState } from 'react';")
text = text.replace("import { getImports } from '../features/imports/imports-api';", "import { getImport, getImports } from '../features/imports/imports-api';")
text = replace_once(
    text,
    """  const totalPages = Math.max(
""",
    """  const detailQueries = useQueries({
    queries: (imports.data?.items ?? []).map((item) => ({
      queryKey: ['import', item.id],
      queryFn: () => getImport(item.id),
      staleTime: 60_000,
    })),
  });
  const valuesByImport = useMemo(
    () =>
      new Map(
        (imports.data?.items ?? []).map((item, index) => {
          const detail = detailQueries[index]?.data;
          const receivedValue =
            detail?.boxes.reduce(
              (shipmentTotal, box) =>
                shipmentTotal +
                box.items.reduce(
                  (boxTotal, line) =>
                    boxTotal +
                    line.receivedQuantity *
                      (line.finalUnitCostPen ??
                        line.originalUnitCost * line.exchangeRateToPen),
                  0,
                ),
              0,
            ) ?? 0;
          const missingValue =
            detail?.boxes.reduce(
              (shipmentTotal, box) =>
                shipmentTotal +
                box.items.reduce(
                  (boxTotal, line) =>
                    boxTotal +
                    Math.max(0, line.expectedQuantity - line.receivedQuantity) *
                      (line.finalUnitCostPen ??
                        line.originalUnitCost * line.exchangeRateToPen),
                  0,
                ),
              0,
            ) ?? 0;
          return [
            item.id,
            {
              expectedValue: detail?.totals.purchaseValuePen ?? null,
              receivedValue: detail ? receivedValue : null,
              missingValue: detail ? missingValue : null,
            },
          ] as const;
        }),
      ),
    [detailQueries, imports.data?.items],
  );

  const totalPages = Math.max(
""",
    "detalle de costos por importación",
)
text = replace_once(
    text,
    """                <th>Llegada estimada</th>
                <th>Costos extra</th>
                <th>Estado</th>
""",
    """                <th>Llegada estimada</th>
                <th>Compra esperada</th>
                <th>Valor recibido</th>
                <th>Diferencia</th>
                <th>Costos extra</th>
                <th>Estado</th>
""",
    "cabeceras de costos importación",
)
text = text.replace("<td colSpan={9}>", "<td colSpan={12}>")
text = replace_once(
    text,
    """              {imports.data?.items.map((item) => (
                <tr key={item.id} onClick={() => navigate(`/importaciones/${item.id}`)}>
""",
    """              {imports.data?.items.map((item) => {
                const values = valuesByImport.get(item.id);
                return (
                <tr key={item.id} onClick={() => navigate(`/importaciones/${item.id}`)}>
""",
    "abrir cálculo por fila",
)
text = replace_once(
    text,
    """                  <td>{date(item.estimatedArrivalDate)}</td>
                  <td className="numeric-cell">{money(item.totalCostPen)}</td>
                  <td>
""",
    """                  <td>{date(item.estimatedArrivalDate)}</td>
                  <td className="numeric-cell">
                    {values?.expectedValue == null ? 'Cargando…' : money(values.expectedValue)}
                  </td>
                  <td className="numeric-cell">
                    {values?.receivedValue == null ? 'Cargando…' : money(values.receivedValue)}
                  </td>
                  <td className="numeric-cell">
                    {values?.missingValue == null ? 'Cargando…' : money(values.missingValue)}
                  </td>
                  <td className="numeric-cell">{money(item.totalCostPen)}</td>
                  <td>
""",
    "celdas de costos importación",
)
text = replace_once(
    text,
    """                </tr>
              ))}
""",
    """                </tr>
                );
              })}
""",
    "cerrar cálculo por fila",
)
text = replace_once(
    text,
    """        {imports.data?.items.map((item) => (
          <article
""",
    """        {imports.data?.items.map((item) => {
          const values = valuesByImport.get(item.id);
          return (
          <article
""",
    "abrir móvil costos importación",
)
text = replace_once(
    text,
    """              <span>
                Costos<strong>{money(item.totalCostPen)}</strong>
              </span>
""",
    """              <span>
                Compra esperada
                <strong>{values?.expectedValue == null ? '—' : money(values.expectedValue)}</strong>
              </span>
              <span>
                Valor recibido
                <strong>{values?.receivedValue == null ? '—' : money(values.receivedValue)}</strong>
              </span>
              <span>
                Diferencia
                <strong>{values?.missingValue == null ? '—' : money(values.missingValue)}</strong>
              </span>
              <span>
                Costos extra<strong>{money(item.totalCostPen)}</strong>
              </span>
""",
    "móvil costos importación",
)
text = replace_once(
    text,
    """          </article>
        ))}
""",
    """          </article>
          );
        })}
""",
    "cerrar móvil costos importación",
)
write(path, text)


# ---------------------------------------------------------------------------
# Inventario: acumulado visible, costo actual y detalle de lotes provenientes
# de importaciones, con enlace a la operación fuente.
# ---------------------------------------------------------------------------
path = "apps/web/src/pages/inventory-page.tsx"
text = read(path)
text = text.replace("import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';", "import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';")
text = text.replace("import type { InventoryMovementAction, InventoryRow } from '@yukimi/shared';", "import type { ImportDetail, InventoryMovementAction, InventoryRow } from '@yukimi/shared';")
text = text.replace("import { AlertTriangle, Boxes, PackageMinus, PackagePlus, Plus, Wrench, X } from 'lucide-react';", "import { AlertTriangle, Boxes, Eye, ExternalLink, Layers3, PackageMinus, PackagePlus, Plus, Wrench, X } from 'lucide-react';")
text = text.replace("import { useSearchParams } from 'react-router';", "import { useNavigate, useSearchParams } from 'react-router';")
text = text.replace("import { createInventoryMovement, getInventory } from '../features/products/products-api';", "import { getImport, getImports } from '../features/imports/imports-api';\nimport { createInventoryMovement, getInventory } from '../features/products/products-api';")
text = replace_once(
    text,
    """function groupConsolidated(items: InventoryRow[]): ConsolidatedRow[] {
  const grouped = new Map<string, ConsolidatedRow>();
  for (const item of items) {
""",
    """function groupConsolidated(items: InventoryRow[]): ConsolidatedRow[] {
  const grouped = new Map<string, ConsolidatedRow>();
  const valuations = new Map<string, { value: number; quantity: number }>();
  for (const item of items) {
    const valuation = valuations.get(item.variantId) ?? { value: 0, quantity: 0 };
    if (item.currentUnitCostPen != null && item.availableQuantity > 0) {
      valuation.value += item.currentUnitCostPen * item.availableQuantity;
      valuation.quantity += item.availableQuantity;
    }
    valuations.set(item.variantId, valuation);
""",
    "promedio ponderado de costo",
)
text = replace_once(
    text,
    """  }
  return [...grouped.values()];
}
""",
    """  }
  for (const row of grouped.values()) {
    const valuation = valuations.get(row.variantId);
    row.currentUnitCostPen =
      valuation && valuation.quantity > 0 ? valuation.value / valuation.quantity : null;
  }
  return [...grouped.values()];
}
""",
    "cerrar promedio ponderado",
)
text = replace_once(
    text,
    """  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
""",
    """  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
""",
    "navegación inventario",
)
text = replace_once(
    text,
    """  const [errors, setErrors] = useState<Record<string, string>>({});

  const catalogs = useQuery""",
    """  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lotVariantId, setLotVariantId] = useState<string | null>(
    searchParams.get('showLots') ? '' : null,
  );

  const catalogs = useQuery""",
    "estado modal lotes",
)
text = replace_once(
    text,
    """  const operationalWarehouses = useMemo(
""",
    """  const stockedImports = useQuery({
    queryKey: ['imports', 'inventory-lots'],
    queryFn: () => getImports({ filter: 'STOCKED', page: 1, pageSize: 100 }),
    staleTime: 60_000,
  });
  const importDetailQueries = useQueries({
    queries: (stockedImports.data?.items ?? []).map((item) => ({
      queryKey: ['import', item.id],
      queryFn: () => getImport(item.id),
      staleTime: 60_000,
    })),
  });
  const importLots = useMemo(
    () =>
      importDetailQueries.flatMap((query) => {
        const shipment = query.data;
        if (!shipment) return [];
        return shipment.boxes.flatMap((box) =>
          box.items
            .filter((item) => item.inventoryLotId)
            .map((item) => ({
              inventoryLotId: item.inventoryLotId as string,
              importId: shipment.id,
              importCode: shipment.code,
              boxCode: box.code,
              variantId: item.variantId,
              productName: item.productName,
              variantName: item.variantName,
              sku: item.sku,
              warehouseId: item.destinationWarehouseId,
              warehouseName: item.destinationWarehouseName ?? 'Sin almacén',
              receivedQuantity: item.receivedQuantity,
              originalUnitCost: item.originalUnitCost,
              originalCurrencyCode: item.originalCurrencyCode,
              exchangeRateToPen: item.exchangeRateToPen,
              finalUnitCostPen:
                item.finalUnitCostPen ?? item.originalUnitCost * item.exchangeRateToPen,
              receivedAt: box.actualArrivalAt ?? shipment.stockEntryCompletedAt ?? shipment.createdAt,
            })),
        );
      }),
    [importDetailQueries],
  );
  const selectedLots = useMemo(
    () =>
      importLots.filter(
        (lot) =>
          (!lotVariantId || lot.variantId === lotVariantId) &&
          (warehouseId === 'ALL' || lot.warehouseId === warehouseId),
      ),
    [importLots, lotVariantId, warehouseId],
  );

  const operationalWarehouses = useMemo(
""",
    "consultas y lotes de importación",
)
text = replace_once(
    text,
    """          reserved: summary.reserved + row.reservedQuantity,
          inTransit: summary.inTransit + row.inTransitQuantity,
          unavailable: summary.unavailable + row.damagedQuantity + row.lostQuantity,
        }),
        { available: 0, reserved: 0, inTransit: 0, unavailable: 0 },
""",
    """          reserved: summary.reserved + row.reservedQuantity,
          accumulated: summary.accumulated + row.accumulatedQuantity,
          inTransit: summary.inTransit + row.inTransitQuantity,
          unavailable: summary.unavailable + row.damagedQuantity + row.lostQuantity,
        }),
        { available: 0, reserved: 0, accumulated: 0, inTransit: 0, unavailable: 0 },
""",
    "totales acumulados",
)
reserved_card = r'''        <article className="inventory-stat">
          <span className="stat-icon stat-warning">
            <PackageMinus size={19} />
          </span>
          <div>
            <small>Reservado</small>
            <strong>{totals.reserved}</strong>
            <p>Separado a clientes</p>
          </div>
        </article>'''
text = replace_once(
    text,
    reserved_card,
    reserved_card
    + r'''
        <article className="inventory-stat">
          <span className="stat-icon stat-primary">
            <Layers3 size={19} />
          </span>
          <div>
            <small>Acumulado</small>
            <strong>{totals.accumulated}</strong>
            <p>Compras guardadas para clientes</p>
          </div>
        </article>''',
    "tarjeta acumulado",
)
text = replace_once(
    text,
    """                <th>Reservado</th>
                <th>Preventa</th>
                <th>Tránsito</th>
                <th>Dañado</th>
                <th>Stock mínimo</th>
                <th>Alerta</th>
                <th>Acción</th>
""",
    """                <th>Reservado</th>
                <th>Acumulado</th>
                <th>Preventa</th>
                <th>Tránsito</th>
                <th>Dañado</th>
                <th>Costo actual</th>
                <th>Stock mínimo</th>
                <th>Alerta</th>
                <th>Acciones</th>
""",
    "columnas acumulado y costo",
)
text = text.replace("<td colSpan={10}>", "<td colSpan={12}>")
text = replace_once(
    text,
    """                    <td className="numeric-cell">{row.reservedQuantity}</td>
                    <td className="numeric-cell">{row.preorderExpectedQuantity}</td>
                    <td className="numeric-cell">{row.inTransitQuantity}</td>
                    <td className="numeric-cell">{row.damagedQuantity}</td>
                    <td className="numeric-cell">{row.minimumStock}</td>
""",
    """                    <td className="numeric-cell">{row.reservedQuantity}</td>
                    <td className="numeric-cell">{row.accumulatedQuantity}</td>
                    <td className="numeric-cell">{row.preorderExpectedQuantity}</td>
                    <td className="numeric-cell">{row.inTransitQuantity}</td>
                    <td className="numeric-cell">{row.damagedQuantity}</td>
                    <td className="numeric-cell">
                      {row.currentUnitCostPen == null ? '—' : `S/ ${row.currentUnitCostPen.toFixed(2)}`}
                    </td>
                    <td className="numeric-cell">{row.minimumStock}</td>
""",
    "celdas acumulado y costo",
)
text = replace_once(
    text,
    """                    <td>
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => openMovement(row, 'TRANSFER')}
                      >
                        <Wrench size={15} /> Registrar
                      </button>
                    </td>
""",
    """                    <td>
                      <div className="row-actions inventory-lot-actions">
                        <button
                          className="button button-secondary button-compact"
                          type="button"
                          onClick={() => setLotVariantId(row.variantId)}
                        >
                          <Eye size={15} /> Ver lotes
                        </button>
                        <button
                          className="button button-secondary button-compact"
                          type="button"
                          onClick={() => openMovement(row, 'TRANSFER')}
                        >
                          <Wrench size={15} /> Registrar
                        </button>
                      </div>
                    </td>
""",
    "acciones lotes inventario",
)
text = replace_once(
    text,
    """                <span>
                  Reservado<strong>{row.reservedQuantity}</strong>
                </span>
                <span>
                  Tránsito<strong>{row.inTransitQuantity}</strong>
                </span>
""",
    """                <span>
                  Reservado<strong>{row.reservedQuantity}</strong>
                </span>
                <span>
                  Acumulado<strong>{row.accumulatedQuantity}</strong>
                </span>
                <span>
                  Tránsito<strong>{row.inTransitQuantity}</strong>
                </span>
                <span>
                  Costo
                  <strong>{row.currentUnitCostPen == null ? '—' : `S/ ${row.currentUnitCostPen.toFixed(2)}`}</strong>
                </span>
""",
    "móvil acumulado y costo",
)
text = replace_once(
    text,
    """                <button
                  className="link-button"
                  type="button"
                  onClick={() => (low ? resolveLowStock(row) : openMovement(row, 'TRANSFER'))}
                >
                  {low ? 'Resolver stock bajo' : 'Registrar movimiento'}
                </button>
""",
    """                <div className="row-actions">
                  <button className="link-button" type="button" onClick={() => setLotVariantId(row.variantId)}>
                    Ver lotes
                  </button>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => (low ? resolveLowStock(row) : openMovement(row, 'TRANSFER'))}
                  >
                    {low ? 'Resolver stock bajo' : 'Registrar movimiento'}
                  </button>
                </div>
""",
    "móvil ver lotes",
)
lot_modal = r'''
      {lotVariantId !== null ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLotVariantId(null);
          }}
        >
          <section
            className="app-modal-card modal-card-wide inventory-lots-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-lots-title"
          >
            <header className="app-modal-header">
              <div>
                <span className="eyebrow">Costo y procedencia</span>
                <h2 id="inventory-lots-title">Lotes de importación</h2>
                <p>Moneda, tipo de cambio, costo final y operación de origen.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setLotVariantId(null)}>
                <X size={20} />
              </button>
            </header>
            <ContextNote title="Cantidad recibida y stock disponible">
              Esta vista muestra lo recibido originalmente por lote. El disponible actual puede ser menor por ventas, reservas, transferencias o bajas posteriores.
            </ContextNote>
            <div className="responsive-table-wrap inventory-lot-table">
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>Lote / origen</th>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Recibido</th>
                    <th>Costo original</th>
                    <th>TC</th>
                    <th>Costo final</th>
                    <th>Valor recibido</th>
                    <th>Fecha</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selectedLots.map((lot) => (
                    <tr key={lot.inventoryLotId}>
                      <td>
                        <strong>{lot.boxCode}</strong>
                        <small>{lot.importCode} · {lot.inventoryLotId.slice(0, 8).toUpperCase()}</small>
                      </td>
                      <td>
                        <strong>{lot.productName}</strong>
                        <small>{lot.variantName} · {lot.sku}</small>
                      </td>
                      <td>{lot.warehouseName}</td>
                      <td>{lot.receivedQuantity}</td>
                      <td>{`${lot.originalCurrencyCode} ${lot.originalUnitCost.toFixed(2)}`}</td>
                      <td>{lot.exchangeRateToPen.toFixed(4)}</td>
                      <td>{`S/ ${lot.finalUnitCostPen.toFixed(2)}`}</td>
                      <td>{`S/ ${(lot.receivedQuantity * lot.finalUnitCostPen).toFixed(2)}`}</td>
                      <td>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(lot.receivedAt))}</td>
                      <td>
                        <button className="icon-button" type="button" title="Abrir importación" onClick={() => navigate(`/importaciones/${lot.importId}`)}>
                          <ExternalLink size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedLots.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty-state">
                          {importDetailQueries.some((query) => query.isLoading)
                            ? 'Cargando lotes…'
                            : 'No se encontraron lotes importados para esta variante y almacén.'}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <footer className="app-modal-actions">
              <button className="button button-secondary" type="button" onClick={() => setLotVariantId(null)}>
                Cerrar
              </button>
            </footer>
          </section>
        </div>
      ) : null}

'''
text = replace_once(text, "      {movementOpen ? (\n", lot_modal + "      {movementOpen ? (\n", "modal de lotes")
write(path, text)


# ---------------------------------------------------------------------------
# Reportes: enlace directo al detalle de lotes y explicación financiera.
# ---------------------------------------------------------------------------
path = "apps/web/src/pages/reports-page.tsx"
text = read(path)
text = text.replace("import { Download, Printer, TrendingUp } from 'lucide-react';", "import { Download, Layers3, Printer, TrendingUp } from 'lucide-react';")
text = text.replace("import { useMemo, useState } from 'react';", "import { useMemo, useState } from 'react';\nimport { useNavigate } from 'react-router';")
text = text.replace("import { Panel } from '../components/ui/panel';", "import { ContextNote } from '../components/ui/info-tip';\nimport { Panel } from '../components/ui/panel';")
text = replace_once(
    text,
    """export function ReportsPage() {
  const defaults = useMemo(initialPeriod, []);
""",
    """export function ReportsPage() {
  const navigate = useNavigate();
  const defaults = useMemo(initialPeriod, []);
""",
    "navegación reportes",
)
text = replace_once(
    text,
    """          </div>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
""",
    """          </div>
          <ContextNote title="Valorización de inventario">
            El valor estimado proviene del costo final de los lotes recibidos; no representa un pago bancario automático.
          </ContextNote>
          <button className="button button-secondary button-full no-print" type="button" onClick={() => navigate('/inventario?showLots=1')}>
            <Layers3 size={16} /> Ver lotes y costos
          </button>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
""",
    "detalle de lotes desde reportes",
)
write(path, text)


# ---------------------------------------------------------------------------
# Estilos finales: no superponer resumen, acciones compactas y modal de lotes.
# ---------------------------------------------------------------------------
path = "apps/web/src/styles/modules.css"
text = read(path)
css = r'''

/* Importaciones — revalidación final 2026-08-01 */
.new-import-layout {
  align-items: start;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 330px);
}
.new-import-main,
.new-import-summary {
  min-width: 0;
}
.new-import-summary .panel {
  position: sticky;
  top: 88px;
  max-height: calc(100vh - 112px);
  overflow: auto;
}
.field-with-action {
  align-items: end;
}
.field-with-action > .button {
  flex: 0 0 auto;
}
.import-cost-summary {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.compact-import-actions {
  align-items: start;
}
.import-action-disclosure {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: white;
  box-shadow: var(--shadow-sm);
}
.import-action-disclosure > summary {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 9px;
  padding: 0 18px;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 820;
  list-style: none;
}
.import-action-disclosure > summary::-webkit-details-marker {
  display: none;
}
.import-action-disclosure[open] > summary {
  border-bottom: 1px solid var(--border);
  background: var(--primary-pale);
}
.import-action-disclosure > .panel {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.import-preorder-disclosure {
  margin: 16px 0;
}
.inventory-lot-actions {
  flex-wrap: nowrap;
}
.inventory-lots-modal {
  width: min(1180px, calc(100vw - 36px));
}
.inventory-lot-table {
  max-height: min(58vh, 620px);
}
.inventory-lot-table td,
.inventory-lot-table th {
  white-space: nowrap;
}
.receive-item-fields {
  grid-template-columns: 90px 110px minmax(180px, 1fr) 90px;
}
.table-panel > .toolbar {
  padding-inline: 18px;
}
.table-panel > .toolbar .search-field {
  width: min(100%, 620px);
}

@media (max-width: 1180px) {
  .new-import-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .new-import-summary .panel {
    position: static;
    max-height: none;
  }
  .import-cost-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .import-cost-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .receive-item-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .inventory-lot-actions {
    flex-wrap: wrap;
  }
}
'''
if "/* Importaciones — revalidación final 2026-08-01 */" not in text:
    text += css
write(path, text)


# ---------------------------------------------------------------------------
# Bitácora consolidada.
# ---------------------------------------------------------------------------
bitacora = r'''# Bitácora final de revalidación — Importaciones e inventario

> Fecha: 1 de agosto de 2026  
> Rama de trabajo: `fix/importaciones-revalidacion-final`  
> Destino: `version-1-1`  
> `main` no debe modificarse.

## Flujo validado con IMP-000003

- Dos cajas y 62 unidades esperadas.
- `CJA-0000004`: 37 esperadas, 36 recibidas, 1 faltante.
- `CJA-0000005`: 25 esperadas y 25 recibidas.
- Total recibido: 61 de 62.
- La recepción de cada caja se ejecutó una sola vez y creó lotes de inventario.
- La unidad faltante creó una incidencia abierta.
- Stock disponible final observado: 86 unidades, compuesto por 25 unidades previas y 61 recibidas.
- Bulma: 22 previas + 36 recibidas = 58 disponibles.
- Gojo Satoru: 2 previas + 25 recibidas = 27 disponibles.

## Valorización comprobada

- Compra esperada: S/ 12,444.00.
- Valor realmente ingresado: S/ 12,257.00.
- Diferencia por la unidad faltante: S/ 187.00.
- El reporte general mostraba correctamente S/ 12,257.00, pero faltaba el detalle por importación y lote.
- La compra estimada o el costo del inventario no deben descontar automáticamente una cuenta financiera. Finanzas cambia únicamente cuando se registra un pago real al proveedor.

## Correcciones aplicadas

### Creación de importaciones

- Notas de proveedor y operador permanecen opcionales.
- Los campos obligatorios se identifican junto a su etiqueta; se elimina la leyenda general que confundía al usuario.
- La validación desplaza la vista al primer campo incorrecto.
- Se añadieron acciones para crear operadores internacionales y locales desde cada caja y seleccionarlos inmediatamente.
- Tracking maestro se identifica expresamente como opcional.
- El resumen lateral deja de cubrir las cajas y se adapta a pantallas medianas.

### Estados y seguimiento por caja

- Desde el embarque, la pantalla usa los estados reales de las cajas para mostrar embarque, tránsito, recepción o ingreso parcial.
- Cuando todas las cajas coinciden, se muestra el estado consolidado correspondiente.
- La acción general obsoleta se reemplaza por una explicación para continuar desde cada caja.
- Se unifica el término visible `Embarcada`.
- Antes del conteo físico se muestra `Pendientes de recibir` o `Pendientes de confirmar`; `Faltantes` queda reservado para cajas ya ingresadas.

### Recepción física

- El banner general de error desaparece cuando ya no quedan errores reales.
- Cada línea muestra su diferencia.
- Si se recibe menos de lo esperado, la nota de la línea pasa a ser obligatoria.
- Se registra y muestra la fecha real de recepción.
- Solo las cantidades recibidas ingresan al inventario.
- El flujo conserva la confirmación final y la idempotencia existente.

### Costos, incidencias y preventas

- Los formularios extensos se convierten en acciones compactas desplegables.
- La preventa explica por qué ya no puede vincularse después de ingresar la importación a stock.
- El detalle muestra compra esperada, valor ingresado, diferencia no recibida y costos adicionales por separado.
- Se aclara que esos valores no equivalen a un movimiento bancario.

### Lista de importaciones

- Se agregan columnas para compra esperada, valor recibido y diferencia.
- Costos extra permanece separado para no confundir flete, seguro o aduana con el valor de la mercadería.
- La vista móvil muestra el mismo desglose.

### Inventario y lotes

- Se agrega la cantidad acumulada como estado separado de reservado.
- Se muestra el costo unitario actual por variante y almacén.
- La acción `Ver lotes` muestra importación, caja, almacén, cantidad recibida, moneda original, tipo de cambio, costo final, valor recibido y fecha.
- Desde el lote puede abrirse la importación de origen.
- Se explica que cantidad recibida no equivale necesariamente al saldo actual del lote.

### Reportes

- El valor estimado mantiene su cálculo por costo final de lotes.
- Se añade acceso directo al detalle de lotes y costos en Inventario.
- Se aclara que la valorización no representa un pago bancario automático.

## Validación esperada

- Formato, tipos, pruebas de API y compilación deben finalizar sin errores.
- La rama `version-1-1` solo debe recibir estos cambios mediante pull request aprobado.
- No se requiere reiniciar ni borrar la base de datos para estas correcciones de presentación y flujo.
'''
write("docs/BITACORA_REVALIDACION_IMPORTACIONES_FINAL_2026-08-01.md", bitacora)

print("Correcciones de importaciones aplicadas correctamente.")
