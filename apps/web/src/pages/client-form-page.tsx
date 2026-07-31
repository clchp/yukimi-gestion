import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, UserRoundPlus } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { CreateClientInput, UpdateClientInput } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
import {
  createClient,
  getClient,
  getClientSupportData,
  updateClient,
} from '../features/clients/clients-api';

export function ClientFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clientId } = useParams();
  const isEditing = Boolean(clientId);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const client = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient(clientId!),
    enabled: isEditing,
  });
  const support = useQuery({ queryKey: ['client-support-data'], queryFn: getClientSupportData });

  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState('DNI');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [district, setDistrict] = useState('');
  const [province, setProvince] = useState('Lima');
  const [department, setDepartment] = useState('Lima');
  const [reference, setReference] = useState('');
  const [preferredPartnerId, setPreferredPartnerId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!client.data) return;
    setFullName(client.data.fullName);
    setDocumentType(client.data.documentType ?? 'DNI');
    setDocumentNumber(client.data.documentNumber ?? '');
    setPhone(client.data.phone ?? '');
    setSecondaryPhone(client.data.secondaryPhone ?? '');
    setEmail(client.data.email ?? '');
    setNotes(client.data.notes ?? '');
  }, [client.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (fullName.trim().length < 3) throw new Error('El nombre completo es obligatorio.');
      if (documentNumber.trim() && !documentType)
        throw new Error('Selecciona el tipo de documento.');
      const base = {
        fullName: fullName.trim(),
        documentType: documentNumber.trim()
          ? (documentType as 'DNI' | 'CE' | 'PASSPORT' | 'RUC' | 'OTHER')
          : null,
        documentNumber: documentNumber.trim() || null,
        phone: phone.trim() || null,
        secondaryPhone: secondaryPhone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };

      if (isEditing) {
        if (!client.data || !clientId)
          throw new Error('No se pudo cargar el cliente para editarlo.');
        const input: UpdateClientInput = { ...base, version: client.data.version };
        return updateClient(clientId, input);
      }

      const input: CreateClientInput = {
        ...base,
        address: addressLine.trim()
          ? {
              label: 'Principal',
              addressLine: addressLine.trim(),
              district: district.trim() || null,
              province: province.trim() || null,
              department: department.trim() || null,
              reference: reference.trim() || null,
              preferredPartnerId: preferredPartnerId || null,
              isDefault: true,
            }
          : null,
      };
      return createClient(input, idempotencyKeyRef.current);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clients'] }),
        queryClient.invalidateQueries({ queryKey: ['client', result.id] }),
      ]);
      navigate(`/clientes/${result.id}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    mutation.mutate(undefined, {
      onError(error) {
        setFormError(error instanceof Error ? error.message : 'No se pudo guardar el cliente.');
      },
    });
  }

  return (
    <main className="page">
      <button
        className="back-link"
        type="button"
        onClick={() => navigate(isEditing && clientId ? `/clientes/${clientId}` : '/clientes')}
      >
        <ArrowLeft size={17} /> Volver
      </button>
      <form onSubmit={submit}>
        <PageHeader
          eyebrow="Relaciones comerciales"
          title={isEditing ? 'Editar cliente' : 'Nuevo cliente'}
          description={
            isEditing
              ? 'Actualiza la información de contacto sin perder su historial.'
              : 'Registra los datos principales. El código se generará automáticamente.'
          }
          actions={
            <button
              className="button button-primary"
              type="submit"
              disabled={mutation.isPending || client.isLoading}
            >
              <Save size={17} /> {mutation.isPending ? 'Guardando…' : 'Guardar cliente'}
            </button>
          }
        />

        {formError ? <div className="alert alert-error product-form-alert">{formError}</div> : null}
        {client.isError ? (
          <div className="alert alert-error product-form-alert">No se pudo cargar el cliente.</div>
        ) : null}

        <section className="form-layout">
          <div className="form-main">
            <Panel
              title="Información personal"
              subtitle="Datos para identificar y contactar al cliente."
            >
              <div className="form-grid form-grid-2">
                <label className="field field-span-2">
                  <span>Nombre completo *</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={200}
                    placeholder="Ej. María López"
                  />
                </label>
                <label className="field">
                  <span>Tipo de documento</span>
                  <SearchableNativeSelect
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">Carné de extranjería</option>
                    <option value="PASSPORT">Pasaporte</option>
                    <option value="RUC">RUC</option>
                    <option value="OTHER">Otro</option>
                  </SearchableNativeSelect>
                </label>
                <label className="field">
                  <span>Número de documento</span>
                  <input
                    value={documentNumber}
                    onChange={(event) => setDocumentNumber(event.target.value)}
                    maxLength={30}
                  />
                </label>
                <label className="field">
                  <span>Celular</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={30}
                    placeholder="987 654 321"
                  />
                </label>
                <label className="field">
                  <span>Celular alternativo</span>
                  <input
                    value={secondaryPhone}
                    onChange={(event) => setSecondaryPhone(event.target.value)}
                    maxLength={30}
                  />
                </label>
                <label className="field field-span-2">
                  <span>Correo</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                    placeholder="cliente@correo.com"
                  />
                </label>
                <label className="field field-span-2">
                  <span>Notas internas</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Preferencias o información útil para atenderlo."
                  />
                </label>
              </div>
            </Panel>

            {!isEditing ? (
              <Panel
                title="Dirección inicial"
                subtitle="Es opcional; después podrás registrar varias direcciones."
              >
                <div className="form-grid form-grid-2">
                  <label className="field field-span-2">
                    <span>Dirección</span>
                    <input
                      value={addressLine}
                      onChange={(event) => setAddressLine(event.target.value)}
                      maxLength={300}
                      placeholder="Av., calle, número y urbanización"
                    />
                  </label>
                  <label className="field">
                    <span>Distrito</span>
                    <input
                      value={district}
                      onChange={(event) => setDistrict(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    <span>Provincia</span>
                    <input
                      value={province}
                      onChange={(event) => setProvince(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    <span>Departamento</span>
                    <input
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    <span>Agencia preferida</span>
                    <SearchableNativeSelect
                      value={preferredPartnerId}
                      onChange={(event) => setPreferredPartnerId(event.target.value)}
                    >
                      <option value="">Sin preferencia</option>
                      {support.data?.preferredPartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                    </SearchableNativeSelect>
                  </label>
                  <label className="field field-span-2">
                    <span>Referencia</span>
                    <textarea
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                </div>
              </Panel>
            ) : null}
          </div>

          <aside className="form-sidebar">
            <Panel title="Acerca del registro">
              <div className="form-help-card">
                <span className="stat-icon stat-primary">
                  <UserRoundPlus size={19} />
                </span>
                <div>
                  <strong>Historial protegido</strong>
                  <p>
                    El cliente no se eliminará físicamente. Si deja de atenderse, se marcará como
                    inactivo.
                  </p>
                </div>
              </div>
              <div className="form-help-card">
                <div>
                  <strong>Condición VIP</strong>
                  <p>Se gestiona después de crear el cliente y siempre requiere un motivo.</p>
                </div>
              </div>
            </Panel>
          </aside>
        </section>
      </form>
    </main>
  );
}
