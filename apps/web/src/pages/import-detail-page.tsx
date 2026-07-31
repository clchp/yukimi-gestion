import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateImportCostInput,
  CreateImportIncidentInput,
  ImportBoxStateCode,
  ImportDetail,
  ImportStateCode,
  ReceiveImportBoxInput,
  UpdateImportBoxStateInput,
  UpdateImportStateInput,
} from '@yukimi/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Link2,
  PackageCheck,
  Plus,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  BusyLabel,
  useFeedback,
} from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import { StatusBadge } from '../components/ui/status-badge';
import {
  addImportCost,
  advanceImport,
  advanceImportBox,
  allocatePreorder,
  createImportIncident,
  createInsuranceClaim,
  getImport,
  getImportSupportData,
  receiveImportBox,
  repairZeroReceivedImportBox,
  updateInsuranceClaim,
} from '../features/imports/imports-api';

const shipmentFlow: ImportStateCode[] = [
  'QUOTATION',
  'PURCHASE_CONFIRMED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
];

const boxFlow: ImportBoxStateCode[] = [
  'REGISTERED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
];

const stateLabels: Record<string, string> = {
  QUOTATION: 'Cotización',
  PURCHASE_CONFIRMED: 'Compra confirmada',
  REGISTERED: 'Registrada',
  FOREIGN_WAREHOUSE: 'En almacén internacional',
  DISPATCH_CONFIRMED: 'Despacho confirmado',
  SHIPPED: 'Enviada',
  IN_TRANSIT: 'En tránsito',
  RECEIVED_PERU: 'Recibida en Perú',
  STOCKED: 'Ingresada a stock',
  CANCELLED: 'Cancelada',
};

const stateHelp: Record<string, string> = {
  QUOTATION: 'La compra todavía está siendo evaluada.',
  PURCHASE_CONFIRMED: 'La compra fue confirmada con el proveedor.',
  REGISTERED: 'La caja fue registrada dentro de la importación.',
  FOREIGN_WAREHOUSE: 'La mercadería llegó al almacén internacional.',
  DISPATCH_CONFIRMED: 'El operador confirmó el despacho.',
  SHIPPED: 'La mercadería salió del origen.',
  IN_TRANSIT: 'La mercadería está viajando hacia Perú.',
  RECEIVED_PERU: 'La caja llegó físicamente y ya puede confirmarse su recepción.',
  STOCKED: 'Las cantidades recibidas fueron confirmadas y registradas en inventario.',
  CANCELLED: 'El flujo fue cancelado sin ingreso de unidades a inventario.',
};

const costLabels: Record<CreateImportCostInput['costType'], string> = {
  CARD: 'Comisión de tarjeta',
  COMMISSION: 'Comisión',
  FREIGHT: 'Flete',
  CUSTOMS: 'Aduana',
  INSURANCE: 'Seguro',
  LOCAL_DELIVERY: 'Entrega local',
  OTHER: 'Otro costo',
};

const incidentLabels: Record<CreateImportIncidentInput['incidentType'], string> = {
  MISSING: 'Faltante',
  DAMAGED: 'Producto dañado',
  DELAY: 'Retraso',
  WRONG_ITEM: 'Producto incorrecto',
  OTHER: 'Otra incidencia',
};

const claimLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  SUBMITTED: 'Presentado',
  APPROVED: 'Aprobado',
  PARTIALLY_APPROVED: 'Aprobado parcialmente',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CLOSED: 'Cerrado',
};

function money(value: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return 'Pendiente';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(
    new Date(value.length === 10 ? `${value}T12:00:00` : value),
  );
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isZeroReceiptBox(box: ImportDetail['boxes'][number]) {
  return (
    box.stateCode === 'STOCKED' &&
    box.items.reduce((sum, item) => sum + item.expectedQuantity, 0) > 0 &&
    box.items.reduce((sum, item) => sum + item.receivedQuantity, 0) === 0 &&
    box.items.every((item) => item.inventoryLotId == null)
  );
}

function stateTone(state: string) {
  if (state === 'STOCKED') return 'success' as const;
  if (state === 'CANCELLED') return 'danger' as const;
  if (state === 'RECEIVED_PERU') return 'info' as const;
  return 'warning' as const;
}

interface ReceiveDialogState {
  box: ImportDetail['boxes'][number];
  repair: boolean;
  quantities: Record<string, string>;
  notes: Record<string, string>;
  reason: string;
  errors: Record<string, string>;
}

export function ImportDetailPage() {
  const { importId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, notify, notifyError, prompt } = useFeedback();
  const [receiveDialog, setReceiveDialog] = useState<ReceiveDialogState | null>(null);
  const [costType, setCostType] = useState<CreateImportCostInput['costType']>('FREIGHT');
  const [costBoxId, setCostBoxId] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState('PEN');
  const [costExchangeRate, setCostExchangeRate] = useState('1');
  const [costDescription, setCostDescription] = useState('');
  const [costErrors, setCostErrors] = useState<Record<string, string>>({});
  const [incidentBoxId, setIncidentBoxId] = useState('');
  const [incidentItemId, setIncidentItemId] = useState('');
  const [incidentType, setIncidentType] = useState<CreateImportIncidentInput['incidentType']>('MISSING');
  const [incidentQuantity, setIncidentQuantity] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentErrors, setIncidentErrors] = useState<Record<string, string>>({});
  const [candidateSaleItemId, setCandidateSaleItemId] = useState('');
  const [allocationItemId, setAllocationItemId] = useState('');
  const [allocationQuantity, setAllocationQuantity] = useState('1');

  const detail = useQuery({
    queryKey: ['import', importId],
    queryFn: () => getImport(importId),
    enabled: Boolean(importId),
  });
  const support = useQuery({
    queryKey: ['import-support'],
    queryFn: getImportSupportData,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['import', importId] }),
      queryClient.invalidateQueries({ queryKey: ['imports'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['import-support'] }),
    ]);
  };

  const advanceMutation = useMutation({
    mutationFn: (input: UpdateImportStateInput) => advanceImport(importId, input),
    onSuccess: async (result) => {
      notify({
        title: result.stateCode === 'CANCELLED' ? 'Importación cancelada' : 'Estado actualizado',
        message:
          result.stateCode === 'CANCELLED'
            ? 'También se cancelaron sus cajas elegibles. No se modificó el inventario.'
            : `La importación ahora está en “${stateLabels[result.stateCode] ?? result.stateCode}”.`,
        tone: result.stateCode === 'CANCELLED' ? 'warning' : 'success',
      });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo actualizar la importación.'),
  });

  const boxAdvanceMutation = useMutation({
    mutationFn: ({ boxId, input }: { boxId: string; input: UpdateImportBoxStateInput }) =>
      advanceImportBox(boxId, input),
    onSuccess: async (result) => {
      notify({
        title: result.stateCode === 'CANCELLED' ? 'Caja cancelada' : 'Estado de caja actualizado',
        message:
          result.stateCode === 'CANCELLED'
            ? 'No se registraron cambios en inventario.'
            : `La caja ahora está en “${stateLabels[result.stateCode] ?? result.stateCode}”.`,
        tone: result.stateCode === 'CANCELLED' ? 'warning' : 'success',
      });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo actualizar la caja.'),
  });

  const receiveMutation = useMutation({
    mutationFn: ({
      boxId,
      input,
      repair,
    }: {
      boxId: string;
      input: ReceiveImportBoxInput;
      repair: boolean;
    }) =>
      repair
        ? repairZeroReceivedImportBox(boxId, input, crypto.randomUUID())
        : receiveImportBox(boxId, input, crypto.randomUUID()),
    onSuccess: async (_, variables) => {
      setReceiveDialog(null);
      notify({
        title: variables.repair ? 'Recepción corregida' : 'Caja recibida e ingresada a stock',
        message: 'Las cantidades confirmadas se reflejaron en inventario una sola vez.',
        tone: 'success',
      });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo recibir e ingresar la caja a stock.'),
  });

  const costMutation = useMutation({
    mutationFn: (input: CreateImportCostInput) => addImportCost(importId, input),
    onSuccess: async () => {
      setCostAmount('');
      setCostDescription('');
      setCostErrors({});
      notify({ title: 'Costo registrado', message: 'El costo importado fue recalculado automáticamente.', tone: 'success' });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo registrar el costo.'),
  });

  const incidentMutation = useMutation({
    mutationFn: (input: CreateImportIncidentInput) => createImportIncident(importId, input),
    onSuccess: async () => {
      setIncidentDescription('');
      setIncidentQuantity('');
      setIncidentErrors({});
      notify({ title: 'Incidencia registrada', message: 'La incidencia quedó abierta para seguimiento.', tone: 'success' });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo registrar la incidencia.'),
  });

  const allocationMutation = useMutation({
    mutationFn: () =>
      allocatePreorder({
        saleItemId: candidateSaleItemId,
        importBoxItemId: allocationItemId,
        quantity: Number(allocationQuantity),
      }),
    onSuccess: async () => {
      notify({ title: 'Preventa vinculada', message: 'La cantidad quedó reservada contra la línea de importación.', tone: 'success' });
      await refresh();
    },
    onError: (error) => notifyError(error, 'No se pudo vincular la preventa.'),
  });

  const importData = detail.data;
  const allItems = useMemo(
    () => importData?.boxes.flatMap((box) => box.items.map((item) => ({ ...item, boxId: box.id, boxCode: box.code }))) ?? [],
    [importData?.boxes],
  );
  const filteredCandidates = useMemo(() => {
    if (!allocationItemId) return support.data?.preorderCandidates ?? [];
    const selected = allItems.find((item) => item.id === allocationItemId);
    return (support.data?.preorderCandidates ?? []).filter(
      (candidate) => !selected || candidate.variantId === selected.variantId,
    );
  }, [allocationItemId, allItems, support.data?.preorderCandidates]);

  async function changeShipmentState(stateCode: ImportStateCode, label: string) {
    const values = await prompt({
      title: stateCode === 'CANCELLED' ? 'Cancelar importación completa' : `Avanzar a ${label}`,
      message:
        stateCode === 'CANCELLED'
          ? 'La cancelación incluye las cajas elegibles y no puede realizarse si existen unidades recibidas, lotes o preventas asignadas.'
          : 'Indica el motivo o la evidencia del cambio de estado.',
      fields: [
        {
          name: 'reason',
          label: 'Motivo o evidencia',
          type: 'textarea',
          required: true,
          minLength: 5,
          placeholder: 'Ej. Confirmación del operador recibida por correo…',
        },
        ...(stateCode === 'DISPATCH_CONFIRMED' || stateCode === 'SHIPPED'
          ? [{ name: 'tracking', label: 'Tracking maestro', initialValue: importData?.masterTrackingNumber ?? '' }]
          : []),
      ],
      confirmLabel: 'Revisar acción',
      tone: stateCode === 'CANCELLED' ? 'danger' : 'default',
    });
    if (!values) return;
    const accepted = await confirm({
      title: stateCode === 'CANCELLED' ? 'Confirmar cancelación' : 'Confirmar cambio de estado',
      message:
        stateCode === 'CANCELLED'
          ? '¿Confirmas cancelar la importación y todas sus cajas elegibles?'
          : `¿Confirmas avanzar la importación a “${label}”?`,
      detail:
        stateCode === 'CANCELLED'
          ? 'La operación se realizará en una sola transacción. Si una caja no puede cancelarse, no se cambiará nada.'
          : 'El cambio quedará registrado con tu usuario, fecha y motivo.',
      confirmLabel: stateCode === 'CANCELLED' ? 'Sí, cancelar importación' : 'Sí, avanzar',
      tone: stateCode === 'CANCELLED' ? 'danger' : 'default',
    });
    if (!accepted) {
      notify({ title: 'Acción cancelada', message: 'No se modificó la importación.', tone: 'info' });
      return;
    }
    advanceMutation.mutate({
      nextStateCode: stateCode,
      reason: values.reason.trim(),
      occurredAt: new Date().toISOString(),
      masterTrackingNumber: values.tracking?.trim() || null,
    });
  }

  async function changeBoxState(
    box: ImportDetail['boxes'][number],
    stateCode: ImportBoxStateCode,
    label: string,
  ) {
    const values = await prompt({
      title: stateCode === 'CANCELLED' ? `Cancelar ${box.code}` : `Actualizar ${box.code}`,
      message:
        stateCode === 'CANCELLED'
          ? 'No se podrá cancelar si existen unidades recibidas, lotes o preventas asignadas.'
          : `La caja avanzará a “${label}”.`,
      fields: [
        {
          name: 'reason',
          label: 'Motivo o evidencia',
          type: 'textarea',
          required: true,
          minLength: 5,
        },
        ...(stateCode === 'DISPATCH_CONFIRMED' || stateCode === 'SHIPPED'
          ? [{ name: 'tracking', label: 'Tracking de caja', initialValue: box.trackingNumber ?? '' }]
          : []),
      ],
      confirmLabel: 'Revisar acción',
      tone: stateCode === 'CANCELLED' ? 'danger' : 'default',
    });
    if (!values) return;
    const accepted = await confirm({
      title: stateCode === 'CANCELLED' ? 'Confirmar cancelación de caja' : 'Confirmar estado de caja',
      message:
        stateCode === 'CANCELLED'
          ? `¿Confirmas cancelar ${box.code}?`
          : `¿Confirmas avanzar ${box.code} a “${label}”?`,
      detail: 'El cambio quedará auditado y no se ejecutará parcialmente.',
      confirmLabel: stateCode === 'CANCELLED' ? 'Sí, cancelar caja' : 'Sí, avanzar',
      tone: stateCode === 'CANCELLED' ? 'danger' : 'default',
    });
    if (!accepted) {
      notify({ title: 'Acción cancelada', message: `No se modificó ${box.code}.`, tone: 'info' });
      return;
    }
    boxAdvanceMutation.mutate({
      boxId: box.id,
      input: {
        nextStateCode: stateCode,
        reason: values.reason.trim(),
        occurredAt: new Date().toISOString(),
        trackingNumber: values.tracking?.trim() || null,
      },
    });
  }

  function openReceive(box: ImportDetail['boxes'][number], repair = false) {
    setReceiveDialog({
      box,
      repair,
      quantities: Object.fromEntries(
        box.items.map((item) => [item.id, String(item.expectedQuantity)]),
      ),
      notes: Object.fromEntries(box.items.map((item) => [item.id, ''])),
      reason: repair
        ? 'Corrección de caja ingresada a stock sin cantidades recibidas'
        : `Recepción física completa de ${box.code}`,
      errors: {},
    });
  }

  async function submitReceive(event: FormEvent) {
    event.preventDefault();
    if (!receiveDialog) return;
    const errors: Record<string, string> = {};
    let total = 0;
    for (const item of receiveDialog.box.items) {
      const value = Number(receiveDialog.quantities[item.id]);
      if (!Number.isInteger(value) || value < 0 || value > item.expectedQuantity) {
        errors[item.id] = `Ingresa un entero entre 0 y ${item.expectedQuantity}.`;
      } else {
        total += value;
      }
    }
    if (total <= 0) errors.total = 'No puedes finalizar una caja con cero unidades recibidas.';
    if (receiveDialog.reason.trim().length < 5) errors.reason = 'El motivo debe tener al menos 5 caracteres.';
    if (Object.keys(errors).length > 0) {
      setReceiveDialog({ ...receiveDialog, errors });
      return;
    }
    const accepted = await confirm({
      title: receiveDialog.repair ? 'Confirmar corrección histórica' : 'Confirmar recepción e ingreso a stock',
      message: `Se registrarán ${total} unidades recibidas de ${receiveDialog.box.items.reduce((sum, item) => sum + item.expectedQuantity, 0)} esperadas.`,
      detail:
        total < receiveDialog.box.items.reduce((sum, item) => sum + item.expectedQuantity, 0)
          ? 'El sistema abrirá incidencias por los faltantes y solo ingresará las cantidades confirmadas.'
          : 'La recepción, los lotes y el movimiento de inventario se crearán en una sola transacción.',
      confirmLabel: receiveDialog.repair ? 'Corregir e ingresar stock' : 'Recibir e ingresar stock',
      tone: receiveDialog.repair ? 'danger' : 'default',
    });
    if (!accepted) return;
    receiveMutation.mutate({
      boxId: receiveDialog.box.id,
      repair: receiveDialog.repair,
      input: {
        reason: receiveDialog.reason.trim(),
        occurredAt: new Date().toISOString(),
        items: receiveDialog.box.items.map((item) => ({
          importBoxItemId: item.id,
          receivedQuantity: Number(receiveDialog.quantities[item.id]),
          notes: receiveDialog.notes[item.id]?.trim() || null,
        })),
      },
    });
  }

  function submitCost(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const amount = Number(costAmount);
    const exchangeRate = costCurrency === 'PEN' ? 1 : Number(costExchangeRate);
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'El importe debe ser mayor que cero.';
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) errors.exchangeRate = 'Ingresa un tipo de cambio válido.';
    setCostErrors(errors);
    if (Object.keys(errors).length > 0) return;
    costMutation.mutate({
      importBoxId: costBoxId || null,
      costType,
      description: costDescription.trim() || null,
      amount,
      currencyCode: costCurrency,
      exchangeRateToPen: exchangeRate,
      allocationMethod: 'BY_QUANTITY',
      isIncludedInUnitCost: true,
      occurredAt: new Date().toISOString(),
    });
  }

  function submitIncident(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (incidentDescription.trim().length < 3) errors.description = 'Describe qué ocurrió con al menos 3 caracteres.';
    if (incidentQuantity) {
      const value = Number(incidentQuantity);
      if (!Number.isInteger(value) || value <= 0) errors.quantity = 'La cantidad afectada debe ser un entero mayor que cero.';
    }
    setIncidentErrors(errors);
    if (Object.keys(errors).length > 0) return;
    incidentMutation.mutate({
      importBoxId: incidentBoxId || null,
      importBoxItemId: incidentItemId || null,
      incidentType,
      affectedQuantity: incidentQuantity ? Number(incidentQuantity) : null,
      description: incidentDescription.trim(),
      occurredAt: new Date().toISOString(),
    });
  }

  async function addClaim(incident: ImportDetail['incidents'][number]) {
    const values = await prompt({
      title: 'Registrar reclamo al seguro',
      message: `Incidencia: ${incident.description}`,
      fields: [
        { name: 'claimNumber', label: 'Número de reclamo' },
        { name: 'amount', label: 'Monto reclamado', type: 'number', required: true, min: 0.01, step: 0.01 },
        { name: 'currency', label: 'Moneda', type: 'select', initialValue: 'PEN', options: (support.data?.currencies ?? []).map((currency) => ({ value: currency.code, label: `${currency.code} · ${currency.name}` })) },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ],
      confirmLabel: 'Registrar reclamo',
    });
    if (!values) return;
    try {
      await createInsuranceClaim(importId, {
        importIncidentId: incident.id,
        claimNumber: values.claimNumber.trim() || null,
        claimedAmount: Number(values.amount),
        currencyCode: values.currency,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        notes: values.notes.trim() || null,
      });
      notify({ title: 'Reclamo registrado', tone: 'success' });
      await refresh();
    } catch (error) {
      notifyError(error, 'No se pudo registrar el reclamo al seguro.');
    }
  }

  async function resolveClaim(claimId: string, currentStatus: string) {
    const values = await prompt({
      title: 'Actualizar reclamo al seguro',
      fields: [
        {
          name: 'status',
          label: 'Nuevo estado',
          type: 'select',
          initialValue: currentStatus,
          options: Object.entries(claimLabels).map(([value, label]) => ({ value, label })),
        },
        { name: 'approvedAmount', label: 'Monto aprobado', type: 'number', min: 0, step: 0.01 },
        { name: 'notes', label: 'Resolución o explicación', type: 'textarea', required: true, minLength: 3 },
      ],
      confirmLabel: 'Actualizar reclamo',
    });
    if (!values) return;
    try {
      await updateInsuranceClaim(claimId, {
        status: values.status as 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'PAID' | 'CLOSED',
        approvedAmount: values.approvedAmount ? Number(values.approvedAmount) : null,
        resolutionNotes: values.notes.trim(),
      });
      notify({ title: 'Reclamo actualizado', tone: 'success' });
      await refresh();
    } catch (error) {
      notifyError(error, 'No se pudo actualizar el reclamo.');
    }
  }

  if (detail.isLoading) return <main className="page"><div className="empty-state">Cargando importación…</div></main>;
  if (detail.isError || !importData) {
    return <main className="page"><button className="link-button" type="button" onClick={() => navigate('/importaciones')}><ArrowLeft size={16} /> Volver a importaciones</button><div className="alert alert-error">No se pudo cargar la importación.</div></main>;
  }

  const shipmentTransitions = importData.allowedTransitions.filter((transition) => transition.stateCode !== 'STOCKED');
  const nextShipment = shipmentTransitions.find((transition) => transition.stateCode !== 'CANCELLED');
  const canCancelShipment = shipmentTransitions.some((transition) => transition.stateCode === 'CANCELLED');
  const currentShipmentIndex = shipmentFlow.indexOf(importData.stateCode);

  return (
    <main className="page import-detail-page">
      <button className="link-button" type="button" onClick={() => navigate('/importaciones')}><ArrowLeft size={16} /> Volver a importaciones</button>
      <PageHeader
        eyebrow="Seguimiento internacional"
        title={`Importación ${importData.code}`}
        description={`${importData.supplierName ?? 'Proveedor sin asignar'} · ${importData.transportMode === 'AIR' ? 'Aéreo' : importData.transportMode === 'SEA' ? 'Marítimo' : 'Otro'} · Creada ${dateLabel(importData.createdAt)}`}
        actions={<StatusBadge tone={stateTone(importData.stateCode)}>{stateLabels[importData.stateCode]}</StatusBadge>}
      />

      <section className="summary-strip">
        <div><span>Unidades esperadas</span><strong>{importData.totals.expectedUnits}</strong></div>
        <div><span>Unidades recibidas</span><strong>{importData.totals.receivedUnits}</strong></div>
        <div><span>Compra estimada</span><strong>{money(importData.totals.purchaseValuePen)}</strong></div>
        <div><span>Costos adicionales</span><strong>{money(importData.totals.extraCostsPen)}</strong></div>
      </section>

      {importData.boxes.some(isZeroReceiptBox) ? (
        <div className="alert alert-error import-integrity-alert" role="alert">
          <AlertTriangle size={20} />
          <div><strong>Recepción incompleta detectada</strong><span>Existe una caja marcada como ingresada a stock con cero unidades recibidas. Usa “Corregir recepción” en esa caja; no crees movimientos manuales de inventario.</span></div>
        </div>
      ) : null}

      <section className="import-overview-grid">
        <Panel title="Flujo de la importación" subtitle="El ingreso a stock se completa automáticamente cuando todas las cajas fueron recibidas correctamente.">
          <div className="flow-timeline">
            {shipmentFlow.map((state, index) => (
              <div className={`flow-step ${importData.stateCode === 'CANCELLED' ? '' : index < currentShipmentIndex ? 'complete' : index === currentShipmentIndex ? 'current' : ''}`} key={state}>
                <span className="flow-step-marker">{index < currentShipmentIndex ? <Check size={13} /> : index + 1}</span>
                <div><strong>{stateLabels[state]}</strong><small>{stateHelp[state]}</small></div>
              </div>
            ))}
          </div>
          {importData.stateCode === 'CANCELLED' ? <ContextNote tone="danger">La importación está cancelada. No se ingresarán unidades a inventario.</ContextNote> : null}
        </Panel>

        <div className="import-actions-column">
          <Panel title="Siguiente acción" subtitle="Avanza solo cuando cuentes con una evidencia real.">
            {nextShipment ? <button className="button button-primary button-full" type="button" disabled={advanceMutation.isPending} onClick={() => void changeShipmentState(nextShipment.stateCode, nextShipment.name)}><Truck size={17} /> Avanzar a {nextShipment.name}</button> : importData.stateCode === 'STOCKED' ? <div className="empty-state"><PackageCheck size={32} /><strong>Flujo finalizado</strong><p>Todas las cajas fueron recibidas e ingresadas correctamente.</p></div> : <div className="empty-state">No hay un siguiente estado disponible.</div>}
            {canCancelShipment ? <button className="button button-danger button-full" type="button" onClick={() => void changeShipmentState('CANCELLED', 'Cancelada')}><X size={17} /> Cancelar importación</button> : null}
          </Panel>
          <Panel title="Datos generales">
            <dl className="detail-list compact-detail-list">
              <div><dt>Moneda y tipo de cambio</dt><dd>{importData.purchaseCurrencyCode} · {importData.purchaseCurrencyCode === 'PEN' ? '1.000000' : importData.sunatExchangeRate}</dd></div>
              <div><dt>Compra</dt><dd>{dateLabel(importData.purchaseDate)}</dd></div>
              <div><dt>Llegada estimada</dt><dd>{dateLabel(importData.estimatedArrivalDate)}</dd></div>
              <div><dt>Tracking maestro</dt><dd>{importData.masterTrackingNumber ?? 'Pendiente'}</dd></div>
              <div><dt>Preventas asignadas</dt><dd>{importData.totals.allocatedPreorders}</dd></div>
            </dl>
          </Panel>
        </div>
      </section>

      <Panel title="Cajas" subtitle="Cada caja confirma sus cantidades antes de generar lotes y movimientos de inventario.">
        <div className="import-box-list">
          {importData.boxes.map((box) => {
            const expected = box.items.reduce((sum, item) => sum + item.expectedQuantity, 0);
            const received = box.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
            const currentBoxIndex = boxFlow.indexOf(box.stateCode);
            const boxTransitions = box.allowedTransitions.filter((transition) => transition.stateCode !== 'STOCKED');
            const nextBox = boxTransitions.find((transition) => transition.stateCode !== 'CANCELLED');
            const canCancelBox = boxTransitions.some((transition) => transition.stateCode === 'CANCELLED');
            const repair = isZeroReceiptBox(box);
            return (
              <article className={`import-box-card ${repair ? 'import-box-card-error' : ''}`} key={box.id}>
                <header><div><span className="import-box-icon"><Box size={19} /></span><div><h3>{box.code}</h3><p>{box.trackingNumber ? `Tracking ${box.trackingNumber}` : 'Sin tracking'} · {box.internationalOperatorName ?? 'Sin operador internacional'}</p></div></div><StatusBadge tone={repair ? 'danger' : stateTone(box.stateCode)}>{repair ? 'Recepción inconsistente' : stateLabels[box.stateCode]}</StatusBadge></header>
                <div className="box-progress-summary"><span>Esperadas <strong>{expected}</strong></span><span>Recibidas <strong>{received}</strong></span><span>Faltantes <strong>{Math.max(0, expected - received)}</strong></span><span>Destino <strong>{[...new Set(box.items.map((item) => item.destinationWarehouseName ?? 'Pendiente'))].join(', ')}</strong></span></div>
                <div className="responsive-table-wrap"><table className="data-table compact-table"><thead><tr><th>Producto</th><th>Destino</th><th>Esperado</th><th>Recibido</th><th>Preventa</th><th>Costo</th></tr></thead><tbody>{box.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.variantName} · {item.sku}</small></td><td>{item.destinationWarehouseName ?? 'Pendiente'}</td><td>{item.expectedQuantity}</td><td>{item.receivedQuantity}</td><td>{item.preorderAllocatedQuantity}</td><td>{money(item.finalUnitCostPen ?? item.originalUnitCost * item.exchangeRateToPen)}</td></tr>)}</tbody></table></div>
                <div className="box-state-mini-flow">{boxFlow.map((state, index) => <span className={index < currentBoxIndex ? 'complete' : index === currentBoxIndex ? 'current' : ''} key={state} title={stateLabels[state]} />)}</div>
                {repair ? <ContextNote tone="danger" title="Debe corregirse antes de continuar">La caja figura finalizada, pero no se registraron cantidades ni lotes. Confirma ahora lo que realmente llegó.</ContextNote> : null}
                <footer className="import-box-actions">
                  {repair ? <button className="button button-danger" type="button" onClick={() => openReceive(box, true)}><AlertTriangle size={17} /> Corregir recepción</button> : box.canReceive || box.stateCode === 'RECEIVED_PERU' ? <button className="button button-primary" type="button" onClick={() => openReceive(box)}><ClipboardCheck size={17} /> Recibir e ingresar caja a stock</button> : null}
                  {nextBox ? <button className="button button-secondary" type="button" onClick={() => void changeBoxState(box, nextBox.stateCode, nextBox.name)}><Truck size={16} /> Avanzar a {nextBox.name}</button> : null}
                  {canCancelBox ? <button className="button button-danger" type="button" onClick={() => void changeBoxState(box, 'CANCELLED', 'Cancelada')}><X size={16} /> Cancelar caja</button> : null}
                </footer>
              </article>
            );
          })}
        </div>
      </Panel>

      <section className="import-management-grid">
        <Panel title="Registrar costo" subtitle="El tipo de cambio es 1 cuando la moneda es soles; el costo unitario se recalcula automáticamente.">
          {Object.keys(costErrors).length > 0 ? <div className="form-error-summary">Corrige los campos marcados en rojo.</div> : null}
          <form className="form-grid form-grid-2" onSubmit={submitCost} noValidate>
            <SearchableSelect label="Tipo" required value={costType} options={Object.entries(costLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setCostType(value as CreateImportCostInput['costType'])} />
            <SearchableSelect label="Caja opcional" value={costBoxId} allowClear options={importData.boxes.map((box) => ({ value: box.id, label: box.code }))} onChange={setCostBoxId} />
            <label className={`field ${costErrors.amount ? 'field-invalid' : ''}`}><span>Importe *</span><input type="number" min="0.01" step="0.01" value={costAmount} onChange={(event) => { setCostAmount(event.target.value.replace(/^0+(?=\d)/, '')); setCostErrors((current) => ({ ...current, amount: '' })); }} />{costErrors.amount ? <small className="field-error">{costErrors.amount}</small> : null}</label>
            <SearchableSelect label="Moneda" required value={costCurrency} options={(support.data?.currencies ?? []).map((currency) => ({ value: currency.code, label: `${currency.code} · ${currency.name}` }))} onChange={(value) => { setCostCurrency(value); if (value === 'PEN') setCostExchangeRate('1'); }} />
            <label className={`field ${costErrors.exchangeRate ? 'field-invalid' : ''}`}><span>Tipo de cambio a soles *</span><input type="number" min="0.000001" step="0.000001" value={costCurrency === 'PEN' ? '1' : costExchangeRate} disabled={costCurrency === 'PEN'} onChange={(event) => { setCostExchangeRate(event.target.value); setCostErrors((current) => ({ ...current, exchangeRate: '' })); }} />{costCurrency === 'PEN' ? <small>En soles siempre equivale a 1.</small> : null}{costErrors.exchangeRate ? <small className="field-error">{costErrors.exchangeRate}</small> : null}</label>
            <label className="field"><span>Descripción</span><input value={costDescription} onChange={(event) => setCostDescription(event.target.value)} /></label>
            <div className="field-span-2"><button className="button button-primary button-full" type="submit" disabled={costMutation.isPending}>{costMutation.isPending ? <BusyLabel label="Registrando…" /> : <><CircleDollarSign size={17} /> Registrar costo</>}</button></div>
          </form>
        </Panel>

        <Panel title="Registrar incidencia" subtitle="Explica qué ocurrió para que la usuaria sepa cómo resolverlo.">
          {Object.keys(incidentErrors).length > 0 ? <div className="form-error-summary">Corrige los campos marcados en rojo.</div> : null}
          <form className="form-grid form-grid-2" onSubmit={submitIncident} noValidate>
            <SearchableSelect label="Tipo" required value={incidentType} options={Object.entries(incidentLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setIncidentType(value as CreateImportIncidentInput['incidentType'])} />
            <SearchableSelect label="Caja opcional" value={incidentBoxId} allowClear options={importData.boxes.map((box) => ({ value: box.id, label: box.code }))} onChange={(value) => { setIncidentBoxId(value); setIncidentItemId(''); }} />
            <div className="field-span-2"><SearchableSelect label="Producto afectado opcional" value={incidentItemId} allowClear disabled={!incidentBoxId} placeholder={incidentBoxId ? 'Seleccionar producto' : 'Selecciona una caja primero'} options={allItems.filter((item) => item.boxId === incidentBoxId).map((item) => ({ value: item.id, label: `${item.productName} · ${item.variantName}`, description: item.sku }))} onChange={setIncidentItemId} /></div>
            <label className={`field ${incidentErrors.quantity ? 'field-invalid' : ''}`}><span>Cantidad afectada</span><input type="number" min="1" step="1" value={incidentQuantity} onChange={(event) => { setIncidentQuantity(event.target.value.replace(/^0+(?=\d)/, '')); setIncidentErrors((current) => ({ ...current, quantity: '' })); }} />{incidentErrors.quantity ? <small className="field-error">{incidentErrors.quantity}</small> : null}</label>
            <label className={`field field-span-2 ${incidentErrors.description ? 'field-invalid' : ''}`}><span>Descripción *</span><textarea rows={4} value={incidentDescription} onChange={(event) => { setIncidentDescription(event.target.value); setIncidentErrors((current) => ({ ...current, description: '' })); }} placeholder="Describe el problema, la evidencia y el siguiente paso recomendado…" />{incidentErrors.description ? <small className="field-error">{incidentErrors.description}</small> : null}</label>
            <div className="field-span-2"><button className="button button-primary button-full" type="submit" disabled={incidentMutation.isPending}>{incidentMutation.isPending ? <BusyLabel label="Registrando…" /> : <><ShieldAlert size={17} /> Registrar incidencia</>}</button></div>
          </form>
        </Panel>
      </section>

      <Panel title="Vincular preventa" subtitle="Relaciona una venta pendiente con una línea de la importación para separar unidades al recibirlas.">
        <div className="form-grid form-grid-3">
          <SearchableSelect label="Producto de la importación" value={allocationItemId} options={allItems.map((item) => ({ value: item.id, label: `${item.productName} · ${item.variantName}`, description: `${item.boxCode} · ${item.sku}` }))} onChange={(value) => { setAllocationItemId(value); setCandidateSaleItemId(''); }} />
          <SearchableSelect label="Preventa pendiente" value={candidateSaleItemId} disabled={!allocationItemId} placeholder={allocationItemId ? 'Seleccionar preventa' : 'Selecciona un producto primero'} options={filteredCandidates.map((candidate) => ({ value: candidate.saleItemId, label: `${candidate.saleCode} · ${candidate.clientName}`, description: `${candidate.productName} · ${candidate.remainingQuantity} pendientes` }))} onChange={setCandidateSaleItemId} />
          <label className="field"><span>Cantidad *</span><input type="number" min="1" step="1" value={allocationQuantity} onChange={(event) => setAllocationQuantity(event.target.value.replace(/^0+(?=\d)/, ''))} /></label>
        </div>
        <button className="button button-primary" type="button" disabled={!allocationItemId || !candidateSaleItemId || Number(allocationQuantity) <= 0 || allocationMutation.isPending} onClick={() => allocationMutation.mutate()}>{allocationMutation.isPending ? <BusyLabel label="Vinculando…" /> : <><Link2 size={17} /> Vincular preventa</>}</button>
      </Panel>

      <section className="import-lower-grid">
        <Panel title="Costos registrados" subtitle={`${importData.costs.length} costos adicionales.`}>
          <div className="record-list">{importData.costs.length === 0 ? <div className="empty-state">No hay costos adicionales.</div> : importData.costs.map((cost) => <article key={cost.id}><div><strong>{costLabels[cost.costType as CreateImportCostInput['costType']] ?? cost.costType}</strong><small>{cost.boxCode ?? 'Toda la importación'} · {cost.description ?? 'Sin descripción'}</small></div><b>{money(cost.amount, cost.currencyCode)}<small>{money(cost.amountPen)} en soles</small></b></article>)}</div>
        </Panel>

        <Panel title="Incidencias y seguros" subtitle="Problemas abiertos y su seguimiento.">
          <div className="incident-list">{importData.incidents.length === 0 ? <div className="empty-state">No hay incidencias registradas.</div> : importData.incidents.map((incident) => <article className="incident-card" key={incident.id}><header><div><strong>{incidentLabels[incident.incidentType as CreateImportIncidentInput['incidentType']] ?? incident.incidentType}</strong><small>{incident.boxCode ?? 'Importación general'} · {dateTimeLabel(incident.occurredAt)}</small></div><StatusBadge tone={incident.status === 'OPEN' ? 'warning' : 'success'}>{incident.status === 'OPEN' ? 'Abierta' : 'Resuelta'}</StatusBadge></header><p>{incident.description}</p><div className="row-actions"><button className="button button-secondary button-compact" type="button" onClick={() => void addClaim(incident)}><Plus size={14} /> Reclamo al seguro</button></div>{incident.insuranceClaims.map((claim) => <div className="insurance-claim-row" key={claim.id}><span><strong>{claim.claimNumber ?? 'Reclamo sin número'}</strong><small>{claimLabels[claim.status] ?? claim.status} · {money(claim.claimedAmount ?? 0, claim.currencyCode ?? 'PEN')}</small></span><button className="link-button" type="button" onClick={() => void resolveClaim(claim.id, claim.status)}>Actualizar</button></div>)}</article>)}</div>
        </Panel>
      </section>

      <Panel title="Historial" subtitle="Cada cambio conserva estado, fecha, responsable y motivo.">
        <div className="history-timeline">{importData.history.length === 0 ? <div className="empty-state">Aún no hay cambios registrados.</div> : importData.history.map((event) => <article key={event.id}><span className="history-marker" /><div><strong>{event.entityCode}: {event.previousStateCode ? `${stateLabels[event.previousStateCode] ?? event.previousStateCode} → ` : ''}{stateLabels[event.newStateCode] ?? event.newStateCode}</strong><p>{event.reason ?? 'Sin motivo registrado'}</p><small>{event.changedByName ?? 'Sistema'} · {dateTimeLabel(event.changedAt)}</small></div></article>)}</div>
      </Panel>

      {receiveDialog ? (
        <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceiveDialog(null); }}>
          <form className="app-modal-card modal-card-wide receive-box-modal" role="dialog" aria-modal="true" aria-labelledby="receive-box-title" onSubmit={(event) => void submitReceive(event)}>
            <header className="app-modal-header"><div><span className="eyebrow">Recepción física</span><h2 id="receive-box-title">{receiveDialog.repair ? `Corregir ${receiveDialog.box.code}` : `Recibir ${receiveDialog.box.code}`}</h2><p>Confirma cada cantidad. El sistema creará lotes, incidencias por faltantes y un único movimiento de inventario.</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setReceiveDialog(null)}><X size={20} /></button></header>
            {Object.keys(receiveDialog.errors).length > 0 ? <div className="form-error-summary" role="alert">No se pudo continuar. Corrige los campos marcados en rojo.</div> : null}
            {receiveDialog.repair ? <ContextNote tone="danger" title="Corrección excepcional">Esta opción solo repara una caja histórica que terminó en stock con cero recibidos y sin lotes. No duplica una recepción válida.</ContextNote> : <ContextNote>La cantidad sugerida coincide con lo esperado. Cámbiala si faltaron unidades o llegaron menos productos.</ContextNote>}
            <div className="receive-items-list">{receiveDialog.box.items.map((item) => <section className="receive-item-card" key={item.id}><div><strong>{item.productName}</strong><small>{item.variantName} · {item.sku} · Destino: {item.destinationWarehouseName ?? 'Pendiente'}</small></div><div className="receive-item-fields"><label className={`field ${receiveDialog.errors[item.id] ? 'field-invalid' : ''}`}><span>Esperado</span><input value={item.expectedQuantity} disabled /></label><label className={`field ${receiveDialog.errors[item.id] ? 'field-invalid' : ''}`}><span>Recibido *</span><input type="number" min="0" max={item.expectedQuantity} step="1" value={receiveDialog.quantities[item.id] ?? ''} onChange={(event) => setReceiveDialog({ ...receiveDialog, quantities: { ...receiveDialog.quantities, [item.id]: event.target.value.replace(/^0+(?=\d)/, '') }, errors: { ...receiveDialog.errors, [item.id]: '' } })} />{receiveDialog.errors[item.id] ? <small className="field-error">{receiveDialog.errors[item.id]}</small> : null}</label><label className="field receive-notes"><span>Nota de la línea</span><input value={receiveDialog.notes[item.id] ?? ''} onChange={(event) => setReceiveDialog({ ...receiveDialog, notes: { ...receiveDialog.notes, [item.id]: event.target.value } })} placeholder="Ej. Llegó una unidad con caja dañada…" /></label></div></section>)}</div>
            {receiveDialog.errors.total ? <div className="alert alert-error">{receiveDialog.errors.total}</div> : null}
            <label className={`field ${receiveDialog.errors.reason ? 'field-invalid' : ''}`}><span>Motivo de la recepción *</span><textarea rows={3} value={receiveDialog.reason} onChange={(event) => setReceiveDialog({ ...receiveDialog, reason: event.target.value, errors: { ...receiveDialog.errors, reason: '' } })} />{receiveDialog.errors.reason ? <small className="field-error">{receiveDialog.errors.reason}</small> : null}</label>
            <div className="receive-summary"><span>Esperadas <strong>{receiveDialog.box.items.reduce((sum, item) => sum + item.expectedQuantity, 0)}</strong></span><span>Se recibirán <strong>{receiveDialog.box.items.reduce((sum, item) => sum + (Number(receiveDialog.quantities[item.id]) || 0), 0)}</strong></span><span>Diferencia <strong>{receiveDialog.box.items.reduce((sum, item) => sum + item.expectedQuantity, 0) - receiveDialog.box.items.reduce((sum, item) => sum + (Number(receiveDialog.quantities[item.id]) || 0), 0)}</strong></span></div>
            <footer className="app-modal-actions"><button className="button button-secondary" type="button" onClick={() => { setReceiveDialog(null); notify({ title: 'Recepción cancelada', message: 'No se modificó el inventario.', tone: 'info' }); }}>Cancelar</button><button className={receiveDialog.repair ? 'button button-danger' : 'button button-primary'} type="submit" disabled={receiveMutation.isPending}>{receiveMutation.isPending ? <BusyLabel label="Procesando…" /> : receiveDialog.repair ? 'Corregir e ingresar stock' : 'Revisar y confirmar recepción'}</button></footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
