import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Boxes, Building2, CreditCard, Plus, Tags, Users, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { CatalogItem } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import {
  createCatalogItem,
  getCatalogs,
  setCatalogItemStatus,
  type CatalogKind,
} from '../features/catalog/catalog-api';

const settingSections: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Datos del negocio', icon: Building2 },
  { label: 'Administradoras', icon: Users },
  { label: 'Almacenes', icon: Boxes },
  { label: 'Catálogos', icon: Tags },
  { label: 'Penalidades y plazos', icon: CreditCard },
  { label: 'Notificaciones', icon: Bell },
];

const catalogLabels: Record<CatalogKind, string> = {
  categories: 'Categorías',
  franchises: 'Franquicias / animes',
  brands: 'Marcas',
  'product-lines': 'Líneas o colecciones',
};

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
  const items = useMemo(() => {
    if (!catalogs.data) return [];
    if (kind === 'categories') return catalogs.data.categories;
    if (kind === 'franchises') return catalogs.data.franchises;
    if (kind === 'brands') return catalogs.data.brands;
    return catalogs.data.productLines;
  }, [catalogs.data, kind]);

  const createMutation = useMutation({
    mutationFn: () => createCatalogItem(kind, {
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
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ item, next }: { item: CatalogItem; next: boolean }) =>
      setCatalogItemStatus(kind, item.id, next, item.version ?? 1),
    onSuccess: async () => {
      setMessage('Estado actualizado.');
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!name.trim()) return;
    createMutation.mutate();
  }

  const error = createMutation.error ?? statusMutation.error;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Administración"
        title="Configuración"
        description="Reglas y catálogos editables para adaptar el sistema sin modificar el código."
      />
      <section className="settings-layout">
        <aside className="settings-nav">
          {settingSections.map(({ label, icon: Icon }) => (
            <button className={activeSection === label ? 'active' : ''} key={label} onClick={() => setActiveSection(label)}>
              <Icon size={17} />{label}
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {activeSection === 'Catálogos' ? (
            <>
              <Panel title="Catálogos de productos" subtitle="Crea y desactiva opciones que luego estarán disponibles en el formulario de productos.">
                <div className="catalog-kind-tabs">
                  {(Object.keys(catalogLabels) as CatalogKind[]).map((catalogKind) => (
                    <button
                      className={kind === catalogKind ? 'active' : ''}
                      key={catalogKind}
                      type="button"
                      onClick={() => { setKind(catalogKind); setMessage(null); }}
                    >
                      {catalogLabels[catalogKind]}
                    </button>
                  ))}
                </div>
                <form className="catalog-create-form" onSubmit={handleCreate}>
                  <label className="field"><span>Nombre *</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Nueva ${catalogLabels[kind].toLowerCase()}`} /></label>
                  {kind === 'product-lines' ? (
                    <label className="field"><span>Marca *</span><select value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="">Seleccionar marca</option>{(catalogs.data?.brands ?? []).filter((brand) => brand.isActive).map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
                  ) : null}
                  {kind === 'categories' ? (
                    <label className="field"><span>Penalidad por liberación</span><input type="number" min="0" step="0.01" value={penalty} onChange={(event) => setPenalty(event.target.value)} placeholder="Opcional" /></label>
                  ) : null}
                  <label className="field catalog-description"><span>Descripción</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción opcional" /></label>
                  <button className="button button-primary" type="submit" disabled={createMutation.isPending || !name.trim() || (kind === 'product-lines' && !brandId)}><Plus size={17} /> Crear</button>
                </form>
                {error ? <div className="alert alert-error settings-feedback">{error instanceof Error ? error.message : 'No se pudo completar la operación.'}</div> : null}
                {message ? <div className="alert alert-success settings-feedback">{message}</div> : null}
              </Panel>

              <Panel title={catalogLabels[kind]} subtitle={`${items.length} registros configurados.`}>
                <div className="catalog-list">
                  {catalogs.isLoading ? <div className="empty-state">Cargando catálogos…</div> : null}
                  {!catalogs.isLoading && items.length === 0 ? <div className="empty-state">No hay elementos en este catálogo.</div> : null}
                  {items.map((item) => (
                    <div className="catalog-list-row" key={item.id}>
                      <div><strong>{item.name}</strong><small>{item.code}{item.description ? ` · ${item.description}` : ''}</small></div>
                      <StatusBadge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
                      <button
                        className={`button button-compact ${item.isActive ? 'button-danger' : 'button-secondary'}`}
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ item, next: !item.isActive })}
                      >
                        {item.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : (
            <Panel title={activeSection} subtitle="Este bloque se conectará en las siguientes fases.">
              <div className="empty-state"><strong>Sección preparada</strong><p>La estructura visual ya está disponible. Por ahora continuamos con catálogo, productos e inventario.</p></div>
            </Panel>
          )}
        </div>
      </section>
    </main>
  );
}
