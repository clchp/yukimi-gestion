import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { CatalogItem, NotificationPreferenceInput } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { webEnv } from '../app/env';
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
  franchises: 'Franquicias / animes',
  brands: 'Marcas',
  'product-lines': 'Líneas o colecciones',
};

function reasonOrCancel(action: string): string | null {
  const reason = window.prompt(`Motivo para ${action} (mínimo 5 caracteres):`)?.trim() ?? '';
  if (reason.length < 5) return null;
  return window.confirm(`¿Confirmas ${action}? Esta acción quedará auditada.`) ? reason : null;
}

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function jsonPreview(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('Catálogos');
  const [kind, setKind] = useState<CatalogKind>('franchises');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState('');
  const [penalty, setPenalty] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const admin = useQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings });
  const capacity = useQuery({
    queryKey: ['admin-capacity'],
    queryFn: getCapacitySnapshot,
    enabled: activeSection === 'Notificaciones',
  });
  const items = useMemo(() => {
    if (!catalogs.data) return [];
    return kind === 'categories'
      ? catalogs.data.categories
      : kind === 'franchises'
        ? catalogs.data.franchises
        : kind === 'brands'
          ? catalogs.data.brands
          : catalogs.data.productLines;
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
        name,
        description: description.trim() || null,
        brandId: kind === 'product-lines' ? brandId || null : undefined,
        releasePenaltyAmount: kind === 'categories' && penalty ? Number(penalty) : undefined,
        releasePenaltyCurrency: kind === 'categories' ? 'PEN' : undefined,
      }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      setPenalty('');
      setMessage('Elemento creado correctamente.');
      await refreshAll();
    },
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
      setMessage('Catálogo actualizado.');
      await refreshAll();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setMessage('Configuración actualizada.');
      await refreshAll();
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (name.trim()) createMutation.mutate();
  }

  function editCatalog(item: CatalogItem) {
    const nextName = window.prompt('Nombre:', item.name)?.trim();
    if (!nextName) return;
    const nextDescription = window.prompt('Descripción:', item.description ?? '') ?? '';
    const nextPenalty =
      kind === 'categories'
        ? window.prompt('Penalidad por liberación (PEN):', String(item.releasePenaltyAmount ?? 0))
        : null;
    const reason = reasonOrCancel(`editar ${item.name}`);
    if (!reason) return;
    catalogMutation.mutate({
      item,
      patch: {
        name: nextName,
        description: nextDescription || null,
        releasePenaltyAmount: nextPenalty == null ? undefined : Number(nextPenalty),
      },
      reason,
    });
  }

  function toggleCatalog(item: CatalogItem) {
    const reason = reasonOrCancel(`${item.isActive ? 'desactivar' : 'reactivar'} ${item.name}`);
    if (!reason) return;
    catalogMutation.mutate({ item, patch: { isActive: !item.isActive }, reason });
  }

  function editSetting(key: string, value: unknown, version: number) {
    const raw = window.prompt(`Nuevo valor JSON para ${key}:`, JSON.stringify(value, null, 2));
    if (raw == null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setMessage('El valor debe ser JSON válido.');
      return;
    }
    const reason = reasonOrCancel(`actualizar ${key}`);
    if (!reason) return;
    actionMutation.mutate(() => updateBusinessSetting(key, { value: parsed, version, reason }));
  }

  function createWarehouse() {
    const code = window.prompt('Código del almacén:')?.trim().toUpperCase();
    if (!code) return;
    const warehouseName = window.prompt('Nombre del almacén:')?.trim();
    if (!warehouseName) return;
    const reason = reasonOrCancel(`crear el almacén ${warehouseName}`);
    if (!reason) return;
    actionMutation.mutate(() =>
      upsertWarehouse({
        code,
        name: warehouseName,
        warehouseType: 'OPERATIONAL',
        description: null,
        isVirtual: false,
        isVisibleInOperations: true,
        isActive: true,
        reason,
      }),
    );
  }

  function editWarehouse(warehouse: NonNullable<typeof admin.data>['warehouses'][number]) {
    const nextName = window.prompt('Nombre:', warehouse.name)?.trim();
    if (!nextName) return;
    const reason = reasonOrCancel(`actualizar el almacén ${warehouse.name}`);
    if (!reason) return;
    actionMutation.mutate(() => upsertWarehouse({ ...warehouse, name: nextName, reason }));
  }

  function createAccount() {
    const code = window.prompt('Código de la cuenta (ej. YAPE-1-PEN):')?.trim().toUpperCase();
    if (!code) return;
    const accountName = window.prompt('Nombre visible:')?.trim();
    if (!accountName) return;
    const type = (window.prompt('Tipo: BANK, WALLET, CASH o CREDIT_CARD:', 'WALLET') ?? '')
      .trim()
      .toUpperCase();
    if (!['BANK', 'WALLET', 'CASH', 'CREDIT_CARD'].includes(type)) return;
    const ownerName =
      window.prompt('Titular (déjalo vacío si aún no está confirmado):')?.trim() || null;
    const maskedAccountNumber = window.prompt('Número enmascarado (opcional):')?.trim() || null;
    const reason = reasonOrCancel(`crear la cuenta ${accountName}`);
    if (!reason) return;
    actionMutation.mutate(() =>
      upsertFinancialAccount({
        code,
        name: accountName,
        accountTypeCode: type as 'BANK' | 'WALLET' | 'CASH' | 'CREDIT_CARD',
        currencyCode: 'PEN',
        institutionName: null,
        maskedAccountNumber,
        ownerName,
        linkedParentAccountId: null,
        isActive: true,
        reason,
      }),
    );
  }

  function editAccount(account: NonNullable<typeof admin.data>['financialAccounts'][number]) {
    const ownerName = window.prompt('Titular:', account.ownerName ?? '')?.trim() || null;
    const maskedAccountNumber =
      window.prompt('Número enmascarado:', account.maskedAccountNumber ?? '')?.trim() || null;
    const reason = reasonOrCancel(`actualizar ${account.name}`);
    if (!reason) return;
    actionMutation.mutate(() =>
      upsertFinancialAccount({ ...account, ownerName, maskedAccountNumber, reason }),
    );
  }

  function editProfile(profile: NonNullable<typeof admin.data>['profiles'][number]) {
    const displayName = window.prompt('Nombre visible:', profile.displayName)?.trim();
    if (!displayName) return;
    const phone = window.prompt('Teléfono:', profile.phone ?? '')?.trim() || null;
    const reason = reasonOrCancel(`actualizar a ${profile.displayName}`);
    if (!reason) return;
    actionMutation.mutate(() =>
      updateAdminProfile(profile.id, {
        displayName,
        phone,
        isActive: profile.isActive,
        version: profile.version,
        reason,
      }),
    );
  }

  function toggleProfile(profile: NonNullable<typeof admin.data>['profiles'][number]) {
    const reason = reasonOrCancel(
      `${profile.isActive ? 'desactivar' : 'reactivar'} a ${profile.displayName}`,
    );
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
    if (
      !webEnv.VITE_WEB_PUSH_PUBLIC_KEY ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setMessage('Configura VITE_WEB_PUSH_PUBLIC_KEY y usa HTTPS para activar push.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setMessage('El navegador no otorgó permiso para notificaciones.');
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(webEnv.VITE_WEB_PUSH_PUBLIC_KEY) as BufferSource,
    });
    const payload = subscription.toJSON();
    if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth)
      throw new Error('La suscripción push está incompleta.');
    await registerPushSubscription({
      endpoint: payload.endpoint,
      p256dhKey: payload.keys.p256dh,
      authKey: payload.keys.auth,
      deviceName: navigator.userAgent.slice(0, 120),
    });
    setMessage('Dispositivo registrado para notificaciones push.');
    await refreshAll();
  }

  const error = createMutation.error ?? catalogMutation.error ?? actionMutation.error;
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
      {error ? (
        <div className="alert alert-error">
          {error instanceof Error ? error.message : 'No se pudo completar la operación.'}
        </div>
      ) : null}
      {message ? <div className="alert alert-info">{message}</div> : null}
      <section className="settings-layout">
        <aside className="settings-nav">
          {settingSections.map(({ label, icon: Icon }) => (
            <button
              className={activeSection === label ? 'active' : ''}
              key={label}
              onClick={() => {
                setActiveSection(label);
                setMessage(null);
              }}
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
              subtitle="Los datos legales reales no se inventan: completa RUC, razón social y dirección cuando estén confirmados."
            >
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
                        className="button button-secondary button-compact"
                        onClick={() => editSetting(setting.key, setting.value, setting.version)}
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
              subtitle="Gestiona nombres, teléfono y acceso activo. Los cambios sensibles exigen motivo."
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
                    <div>
                      <button
                        className="button button-secondary button-compact"
                        onClick={() => editProfile(profile)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        className="button button-compact button-danger"
                        onClick={() => toggleProfile(profile)}
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
              subtitle="Incluye almacenes operativos, virtuales, internacionales y de tránsito."
            >
              <button className="button button-primary" onClick={createWarehouse}>
                <Plus size={17} /> Nuevo almacén
              </button>
              <div className="catalog-list">
                {admin.data?.warehouses.map((warehouse) => (
                  <div className="catalog-list-row" key={warehouse.id}>
                    <div>
                      <strong>{warehouse.name}</strong>
                      <small>
                        {warehouse.code} · {warehouse.warehouseType}
                        {warehouse.isVirtual ? ' · virtual' : ''}
                      </small>
                    </div>
                    <StatusBadge tone={warehouse.isActive ? 'success' : 'neutral'}>
                      {warehouse.isActive ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => editWarehouse(warehouse)}
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
                      onClick={() => setKind(catalogKind)}
                    >
                      {catalogLabels[catalogKind]}
                    </button>
                  ))}
                </div>
                <form className="catalog-create-form" onSubmit={handleCreate}>
                  <label className="field">
                    <span>Nombre *</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  {kind === 'product-lines' ? (
                    <label className="field">
                      <span>Marca *</span>
                      <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                        <option value="">Seleccionar</option>
                        {catalogs.data?.brands
                          .filter((brand) => brand.isActive)
                          .map((brand) => (
                            <option value={brand.id} key={brand.id}>
                              {brand.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  {kind === 'categories' ? (
                    <label className="field">
                      <span>Penalidad PEN</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={penalty}
                        onChange={(event) => setPenalty(event.target.value)}
                      />
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
                    disabled={createMutation.isPending || !name.trim()}
                  >
                    <Plus size={17} /> Crear
                  </button>
                </form>
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
                      <div>
                        <button
                          className="button button-secondary button-compact"
                          onClick={() => editCatalog(item)}
                        >
                          Editar
                        </button>{' '}
                        <button
                          className="button button-compact button-danger"
                          onClick={() => toggleCatalog(item)}
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
              subtitle="Reglas editables sin modificar código; cada cambio requiere motivo y queda auditado."
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
                      className="button button-secondary button-compact"
                      onClick={() => editSetting(setting.key, setting.value, setting.version)}
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
              subtitle="BCP, Scotiabank, dos Yapes separados, efectivo y tarjetas. Completa titulares y números reales sin exponerlos completos."
            >
              <button className="button button-primary" onClick={createAccount}>
                <Plus size={17} /> Nueva cuenta
              </button>
              <div className="catalog-list">
                {admin.data?.financialAccounts.map((account) => (
                  <div className="catalog-list-row" key={account.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <small>
                        {account.code} · {account.accountTypeCode} ·{' '}
                        {account.ownerName ?? 'Titular pendiente'} ·{' '}
                        {account.maskedAccountNumber ?? 'Número pendiente'}
                      </small>
                    </div>
                    <StatusBadge tone={account.isActive ? 'success' : 'neutral'}>
                      {account.isActive ? 'Activa' : 'Inactiva'}
                    </StatusBadge>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => editAccount(account)}
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
                          <small>{type.description ?? type.code} · silencio 21:00–08:00</small>
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
