import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem, NotificationPreferenceInput } from '@yukimi/shared';
import {
  Bell,
  Boxes,
  Building2,
  CreditCard,
  Landmark,
  Plus,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { webEnv } from '../app/env';
import { BusyLabel, friendlyError, useFeedback } from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import { StatusBadge } from '../components/ui/status-badge';
import {
  getAdminSettings,
  getCapacitySnapshot,
  registerPushSubscription,
  updateAdminProfile,
  updateBusinessSetting,
  upsertFinancialAccount,
  upsertNotificationPreference,
  upsertWarehouse,
} from '../features/admin/admin-api';
import {
  createCatalogItem,
  getCatalogs,
  updateCatalogItem,
  type CatalogKind,
} from '../features/catalog/catalog-api';

const settingSections: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Datos del negocio', icon: Building2 },
  { label: 'Administradoras', icon: Users },
  { label: 'Almacenes', icon: Boxes },
  { label: 'Catálogos', icon: Tags },
  { label: 'Penalidades y plazos', icon: CreditCard },
  { label: 'Finanzas y cuentas', icon: Landmark },
  { label: 'Notificaciones', icon: Bell },
];

const catalogLabels: Record<CatalogKind, string> = {
  categories: 'Categorías',
  franchises: 'Franquicias o animes',
  brands: 'Marcas',
  'product-lines': 'Líneas o colecciones',
};

const warehouseTypeLabels: Record<string, string> = {
  OPERATIONAL: 'Operativo',
  VIRTUAL: 'Virtual',
  INTERNATIONAL: 'Internacional',
  TRANSIT: 'En tránsito',
};

const accountTypeLabels: Record<string, string> = {
  BANK: 'Cuenta bancaria',
  WALLET: 'Billetera digital',
  CASH: 'Efectivo',
  CREDIT_CARD: 'Tarjeta de crédito',
};

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function jsonPreview(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { confirm, notify, notifyError, prompt } = useFeedback();
  const [activeSection, setActiveSection] = useState('Catálogos');
  const [kind, setKind] = useState<CatalogKind>('franchises');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState('');
  const [penalty, setPenalty] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const admin = useQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings });
  const capacity = useQuery({
    queryKey: ['admin-capacity'],
    queryFn: getCapacitySnapshot,
    enabled: activeSection === 'Notificaciones',
  });

  const items = useMemo(() => {
    if (!catalogs.data) return [];
    const source =
      kind === 'categories'
        ? catalogs.data.categories
        : kind === 'franchises'
          ? catalogs.data.franchises
          : kind === 'brands'
            ? catalogs.data.brands
            : catalogs.data.productLines;
    return [...source].sort((left, right) =>
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base', numeric: true }),
    );
  }, [catalogs.data, kind]);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalogs'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-capacity'] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createCatalogItem(kind, {
        name: name.trim(),
        description: description.trim() || null,
        brandId: kind === 'product-lines' ? brandId || null : undefined,
        releasePenaltyAmount: kind === 'categories' && penalty.trim() ? Number(penalty) : undefined,
        releasePenaltyCurrency: kind === 'categories' ? 'PEN' : undefined,
      }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      setBrandId('');
      setPenalty('');
      setCreateErrors({});
      notify({
        title: 'Elemento creado correctamente',
        message: `El registro se añadió a ${catalogLabels[kind].toLocaleLowerCase('es-PE')}.`,
        tone: 'success',
      });
      await refreshAll();
    },
    onError: (error) => notifyError(error, 'No se pudo crear el elemento del catálogo.'),
  });

  const catalogMutation = useMutation({
    mutationFn: ({
      item,
      patch,
      reason,
    }: {
      item: CatalogItem;
      patch: Partial<CatalogItem> & { brandId?: string | null };
      reason: string;
    }) =>
      updateCatalogItem(kind, item.id, {
        name: patch.name ?? item.name,
        description: patch.description ?? item.description ?? null,
        brandId: patch.brandId,
        releasePenaltyAmount: patch.releasePenaltyAmount ?? item.releasePenaltyAmount ?? null,
        releasePenaltyCurrency:
          patch.releasePenaltyCurrency ?? item.releasePenaltyCurrency ?? 'PEN',
        isActive: patch.isActive ?? item.isActive,
        version: item.version ?? 1,
        reason,
      }),
    onSuccess: async () => {
      notify({ title: 'Catálogo actualizado', tone: 'success' });
      await refreshAll();
    },
    onError: (error) => notifyError(error, 'No se pudo actualizar el catálogo.'),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      notify({ title: 'Configuración actualizada', tone: 'success' });
      await refreshAll();
    },
    onError: (error) => notifyError(error, 'No se pudo actualizar la configuración.'),
  });

  function validateCreate() {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'El nombre es obligatorio.';
    if (kind === 'product-lines' && !brandId) errors.brandId = 'Selecciona una marca.';
    if (kind === 'categories' && penalty.trim()) {
      const value = Number(penalty);
      if (!Number.isFinite(value) || value < 0)
        errors.penalty = 'Ingresa una penalidad válida igual o mayor que cero.';
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!validateCreate()) return;
    createMutation.mutate();
  }

  async function requestReason(action: string, detail?: string) {
    const values = await prompt({
      title: 'Motivo de la modificación',
      message:
        detail ?? `Indica por qué deseas ${action}. El motivo quedará registrado en auditoría.`,
      fields: [
        {
          name: 'reason',
          label: 'Motivo',
          type: 'textarea',
          required: true,
          minLength: 5,
          placeholder: 'Describe brevemente la razón del cambio…',
        },
      ],
      confirmLabel: 'Continuar',
    });
    if (!values) return null;
    const accepted = await confirm({
      title: 'Confirmar modificación',
      message: `¿Confirmas ${action}?`,
      detail: 'Esta acción quedará registrada con tu usuario, fecha y motivo.',
      confirmLabel: 'Sí, confirmar',
    });
    return accepted ? values.reason.trim() : null;
  }

  async function editCatalog(item: CatalogItem) {
    const values = await prompt({
      title: `Editar ${item.name}`,
      message:
        'Modifica los datos necesarios en una sola ventana. Los campos marcados con * son obligatorios.',
      fields: [
        { name: 'name', label: 'Nombre', initialValue: item.name, required: true },
        {
          name: 'description',
          label: 'Descripción',
          type: 'textarea',
          initialValue: item.description ?? '',
        },
        ...(kind === 'categories'
          ? [
              {
                name: 'penalty',
                label: 'Penalidad por liberación (PEN)',
                type: 'number' as const,
                initialValue: String(item.releasePenaltyAmount ?? 0),
                min: 0,
                step: 0.01,
                help: 'Se aplica según las reglas de liberación configuradas.',
              },
            ]
          : []),
        {
          name: 'reason',
          label: 'Motivo del cambio',
          type: 'textarea',
          required: true,
          minLength: 5,
          placeholder: 'Ej. Corrección solicitada por administración',
        },
      ],
      confirmLabel: 'Revisar cambio',
      validate: (form) => {
        if (kind === 'categories' && form.penalty && Number(form.penalty) < 0) {
          return { penalty: 'La penalidad no puede ser negativa.' };
        }
        return null;
      },
    });
    if (!values) return;
    const accepted = await confirm({
      title: 'Confirmar edición',
      message: `Se actualizará “${item.name}” y el cambio quedará auditado.`,
      confirmLabel: 'Guardar cambios',
    });
    if (!accepted) {
      notify({ title: 'Edición cancelada', message: 'No se modificó el catálogo.', tone: 'info' });
      return;
    }
    catalogMutation.mutate({
      item,
      patch: {
        name: values.name.trim(),
        description: values.description.trim() || null,
        releasePenaltyAmount: kind === 'categories' ? Number(values.penalty || 0) : undefined,
      },
      reason: values.reason.trim(),
    });
  }

  async function toggleCatalog(item: CatalogItem) {
    const action = item.isActive ? 'desactivar' : 'reactivar';
    const reason = await requestReason(`${action} ${item.name}`);
    if (!reason) return;
    catalogMutation.mutate({ item, patch: { isActive: !item.isActive }, reason });
  }

  async function editSetting(key: string, value: unknown, version: number) {
    const values = await prompt({
      title: 'Editar regla del negocio',
      message: `Actualiza el valor de ${key}. Debe mantenerse en formato JSON válido.`,
      fields: [
        {
          name: 'value',
          label: 'Valor JSON',
          type: 'textarea',
          initialValue: JSON.stringify(value, null, 2),
          required: true,
          help: 'Ejemplos válidos: 10, true, "texto" o {"clave":"valor"}.',
        },
        {
          name: 'reason',
          label: 'Motivo del cambio',
          type: 'textarea',
          required: true,
          minLength: 5,
        },
      ],
      confirmLabel: 'Revisar cambio',
      validate: (form) => {
        try {
          JSON.parse(form.value);
          return null;
        } catch {
          return { value: 'El valor debe ser JSON válido.' };
        }
      },
    });
    if (!values) return;
    const accepted = await confirm({
      title: 'Confirmar regla',
      message: `Se actualizará ${key}.`,
      detail:
        'Una regla incorrecta puede afectar operaciones futuras. Revisa el valor antes de confirmar.',
      confirmLabel: 'Actualizar regla',
    });
    if (!accepted) return;
    actionMutation.mutate(() =>
      updateBusinessSetting(key, {
        value: JSON.parse(values.value) as unknown,
        version,
        reason: values.reason.trim(),
      }),
    );
  }

  async function createWarehouse() {
    const values = await prompt({
      title: 'Nuevo almacén',
      message: 'Registra la ubicación que se utilizará en movimientos e inventario.',
      fields: [
        {
          name: 'code',
          label: 'Código',
          required: true,
          placeholder: 'Ej. CAMILA',
          help: 'Usa un código corto y único.',
        },
        { name: 'name', label: 'Nombre del almacén', required: true },
        {
          name: 'warehouseType',
          label: 'Tipo',
          type: 'select',
          initialValue: 'OPERATIONAL',
          options: [
            { value: 'OPERATIONAL', label: 'Operativo' },
            { value: 'VIRTUAL', label: 'Virtual' },
            { value: 'INTERNATIONAL', label: 'Internacional' },
            { value: 'TRANSIT', label: 'En tránsito' },
          ],
          required: true,
        },
        { name: 'description', label: 'Descripción', type: 'textarea' },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true, minLength: 5 },
      ],
      confirmLabel: 'Crear almacén',
    });
    if (!values) return;
    actionMutation.mutate(() =>
      upsertWarehouse({
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        warehouseType: values.warehouseType,
        description: values.description.trim() || null,
        isVirtual: values.warehouseType === 'VIRTUAL',
        isVisibleInOperations: true,
        isActive: true,
        reason: values.reason.trim(),
      }),
    );
  }

  async function editWarehouse(warehouse: NonNullable<typeof admin.data>['warehouses'][number]) {
    const values = await prompt({
      title: `Editar ${warehouse.name}`,
      fields: [
        { name: 'name', label: 'Nombre', initialValue: warehouse.name, required: true },
        {
          name: 'reason',
          label: 'Motivo del cambio',
          type: 'textarea',
          required: true,
          minLength: 5,
        },
      ],
      confirmLabel: 'Guardar cambios',
    });
    if (!values) return;
    actionMutation.mutate(() =>
      upsertWarehouse({ ...warehouse, name: values.name.trim(), reason: values.reason.trim() }),
    );
  }

  async function createAccount() {
    const values = await prompt({
      title: 'Nueva cuenta financiera',
      message: 'No ingreses números completos sensibles; utiliza una versión enmascarada.',
      fields: [
        { name: 'code', label: 'Código', required: true, placeholder: 'Ej. YAPE-1-PEN' },
        { name: 'name', label: 'Nombre visible', required: true },
        {
          name: 'type',
          label: 'Tipo de cuenta',
          type: 'select',
          initialValue: 'WALLET',
          options: [
            { value: 'BANK', label: 'Cuenta bancaria' },
            { value: 'WALLET', label: 'Billetera digital' },
            { value: 'CASH', label: 'Efectivo' },
            { value: 'CREDIT_CARD', label: 'Tarjeta de crédito' },
          ],
          required: true,
        },
        { name: 'ownerName', label: 'Titular' },
        { name: 'maskedAccountNumber', label: 'Número enmascarado', placeholder: 'Ej. •••• 1234' },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true, minLength: 5 },
      ],
      confirmLabel: 'Crear cuenta',
    });
    if (!values) return;
    actionMutation.mutate(() =>
      upsertFinancialAccount({
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        accountTypeCode: values.type as 'BANK' | 'WALLET' | 'CASH' | 'CREDIT_CARD',
        currencyCode: 'PEN',
        institutionName: null,
        maskedAccountNumber: values.maskedAccountNumber.trim() || null,
        ownerName: values.ownerName.trim() || null,
        linkedParentAccountId: null,
        isActive: true,
        reason: values.reason.trim(),
      }),
    );
  }

  async function editAccount(account: NonNullable<typeof admin.data>['financialAccounts'][number]) {
    const values = await prompt({
      title: `Editar ${account.name}`,
      fields: [
        { name: 'ownerName', label: 'Titular', initialValue: account.ownerName ?? '' },
        {
          name: 'maskedAccountNumber',
          label: 'Número enmascarado',
          initialValue: account.maskedAccountNumber ?? '',
        },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true, minLength: 5 },
      ],
      confirmLabel: 'Guardar cambios',
    });
    if (!values) return;
    actionMutation.mutate(() =>
      upsertFinancialAccount({
        ...account,
        ownerName: values.ownerName.trim() || null,
        maskedAccountNumber: values.maskedAccountNumber.trim() || null,
        reason: values.reason.trim(),
      }),
    );
  }

  async function editProfile(profile: NonNullable<typeof admin.data>['profiles'][number]) {
    const values = await prompt({
      title: `Editar a ${profile.displayName}`,
      fields: [
        {
          name: 'displayName',
          label: 'Nombre visible',
          initialValue: profile.displayName,
          required: true,
        },
        { name: 'phone', label: 'Teléfono', initialValue: profile.phone ?? '' },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true, minLength: 5 },
      ],
      confirmLabel: 'Guardar cambios',
    });
    if (!values) return;
    actionMutation.mutate(() =>
      updateAdminProfile(profile.id, {
        displayName: values.displayName.trim(),
        phone: values.phone.trim() || null,
        isActive: profile.isActive,
        version: profile.version,
        reason: values.reason.trim(),
      }),
    );
  }

  async function toggleProfile(profile: NonNullable<typeof admin.data>['profiles'][number]) {
    const action = profile.isActive ? 'desactivar' : 'reactivar';
    const reason = await requestReason(`${action} a ${profile.displayName}`);
    if (!reason) return;
    actionMutation.mutate(() =>
      updateAdminProfile(profile.id, {
        displayName: profile.displayName,
        phone: profile.phone,
        isActive: !profile.isActive,
        version: profile.version,
        reason,
      }),
    );
  }

  function updatePreference(typeCode: string, patch: Partial<NotificationPreferenceInput>) {
    const current = admin.data?.preferences.find((item) => item.notificationTypeCode === typeCode);
    actionMutation.mutate(() =>
      upsertNotificationPreference({
        notificationTypeCode: typeCode,
        inAppEnabled: patch.inAppEnabled ?? current?.inAppEnabled ?? true,
        pushEnabled: patch.pushEnabled ?? current?.pushEnabled ?? false,
        emailEnabled: patch.emailEnabled ?? current?.emailEnabled ?? false,
        quietHoursStart: current?.quietHoursStart?.slice(0, 5) ?? '21:00',
        quietHoursEnd: current?.quietHoursEnd?.slice(0, 5) ?? '08:00',
      }),
    );
  }

  async function enablePush() {
    try {
      if (
        !webEnv.VITE_WEB_PUSH_PUBLIC_KEY ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        notify({
          title: 'Notificaciones push no disponibles',
          message:
            'Configura la clave pública de push y utiliza HTTPS antes de activar este canal.',
          tone: 'warning',
        });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        notify({
          title: 'Permiso no concedido',
          message: 'El navegador no autorizó las notificaciones para este dispositivo.',
          tone: 'warning',
        });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(webEnv.VITE_WEB_PUSH_PUBLIC_KEY) as BufferSource,
      });
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
        throw new Error('La suscripción push está incompleta.');
      }
      await registerPushSubscription({
        endpoint: payload.endpoint,
        p256dhKey: payload.keys.p256dh,
        authKey: payload.keys.auth,
        deviceName: navigator.userAgent.slice(0, 120),
      });
      notify({
        title: 'Dispositivo registrado',
        message: 'Las notificaciones push quedaron activadas.',
        tone: 'success',
      });
      await refreshAll();
    } catch (error) {
      notifyError(error, 'No se pudo activar las notificaciones push.');
    }
  }

  const loadError = catalogs.error ?? admin.error;
  const penaltySettings = (admin.data?.settings ?? []).filter((setting) =>
    /penalt|release|payment|term|due/i.test(`${setting.key} ${setting.category}`),
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Administración"
        title="Configuración"
        description="Reglas, catálogos, cuentas y canales editables con control de concurrencia y auditoría."
      />
      {loadError ? (
        <div className="alert alert-error" role="alert">
          <strong>{friendlyError(loadError).title}</strong>
          <span>{friendlyError(loadError).message}</span>
        </div>
      ) : null}
      <section className="settings-layout">
        <aside className="settings-nav" aria-label="Secciones de configuración">
          {settingSections.map(({ label, icon: Icon }) => (
            <button
              type="button"
              className={activeSection === label ? 'active' : ''}
              key={label}
              onClick={() => setActiveSection(label)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {activeSection === 'Datos del negocio' ? (
            <Panel
              title="Datos del negocio"
              subtitle="Completa únicamente información legal confirmada. Cada cambio queda auditado."
            >
              <ContextNote tone="warning">
                No inventes RUC, razón social ni dirección. Déjalos pendientes hasta contar con los
                datos reales.
              </ContextNote>
              <div className="setting-list">
                {(admin.data?.settings ?? [])
                  .filter(
                    (setting) =>
                      setting.category === 'BUSINESS' || setting.key.startsWith('business.'),
                  )
                  .map((setting) => (
                    <div key={setting.key}>
                      <div>
                        <strong>{setting.description ?? setting.key}</strong>
                        <small>
                          {setting.key} · {jsonPreview(setting.value)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary button-compact"
                        onClick={() =>
                          void editSetting(setting.key, setting.value, setting.version)
                        }
                      >
                        Editar
                      </button>
                    </div>
                  ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === 'Administradoras' ? (
            <Panel
              title="Administradoras"
              subtitle="Gestiona nombres, teléfonos y accesos. Los cambios sensibles exigen un motivo."
            >
              <div className="catalog-list">
                {admin.data?.profiles.map((profile) => (
                  <div className="catalog-list-row" key={profile.id}>
                    <div>
                      <strong>{profile.displayName}</strong>
                      <small>
                        {profile.email ?? 'Sin correo'} · {profile.phone ?? 'Sin teléfono'}
                      </small>
                    </div>
                    <StatusBadge tone={profile.isActive ? 'success' : 'neutral'}>
                      {profile.isActive ? 'Activa' : 'Inactiva'}
                    </StatusBadge>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button button-secondary button-compact"
                        onClick={() => void editProfile(profile)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="button button-compact button-danger"
                        onClick={() => void toggleProfile(profile)}
                      >
                        {profile.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === 'Almacenes' ? (
            <Panel
              title="Almacenes"
              subtitle="Ubicaciones operativas, virtuales, internacionales y de tránsito."
            >
              <button
                type="button"
                className="button button-primary"
                onClick={() => void createWarehouse()}
              >
                <Plus size={17} /> Nuevo almacén
              </button>
              <div className="catalog-list">
                {admin.data?.warehouses.map((warehouse) => (
                  <div className="catalog-list-row" key={warehouse.id}>
                    <div>
                      <strong>{warehouse.name}</strong>
                      <small>
                        {warehouse.code} ·{' '}
                        {warehouseTypeLabels[warehouse.warehouseType] ?? warehouse.warehouseType}
                        {warehouse.isVirtual ? ' · virtual' : ''}
                      </small>
                    </div>
                    <StatusBadge tone={warehouse.isActive ? 'success' : 'neutral'}>
                      {warehouse.isActive ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      onClick={() => void editWarehouse(warehouse)}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === 'Catálogos' ? (
            <>
              <Panel
                title="Catálogos de productos"
                subtitle="Crea y edita categorías, franquicias, marcas y líneas."
              >
                <div className="catalog-kind-tabs">
                  {(Object.keys(catalogLabels) as CatalogKind[]).map((catalogKind) => (
                    <button
                      className={kind === catalogKind ? 'active' : ''}
                      key={catalogKind}
                      type="button"
                      onClick={() => {
                        setKind(catalogKind);
                        setBrandId('');
                        setCreateErrors({});
                      }}
                    >
                      {catalogLabels[catalogKind]}
                    </button>
                  ))}
                </div>
                {Object.keys(createErrors).length > 0 ? (
                  <div className="form-error-summary" role="alert">
                    No se pudo crear el registro. Corrige los campos marcados en rojo.
                  </div>
                ) : null}
                <form className="catalog-create-form" onSubmit={handleCreate} noValidate>
                  <label className={`field ${createErrors.name ? 'field-invalid' : ''}`}>
                    <span>Nombre *</span>
                    <input
                      value={name}
                      aria-invalid={Boolean(createErrors.name)}
                      onChange={(event) => {
                        setName(event.target.value);
                        setCreateErrors((current) => ({ ...current, name: '' }));
                      }}
                    />
                    {createErrors.name ? (
                      <small className="field-error">{createErrors.name}</small>
                    ) : null}
                  </label>
                  {kind === 'product-lines' ? (
                    <SearchableSelect
                      label="Marca"
                      required
                      value={brandId}
                      error={createErrors.brandId}
                      placeholder="Seleccionar marca"
                      searchPlaceholder="Buscar marca…"
                      options={(catalogs.data?.brands ?? [])
                        .filter((brand) => brand.isActive)
                        .map((brand) => ({ value: brand.id, label: brand.name }))}
                      onChange={(value) => {
                        setBrandId(value);
                        setCreateErrors((current) => ({ ...current, brandId: '' }));
                      }}
                    />
                  ) : null}
                  {kind === 'categories' ? (
                    <label className={`field ${createErrors.penalty ? 'field-invalid' : ''}`}>
                      <span>Penalidad por liberación (PEN)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={penalty}
                        aria-invalid={Boolean(createErrors.penalty)}
                        onChange={(event) => {
                          setPenalty(event.target.value);
                          setCreateErrors((current) => ({ ...current, penalty: '' }));
                        }}
                      />
                      {createErrors.penalty ? (
                        <small className="field-error">{createErrors.penalty}</small>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="field catalog-description">
                    <span>Descripción</span>
                    <input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <BusyLabel label="Creando…" />
                    ) : (
                      <>
                        <Plus size={17} /> Crear
                      </>
                    )}
                  </button>
                </form>
                <small className="required-note">* Campo obligatorio</small>
              </Panel>
              <Panel
                title={catalogLabels[kind]}
                subtitle={`${items.length} registros configurados.`}
              >
                <div className="catalog-list">
                  {items.map((item) => (
                    <div className="catalog-list-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.code}
                          {item.releasePenaltyAmount != null
                            ? ` · Penalidad S/ ${item.releasePenaltyAmount}`
                            : ''}
                        </small>
                      </div>
                      <StatusBadge tone={item.isActive ? 'success' : 'neutral'}>
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </StatusBadge>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="button button-secondary button-compact"
                          onClick={() => void editCatalog(item)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="button button-compact button-danger"
                          onClick={() => void toggleCatalog(item)}
                        >
                          {item.isActive ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}

          {activeSection === 'Penalidades y plazos' ? (
            <Panel
              title="Penalidades y plazos"
              subtitle="Reglas editables sin modificar código; cada cambio exige motivo."
            >
              <div className="setting-list">
                {penaltySettings.map((setting) => (
                  <div key={setting.key}>
                    <div>
                      <strong>{setting.description ?? setting.key}</strong>
                      <small>
                        {setting.key} · {jsonPreview(setting.value)}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      onClick={() => void editSetting(setting.key, setting.value, setting.version)}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === 'Finanzas y cuentas' ? (
            <Panel
              title="Cuentas financieras"
              subtitle="Registra bancos, billeteras, efectivo y tarjetas sin exponer números completos."
            >
              <button
                type="button"
                className="button button-primary"
                onClick={() => void createAccount()}
              >
                <Plus size={17} /> Nueva cuenta
              </button>
              <div className="catalog-list">
                {admin.data?.financialAccounts.map((account) => (
                  <div className="catalog-list-row" key={account.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <small>
                        {account.code} ·{' '}
                        {accountTypeLabels[account.accountTypeCode] ?? account.accountTypeCode} ·{' '}
                        {account.ownerName ?? 'Titular pendiente'} ·{' '}
                        {account.maskedAccountNumber ?? 'Número pendiente'}
                      </small>
                    </div>
                    <StatusBadge tone={account.isActive ? 'success' : 'neutral'}>
                      {account.isActive ? 'Activa' : 'Inactiva'}
                    </StatusBadge>
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      onClick={() => void editAccount(account)}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === 'Notificaciones' ? (
            <>
              <Panel
                title="Canales de notificación"
                subtitle="Configura alertas internas, push y correo por tipo de evento."
              >
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void enablePush()}
                >
                  <Bell size={17} /> Activar push en este dispositivo
                </button>
                <div className="setting-list">
                  {admin.data?.notificationTypes.map((type) => {
                    const preference = admin.data?.preferences.find(
                      (item) => item.notificationTypeCode === type.code,
                    );
                    return (
                      <div key={type.code}>
                        <div>
                          <strong>{type.name}</strong>
                          <small>
                            {type.description ?? type.code} · horario silencioso 21:00–08:00
                          </small>
                        </div>
                        <div className="settings-status">
                          <label>
                            <input
                              type="checkbox"
                              checked={preference?.inAppEnabled ?? true}
                              onChange={(event) =>
                                updatePreference(type.code, { inAppEnabled: event.target.checked })
                              }
                            />{' '}
                            Interna
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={preference?.pushEnabled ?? false}
                              onChange={(event) =>
                                updatePreference(type.code, { pushEnabled: event.target.checked })
                              }
                            />{' '}
                            Push
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={preference?.emailEnabled ?? false}
                              onChange={(event) =>
                                updatePreference(type.code, { emailEnabled: event.target.checked })
                              }
                            />{' '}
                            Correo
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <Panel
                title="Monitoreo de capacidad"
                subtitle="Indicadores para anticipar límites de base de datos, archivos y cola de entrega."
              >
                <div className="info-grid">
                  <div>
                    <span>Eventos pendientes</span>
                    <strong>{capacity.data?.pendingOutbox ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Eventos fallidos</span>
                    <strong>{capacity.data?.failedOutbox ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Dispositivos push</span>
                    <strong>{capacity.data?.activePushSubscriptions ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Tablas controladas</span>
                    <strong>{capacity.data?.tables.length ?? '—'}</strong>
                  </div>
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
