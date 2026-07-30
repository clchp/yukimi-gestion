import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationItem } from '@yukimi/shared';
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  Search,
  Settings,
  Ship,
  ShoppingBag,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { getNotifications, setNotificationStatus } from '../features/insights/insights-api';

const navigation = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/ventas', label: 'Ventas', icon: ShoppingBag },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/productos', label: 'Productos', icon: PackageSearch },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/entregas', label: 'Entregas', icon: Truck },
  { to: '/importaciones', label: 'Importaciones', icon: Ship },
  { to: '/finanzas', label: 'Finanzas', icon: CircleDollarSign },
  { to: '/bancos/conciliacion', label: 'Bancos', icon: WalletCards },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/auditoria', label: 'Auditoría', icon: FileClock },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
];

const pageNames: Record<string, string> = {
  '/': 'Panel principal',
  '/ventas': 'Ventas',
  '/ventas/nueva': 'Nueva venta',
  '/clientes': 'Clientes',
  '/productos': 'Productos',
  '/productos/nuevo': 'Nuevo producto',
  '/inventario': 'Inventario',
  '/entregas': 'Entregas',
  '/importaciones': 'Importaciones y cajas',
  '/finanzas': 'Finanzas y bancos',
  '/bancos/conciliacion': 'Conciliación bancaria',
  '/reportes': 'Reportes',
  '/auditoria': 'Auditoría',
  '/configuracion': 'Configuración',
};

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queryClient = useQueryClient();

  const title = useMemo(() => {
    if (location.pathname.startsWith('/ventas/')) return location.pathname === '/ventas/nueva' ? 'Nueva venta' : 'Detalle de venta';
    if (location.pathname.startsWith('/clientes/')) return 'Detalle de cliente';
    if (location.pathname.startsWith('/importaciones/')) return location.pathname === '/importaciones/nueva' ? 'Nueva importación' : 'Detalle de importación';
    return pageNames[location.pathname] ?? 'Yukimi Gestión';
  }, [location.pathname]);

  const displayName = auth.currentUser?.profile.display_name ?? 'Administradora';
  const initial = displayName.slice(0, 1).toUpperCase();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications({ limit: 40 }),
    refetchInterval: 60_000,
  });
  const notificationMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'READ' | 'RESOLVED' | 'DISMISSED' }) => setNotificationStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const shown = new Set<string>(JSON.parse(sessionStorage.getItem('yukimi-shown-notifications') ?? '[]') as string[]);
    const pending = (notifications.data?.items ?? []).filter((item) => item.status === 'NEW' && (item.priority === 'HIGH' || item.priority === 'CRITICAL') && !shown.has(item.id));
    for (const item of pending.slice(0, 3)) {
      const notice = new Notification(item.title, { body: item.body, tag: item.id });
      notice.onclick = () => {
        window.focus();
        if (item.actionUrl) navigate(item.actionUrl);
      };
      shown.add(item.id);
    }
    sessionStorage.setItem('yukimi-shown-notifications', JSON.stringify([...shown]));
  }, [navigate, notifications.data]);

  function openNotification(item: NotificationItem) {
    if (item.status === 'NEW') notificationMutation.mutate({ id: item.id, status: 'READ' });
    setNotificationsOpen(false);
    if (item.actionUrl) navigate(item.actionUrl);
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === 'undefined') return;
    await Notification.requestPermission();
    await notifications.refetch();
  }

  return (
    <div className="app-layout">
      <div className={`mobile-backdrop ${menuOpen ? 'is-visible' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>雪</span></div>
          <div>
            <strong>Yukimi</strong>
            <span>Gestión administrativa</span>
          </div>
          <button className="icon-button sidebar-close mobile-only" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          <span className="nav-section-label">Operación</span>
          {navigation.slice(0, 9).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <span className="nav-section-label nav-section-spaced">Análisis y sistema</span>
          {navigation.slice(9).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-support">
          <div className="support-icon"><ClipboardList size={18} /></div>
          <div><strong>Todo bajo control</strong><span>Los cambios importantes quedan auditados.</span></div>
        </div>

        <button className="sidebar-user" onClick={() => setProfileOpen((value) => !value)}>
          <div className="avatar">{initial}</div>
          <div>
            <strong>{displayName}</strong>
            <span>Administradora</span>
          </div>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {profileOpen ? (
          <div className="profile-popover sidebar-profile-popover">
            <button type="button" onClick={() => void auth.signOut()}><LogOut size={16} /> Cerrar sesión</button>
          </div>
        ) : null}
      </aside>

      <div className="content-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-only" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="topbar-title">
              <span>Yukimi Gestión</span>
              <strong>{title}</strong>
            </div>
          </div>

          <label className="global-search desktop-search">
            <Search size={17} aria-hidden="true" />
            <input placeholder="Buscar cliente, producto, venta o caja…" />
            <kbd>⌘ K</kbd>
          </label>

          <div className="topbar-actions">
            <button className="button button-primary button-compact topbar-create" onClick={() => navigate('/ventas/nueva')}>
              <Plus size={17} /> <span>Nueva venta</span>
            </button>
            <button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => setNotificationsOpen((value) => !value)}>
              <Bell size={19} />
              {(notifications.data?.unreadCount ?? 0) > 0 ? <span className="notification-count">{Math.min(notifications.data?.unreadCount ?? 0, 99)}</span> : null}
            </button>
            <button className="topbar-profile" onClick={() => setProfileOpen((value) => !value)} aria-label="Abrir perfil">
              <span className="avatar avatar-small">{initial}</span>
              <span className="topbar-profile-copy"><strong>{displayName}</strong><small>ADMIN</small></span>
              <ChevronDown size={15} />
            </button>
            {profileOpen ? (
              <div className="profile-popover topbar-profile-popover">
                <button type="button" onClick={() => void auth.signOut()}><LogOut size={16} /> Cerrar sesión</button>
              </div>
            ) : null}
          </div>
        </header>

        {notificationsOpen ? (
          <aside className="notification-drawer" aria-label="Centro de notificaciones">
            <div className="notification-drawer-header"><div><strong>Notificaciones</strong><span>{notifications.data?.unreadCount ?? 0} sin leer</span></div><button className="icon-button" type="button" onClick={() => setNotificationsOpen(false)}><X size={18} /></button></div>
            {typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? <button className="browser-notification-prompt" type="button" onClick={() => void enableBrowserNotifications()}><Bell size={17} /><span><strong>Activar avisos del navegador</strong><small>Se mostrarán mientras Yukimi esté abierto.</small></span></button> : null}
            <div className="notification-list">
              {(notifications.data?.items ?? []).filter((item) => item.status !== 'DISMISSED' && item.status !== 'RESOLVED').map((item) => (
                <article className={`notification-card priority-${item.priority.toLowerCase()} ${item.status === 'NEW' ? 'is-new' : ''}`} key={item.id}>
                  <button className="notification-main" type="button" onClick={() => openNotification(item)}><span className="notification-priority-dot" /><span><strong>{item.title}</strong><small>{item.body}</small><time>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></span></button>
                  <div className="notification-actions"><button type="button" onClick={() => notificationMutation.mutate({ id: item.id, status: 'RESOLVED' })}><CheckCircle2 size={15} /> Resolver</button><button type="button" onClick={() => notificationMutation.mutate({ id: item.id, status: 'DISMISSED' })}>Ocultar</button></div>
                </article>
              ))}
              {notifications.isLoading ? <div className="empty-state">Cargando alertas…</div> : null}
              {!notifications.isLoading && (notifications.data?.items.filter((item) => item.status !== 'DISMISSED' && item.status !== 'RESOLVED').length ?? 0) === 0 ? <div className="empty-state"><strong>Todo al día</strong><p>No hay alertas pendientes.</p></div> : null}
            </div>
          </aside>
        ) : null}

        <Outlet />
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        {[
          { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
          { to: '/ventas', label: 'Ventas', icon: ShoppingBag },
          { to: '/ventas/nueva', label: 'Crear', icon: Plus, action: true },
          { to: '/inventario', label: 'Stock', icon: Boxes },
          { to: '/finanzas', label: 'Finanzas', icon: HandCoins },
        ].map(({ to, label, icon: Icon, end, action }) => (
          <NavLink key={to} to={to} end={end ?? false} className={({ isActive }) => `${isActive ? 'active' : ''} ${action ? 'mobile-primary-action' : ''}`.trim()}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
