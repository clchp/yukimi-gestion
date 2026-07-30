import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldAlert,
  Star,
  UserX,
  WalletCards,
  X,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ClientAddress, ClientIncident } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import {
  createClientAddress,
  createClientIncident,
  getClient,
  getClientSupportData,
  resolveClientIncident,
  setClientStatus,
  setClientVip,
  updateClientAddress,
} from '../features/clients/clients-api';

function formatMoney(value: number, currencyCode = 'PEN') {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: currencyCode }).format(
    value,
  );
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

const incidentLabels: Record<ClientIncident['incidentType'], string> = {
  LATE_PAYMENT: 'Pago tardío',
  PENALTY: 'Penalidad',
  RELEASE: 'Liberación',
  NON_CONTACT: 'Sin contacto',
  RETURN: 'Devolución',
  OTHER: 'Otro',
};

export function ClientDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clientId } = useParams();
  const [tab, setTab] = useState<'SUMMARY' | 'ADDRESSES' | 'INCIDENTS' | 'VIP_HISTORY'>('SUMMARY');
  const [vipOpen, setVipOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ClientAddress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient(clientId!),
    enabled: Boolean(clientId),
  });
  const support = useQuery({ queryKey: ['client-support-data'], queryFn: getClientSupportData });

  const [vipReason, setVipReason] = useState('');
  const [vipCanReserve, setVipCanReserve] = useState(false);
  const [vipTerm, setVipTerm] = useState('');

  const [addressLabel, setAddressLabel] = useState('Principal');
  const [addressLine, setAddressLine] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressProvince, setAddressProvince] = useState('Lima');
  const [addressDepartment, setAddressDepartment] = useState('Lima');
  const [addressReference, setAddressReference] = useState('');
  const [addressPartner, setAddressPartner] = useState('');
  const [addressDefault, setAddressDefault] = useState(false);
  const [addressActive, setAddressActive] = useState(true);

  const [incidentType, setIncidentType] = useState<ClientIncident['incidentType']>('LATE_PAYMENT');
  const [incidentSeverity, setIncidentSeverity] = useState<ClientIncident['severity']>('MEDIUM');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentAmount, setIncidentAmount] = useState('');
  const [resolvingIncident, setResolvingIncident] = useState<ClientIncident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['client', clientId] }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
    ]);
  };

  const vipMutation = useMutation({
    mutationFn: async (isVip: boolean) => {
      if (!client.data || !clientId) throw new Error('No se pudo cargar el cliente.');
      if (vipReason.trim().length < 3) throw new Error('Escribe el motivo del cambio VIP.');
      return setClientVip(clientId, {
        isVip,
        clientVersion: client.data.version,
        reason: vipReason.trim(),
        canReserveWithoutDeposit: isVip ? vipCanReserve : false,
        paymentTermDays: isVip && vipTerm ? Number(vipTerm) : null,
        validUntil: null,
      });
    },
    onSuccess: async () => {
      setVipOpen(false);
      setVipReason('');
      await refresh();
    },
  });

  const addressMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error('No se encontró el cliente.');
      if (addressLine.trim().length < 5)
        throw new Error('La dirección debe tener al menos cinco caracteres.');
      const input = {
        label: addressLabel.trim() || 'Principal',
        addressLine: addressLine.trim(),
        district: addressDistrict.trim() || null,
        province: addressProvince.trim() || null,
        department: addressDepartment.trim() || null,
        reference: addressReference.trim() || null,
        preferredPartnerId: addressPartner || null,
        isDefault: addressDefault,
      };
      if (editingAddress) {
        return updateClientAddress(clientId, editingAddress.id, {
          ...input,
          version: editingAddress.version,
          isActive: addressActive,
        });
      }
      return createClientAddress(clientId, input);
    },
    onSuccess: async () => {
      closeAddress();
      await refresh();
    },
  });

  const incidentMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error('No se encontró el cliente.');
      return createClientIncident(clientId, {
        incidentType,
        severity: incidentSeverity,
        description: incidentDescription.trim(),
        amount: incidentAmount ? Number(incidentAmount) : null,
        currencyCode: incidentAmount ? 'PEN' : null,
      });
    },
    onSuccess: async () => {
      setIncidentOpen(false);
      setIncidentDescription('');
      setIncidentAmount('');
      await refresh();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!client.data || !clientId) throw new Error('No se pudo cargar el cliente.');
      return setClientStatus(clientId, {
        isActive: !client.data.isActive,
        version: client.data.version,
        reason: client.data.isActive
          ? 'Cliente desactivado desde su ficha'
          : 'Cliente reactivado desde su ficha',
      });
    },
    onSuccess: async () => {
      setStatusOpen(false);
      await refresh();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!resolvingIncident) throw new Error('No se seleccionó un incidente.');
      return resolveClientIncident(resolvingIncident.id, {
        version: resolvingIncident.version,
        resolutionNotes: resolutionNotes.trim(),
      });
    },
    onSuccess: async () => {
      setResolvingIncident(null);
      setResolutionNotes('');
      await refresh();
    },
  });

  const pendingMutationError =
    vipMutation.error ??
    addressMutation.error ??
    incidentMutation.error ??
    statusMutation.error ??
    resolveMutation.error;
  const visibleError =
    error ?? (pendingMutationError instanceof Error ? pendingMutationError.message : null);

  const primaryAddress = useMemo(
    () =>
      client.data?.addresses.find((address) => address.isDefault && address.isActive) ??
      client.data?.addresses.find((address) => address.isActive),
    [client.data],
  );

  function openVip() {
    if (!client.data) return;
    setVipCanReserve(client.data.vipProfile?.canReserveWithoutDeposit ?? false);
    setVipTerm(client.data.vipProfile?.paymentTermDays?.toString() ?? '');
    setVipReason('');
    setVipOpen(true);
  }

  function openAddress(address?: ClientAddress) {
    const current = address ?? null;
    setEditingAddress(current);
    setAddressLabel(current?.label ?? 'Principal');
    setAddressLine(current?.addressLine ?? '');
    setAddressDistrict(current?.district ?? '');
    setAddressProvince(current?.province ?? 'Lima');
    setAddressDepartment(current?.department ?? 'Lima');
    setAddressReference(current?.reference ?? '');
    setAddressPartner(current?.preferredPartnerId ?? '');
    setAddressDefault(current?.isDefault ?? client.data?.addresses.length === 0);
    setAddressActive(current?.isActive ?? true);
    setAddressOpen(true);
  }

  function closeAddress() {
    setAddressOpen(false);
    setEditingAddress(null);
  }

  if (client.isLoading)
    return (
      <main className="page">
        <div className="empty-state">Cargando cliente…</div>
      </main>
    );
  if (client.isError || !client.data)
    return (
      <main className="page">
        <div className="alert alert-error">
          {client.error instanceof Error ? client.error.message : 'No se encontró el cliente.'}
        </div>
      </main>
    );

  const data = client.data;

  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/clientes')}>
        <ArrowLeft size={17} /> Volver a clientes
      </button>
      <PageHeader
        title={data.fullName}
        description={`${data.code} · Cliente desde ${formatDate(data.createdAt)}`}
        actions={
          <>
            <button
              className="button button-secondary"
              onClick={() => navigate(`/clientes/${data.id}/editar`)}
            >
              <Edit3 size={17} /> Editar
            </button>
            <button className="button button-primary" onClick={openVip}>
              <Star size={17} /> Gestionar VIP
            </button>
          </>
        }
      />

      {visibleError ? <div className="alert alert-error">{visibleError}</div> : null}
      {!data.isActive ? (
        <div className="alert alert-warning">
          Este cliente está inactivo. Su historial se conserva, pero no debería usarse en ventas
          nuevas.
        </div>
      ) : null}

      <section className="client-profile-grid">
        <Panel className="profile-card">
          <div className="profile-hero">
            <span className="profile-avatar">{initials(data.fullName)}</span>
            <div>
              <h2>{data.fullName}</h2>
              {data.isVip ? (
                <StatusBadge tone="primary">
                  <Star size={12} /> Cliente VIP
                </StatusBadge>
              ) : (
                <StatusBadge>{data.isActive ? 'Cliente regular' : 'Inactivo'}</StatusBadge>
              )}
            </div>
          </div>
          <div className="contact-list">
            <div>
              <Phone size={17} />
              <span>
                <small>Celular</small>
                <strong>{data.phone ?? 'No registrado'}</strong>
              </span>
            </div>
            <div>
              <Mail size={17} />
              <span>
                <small>Correo</small>
                <strong>{data.email ?? 'No registrado'}</strong>
              </span>
            </div>
            <div>
              <MapPin size={17} />
              <span>
                <small>Dirección principal</small>
                <strong>{primaryAddress?.addressLine ?? 'No registrada'}</strong>
              </span>
            </div>
          </div>
          {data.isVip ? (
            <div className="vip-box">
              <div>
                <span>Condición VIP</span>
                <strong>Activa</strong>
              </div>
              <div>
                <span>Separación</span>
                <strong>Se negocia en cada venta</strong>
              </div>
              <div>
                <span>Plazo especial</span>
                <strong>
                  {data.vipProfile?.paymentTermDays
                    ? `${data.vipProfile.paymentTermDays} días`
                    : 'Por evaluar'}
                </strong>
              </div>
            </div>
          ) : null}
          <button
            className={`button ${data.isActive ? 'button-danger-soft' : 'button-secondary'} button-full`}
            onClick={() => setStatusOpen(true)}
          >
            {data.isActive ? (
              <>
                <UserX size={17} /> Desactivar cliente
              </>
            ) : (
              <>
                <CheckCircle2 size={17} /> Reactivar cliente
              </>
            )}
          </button>
        </Panel>
        <div className="client-kpis">
          <article>
            <span className="stat-icon stat-primary">
              <WalletCards size={19} />
            </span>
            <small>Total comprado</small>
            <strong>{formatMoney(data.stats.totalPurchased)}</strong>
            <p>{data.stats.purchaseCount} compras registradas</p>
          </article>
          <article>
            <span className="stat-icon stat-warning">
              <CalendarClock size={19} />
            </span>
            <small>Saldo pendiente</small>
            <strong>{formatMoney(data.stats.balanceAmount)}</strong>
            <p>
              {data.stats.overdueSales > 0
                ? `${data.stats.overdueSales} venta(s) vencida(s)`
                : 'Sin vencimientos'}
            </p>
          </article>
          <article>
            <span className="stat-icon stat-info">
              <ShieldAlert size={19} />
            </span>
            <small>Incidentes pendientes</small>
            <strong>{data.stats.unresolvedIncidents}</strong>
            <p>Morosidad, liberaciones o devoluciones</p>
          </article>
          <article>
            <span className="stat-icon stat-success">
              <MapPin size={19} />
            </span>
            <small>Productos acumulados</small>
            <strong>{data.stats.accumulatedUnits}</strong>
            <p>Unidades pendientes de entrega</p>
          </article>
        </div>
      </section>

      <section className="detail-tabs">
        <button className={tab === 'SUMMARY' ? 'active' : ''} onClick={() => setTab('SUMMARY')}>
          Resumen
        </button>
        <button className={tab === 'ADDRESSES' ? 'active' : ''} onClick={() => setTab('ADDRESSES')}>
          Direcciones
        </button>
        <button className={tab === 'INCIDENTS' ? 'active' : ''} onClick={() => setTab('INCIDENTS')}>
          Incumplimientos
        </button>
        <button
          className={tab === 'VIP_HISTORY' ? 'active' : ''}
          onClick={() => setTab('VIP_HISTORY')}
        >
          Historial VIP
        </button>
      </section>

      {tab === 'SUMMARY' ? (
        <section className="dashboard-grid dashboard-grid-primary">
          <Panel title="Ventas recientes" subtitle="Últimas operaciones del cliente">
            <div className="responsive-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Fecha</th>
                    <th>Total</th>
                    <th>Saldo</th>
                    <th>Pago</th>
                    <th>Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">Todavía no tiene ventas registradas.</div>
                      </td>
                    </tr>
                  ) : (
                    data.recentSales.map((sale) => (
                      <tr key={sale.id} onClick={() => navigate(`/ventas/${sale.id}`)}>
                        <td>
                          <strong>{sale.code}</strong>
                        </td>
                        <td>{formatDate(sale.createdAt)}</td>
                        <td className="numeric-cell">
                          {formatMoney(sale.totalAmount, sale.currencyCode)}
                        </td>
                        <td className="numeric-cell">
                          {formatMoney(sale.balanceAmount, sale.currencyCode)}
                        </td>
                        <td>
                          <StatusBadge tone={sale.balanceAmount <= 0 ? 'success' : 'warning'}>
                            {sale.paymentStateCode}
                          </StatusBadge>
                        </td>
                        <td>{sale.deliveryStateCode}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Notas e información" subtitle="Datos útiles para atender al cliente">
            <div className="note-card">
              <strong>Notas internas</strong>
              <p>{data.notes ?? 'No se registraron notas.'}</p>
            </div>
            <div className="note-card">
              <strong>Documento</strong>
              <p>
                {data.documentNumber
                  ? `${data.documentType ?? ''} ${data.documentNumber}`
                  : 'No registrado'}
              </p>
            </div>
            {data.incidents
              .filter((item) => !item.resolvedAt)
              .slice(0, 3)
              .map((incident) => (
                <div className="activity-row" key={incident.id}>
                  <span
                    className={`activity-marker ${incident.severity === 'HIGH' ? 'activity-danger' : 'activity-warning'}`}
                  />
                  <div>
                    <strong>{incidentLabels[incident.incidentType]}</strong>
                    <p>{incident.description}</p>
                  </div>
                  <time>{formatDate(incident.occurredAt)}</time>
                </div>
              ))}
          </Panel>
        </section>
      ) : null}

      {tab === 'ADDRESSES' ? (
        <Panel
          title="Direcciones y agencias"
          subtitle="Mantén varias direcciones y define una como principal."
          action={
            <button className="button button-primary button-compact" onClick={() => openAddress()}>
              <Plus size={16} /> Agregar dirección
            </button>
          }
        >
          <div className="address-grid">
            {data.addresses.length === 0 ? (
              <div className="empty-state">No hay direcciones registradas.</div>
            ) : (
              data.addresses.map((address) => (
                <article
                  className={`address-card ${!address.isActive ? 'is-muted' : ''}`}
                  key={address.id}
                >
                  <div className="address-card-head">
                    <div>
                      <strong>{address.label}</strong>
                      {address.isDefault ? (
                        <StatusBadge tone="primary">Principal</StatusBadge>
                      ) : null}
                    </div>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => openAddress(address)}
                    >
                      Editar
                    </button>
                  </div>
                  <p>{address.addressLine}</p>
                  <small>
                    {[address.district, address.province, address.department]
                      .filter(Boolean)
                      .join(', ') || 'Ubicación no especificada'}
                  </small>
                  <small>Agencia: {address.preferredPartnerName ?? 'Sin preferencia'}</small>
                  {address.reference ? <small>Referencia: {address.reference}</small> : null}
                </article>
              ))
            )}
          </div>
        </Panel>
      ) : null}

      {tab === 'INCIDENTS' ? (
        <Panel
          title="Incumplimientos e incidencias"
          subtitle="Registra hechos relevantes sin eliminar el historial."
          action={
            <button
              className="button button-primary button-compact"
              onClick={() => setIncidentOpen(true)}
            >
              <Plus size={16} /> Registrar incidente
            </button>
          }
        >
          <div className="incident-list">
            {data.incidents.length === 0 ? (
              <div className="empty-state">No hay incidentes registrados.</div>
            ) : (
              data.incidents.map((incident) => (
                <article
                  className={`incident-card severity-${incident.severity.toLowerCase()}`}
                  key={incident.id}
                >
                  <div>
                    <div className="incident-title">
                      <strong>{incidentLabels[incident.incidentType]}</strong>
                      <StatusBadge
                        tone={
                          incident.resolvedAt
                            ? 'success'
                            : incident.severity === 'HIGH'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {incident.resolvedAt ? 'Resuelto' : incident.severity}
                      </StatusBadge>
                    </div>
                    <p>{incident.description}</p>
                    <small>
                      {formatDate(incident.occurredAt)} · Registrado por{' '}
                      {incident.createdByName ?? 'Sistema'}
                      {incident.amount != null
                        ? ` · ${formatMoney(incident.amount, incident.currencyCode ?? 'PEN')}`
                        : ''}
                    </small>
                    {incident.resolutionNotes ? (
                      <div className="resolution-note">Resolución: {incident.resolutionNotes}</div>
                    ) : null}
                  </div>
                  {!incident.resolvedAt ? (
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => {
                        setResolvingIncident(incident);
                        setResolutionNotes('');
                      }}
                    >
                      Marcar resuelto
                    </button>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </Panel>
      ) : null}

      {tab === 'VIP_HISTORY' ? (
        <Panel
          title="Historial de condición VIP"
          subtitle="Cada concesión, actualización o retiro queda registrado."
        >
          <div className="activity-list simple-activity">
            {data.vipHistory.length === 0 ? (
              <div className="empty-state">Todavía no tiene movimientos VIP.</div>
            ) : (
              data.vipHistory.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span
                    className={`activity-marker ${item.action === 'REVOKED' ? 'activity-danger' : 'activity-primary'}`}
                  />
                  <div>
                    <strong>
                      {item.action === 'GRANTED'
                        ? 'Condición VIP otorgada'
                        : item.action === 'UPDATED'
                          ? 'Condición VIP actualizada'
                          : 'Condición VIP retirada'}
                    </strong>
                    <p>
                      {item.reason} · {item.performedByName ?? 'Sistema'}
                    </p>
                  </div>
                  <time>{formatDate(item.occurredAt)}</time>
                </div>
              ))
            )}
          </div>
        </Panel>
      ) : null}

      {vipOpen ? (
        <div className="modal-backdrop">
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              vipMutation.mutate(!data.isVip);
            }}
          >
            <div className="modal-header">
              <div>
                <small>Condición especial</small>
                <h2>{data.isVip ? 'Retirar condición VIP' : 'Convertir en cliente VIP'}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setVipOpen(false)}>
                <X />
              </button>
            </div>
            {!data.isVip ? (
              <div className="form-grid form-grid-2">
                <div className="alert alert-info field-span-2">
                  El adelanto mínimo no usa un límite fijo: se acordará según los productos de cada
                  venta.
                </div>
                <label className="field field-span-2 checkbox-field">
                  <input
                    type="checkbox"
                    checked={vipCanReserve}
                    onChange={(event) => setVipCanReserve(event.target.checked)}
                  />
                  <span>Puede negociarse una separación sin adelanto</span>
                </label>
                <label className="field">
                  <span>Plazo especial (días)</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={vipTerm}
                    onChange={(event) => setVipTerm(event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className="alert alert-warning">
                <AlertTriangle size={17} /> El historial VIP se conservará aunque retires el
                beneficio.
              </div>
            )}
            <label className="field">
              <span>Motivo *</span>
              <textarea
                rows={4}
                value={vipReason}
                onChange={(event) => setVipReason(event.target.value)}
                placeholder="Frecuencia de compras, incumplimientos u otra evaluación."
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setVipOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={vipMutation.isPending}
              >
                {vipMutation.isPending ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {addressOpen ? (
        <div className="modal-backdrop">
          <form
            className="modal-card modal-card-wide"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setError(null);
              addressMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Datos de entrega</small>
                <h2>{editingAddress ? 'Editar dirección' : 'Nueva dirección'}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeAddress}>
                <X />
              </button>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Etiqueta</span>
                <input
                  value={addressLabel}
                  onChange={(event) => setAddressLabel(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Agencia preferida</span>
                <select
                  value={addressPartner}
                  onChange={(event) => setAddressPartner(event.target.value)}
                >
                  <option value="">Sin preferencia</option>
                  {support.data?.preferredPartners.map((partner) => (
                    <option value={partner.id} key={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-span-2">
                <span>Dirección *</span>
                <input
                  value={addressLine}
                  onChange={(event) => setAddressLine(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Distrito</span>
                <input
                  value={addressDistrict}
                  onChange={(event) => setAddressDistrict(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Provincia</span>
                <input
                  value={addressProvince}
                  onChange={(event) => setAddressProvince(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Departamento</span>
                <input
                  value={addressDepartment}
                  onChange={(event) => setAddressDepartment(event.target.value)}
                />
              </label>
              <label className="field field-span-2">
                <span>Referencia</span>
                <textarea
                  rows={3}
                  value={addressReference}
                  onChange={(event) => setAddressReference(event.target.value)}
                />
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={addressDefault}
                  onChange={(event) => setAddressDefault(event.target.checked)}
                />
                <span>Dirección principal</span>
              </label>
              {editingAddress ? (
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={addressActive}
                    onChange={(event) => setAddressActive(event.target.checked)}
                  />
                  <span>Dirección activa</span>
                </label>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={closeAddress}>
                Cancelar
              </button>
              <button className="button button-primary" disabled={addressMutation.isPending}>
                {addressMutation.isPending ? 'Guardando…' : 'Guardar dirección'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {incidentOpen ? (
        <div className="modal-backdrop">
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              incidentMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Historial del cliente</small>
                <h2>Registrar incidente</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIncidentOpen(false)}>
                <X />
              </button>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Tipo</span>
                <select
                  value={incidentType}
                  onChange={(event) =>
                    setIncidentType(event.target.value as ClientIncident['incidentType'])
                  }
                >
                  {Object.entries(incidentLabels).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Severidad</span>
                <select
                  value={incidentSeverity}
                  onChange={(event) =>
                    setIncidentSeverity(event.target.value as ClientIncident['severity'])
                  }
                >
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                </select>
              </label>
              <label className="field field-span-2">
                <span>Descripción *</span>
                <textarea
                  rows={4}
                  value={incidentDescription}
                  onChange={(event) => setIncidentDescription(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Monto relacionado (opcional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={incidentAmount}
                  onChange={(event) => setIncidentAmount(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setIncidentOpen(false)}
              >
                Cancelar
              </button>
              <button className="button button-primary" disabled={incidentMutation.isPending}>
                {incidentMutation.isPending ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {resolvingIncident ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResolvingIncident(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-incident-title"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              resolveMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Seguimiento del cliente</small>
                <h2 id="resolve-incident-title">
                  Resolver {incidentLabels[resolvingIncident.incidentType]}
                </h2>
                <p>La incidencia se conserva y se añade el resultado de la gestión.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setResolvingIncident(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="note-card">
              <strong>Incidencia</strong>
              <p>{resolvingIncident.description}</p>
            </div>
            <label className="field">
              <span>Cómo se resolvió *</span>
              <textarea
                rows={4}
                minLength={3}
                maxLength={1000}
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
                required
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setResolvingIncident(null)}
              >
                Volver
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={resolveMutation.isPending}
              >
                {resolveMutation.isPending ? 'Guardando…' : 'Marcar resuelto'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statusOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <small>Operación sensible</small>
                <h2>{data.isActive ? 'Desactivar cliente' : 'Reactivar cliente'}</h2>
              </div>
              <button className="icon-button" onClick={() => setStatusOpen(false)}>
                <X />
              </button>
            </div>
            <div className="alert alert-warning">
              <AlertTriangle size={17} /> La información y el historial no se eliminarán.
            </div>
            <p>
              {data.isActive
                ? 'El cliente dejará de estar disponible para nuevas operaciones.'
                : 'El cliente volverá a estar disponible en el sistema.'}
            </p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setStatusOpen(false)}>
                Cancelar
              </button>
              <button
                className="button button-primary"
                onClick={() => statusMutation.mutate()}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? 'Procesando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
