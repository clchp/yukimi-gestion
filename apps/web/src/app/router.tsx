import { createBrowserRouter } from 'react-router';
import { AppShell } from '../components/app-shell';
import { ProtectedRoute } from '../features/auth/protected-route';
import { RouteErrorPage } from '../pages/route-error-page';

export const router = createBrowserRouter([
  {
    path: '/iniciar-sesion',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('../pages/login-page')).LoginPage }),
  },
  {
    path: '/establecer-contrasena',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('../pages/set-password-page')).SetPasswordPage }),
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <div className="route-loading">Cargando Yukimi…</div>,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../pages/dashboard-page')).DashboardPage,
            }),
          },
          {
            path: 'ventas',
            lazy: async () => ({ Component: (await import('../pages/sales-page')).SalesPage }),
          },
          {
            path: 'ventas/nueva',
            lazy: async () => ({ Component: (await import('../pages/new-sale-page')).NewSalePage }),
          },
          {
            path: 'ventas/borradores/:draftId',
            lazy: async () => ({ Component: (await import('../pages/new-sale-page')).NewSalePage }),
          },
          {
            path: 'ventas/:saleId',
            lazy: async () => ({
              Component: (await import('../pages/sale-detail-page')).SaleDetailPage,
            }),
          },
          {
            path: 'clientes',
            lazy: async () => ({ Component: (await import('../pages/clients-page')).ClientsPage }),
          },
          {
            path: 'clientes/nuevo',
            lazy: async () => ({
              Component: (await import('../pages/client-form-page')).ClientFormPage,
            }),
          },
          {
            path: 'clientes/:clientId/editar',
            lazy: async () => ({
              Component: (await import('../pages/client-form-page')).ClientFormPage,
            }),
          },
          {
            path: 'clientes/:clientId',
            lazy: async () => ({
              Component: (await import('../pages/client-detail-page')).ClientDetailPage,
            }),
          },
          {
            path: 'productos',
            lazy: async () => ({
              Component: (await import('../pages/products-page')).ProductsPage,
            }),
          },
          {
            path: 'productos/nuevo',
            lazy: async () => ({
              Component: (await import('../pages/new-product-page')).NewProductPage,
            }),
          },
          {
            path: 'productos/:productId/editar',
            lazy: async () => ({
              Component: (await import('../pages/edit-product-page')).EditProductPage,
            }),
          },
          {
            path: 'productos/:productId',
            lazy: async () => ({
              Component: (await import('../pages/product-detail-page')).ProductDetailPage,
            }),
          },
          {
            path: 'inventario',
            lazy: async () => ({
              Component: (await import('../pages/inventory-page')).InventoryPage,
            }),
          },
          {
            path: 'entregas',
            lazy: async () => ({
              Component: (await import('../pages/deliveries-page')).DeliveriesPage,
            }),
          },
          {
            path: 'entregas/nueva',
            lazy: async () => ({
              Component: (await import('../pages/new-delivery-page')).NewDeliveryPage,
            }),
          },
          {
            path: 'entregas/:deliveryId/editar',
            lazy: async () => ({
              Component: (await import('../pages/edit-delivery-page')).EditDeliveryPage,
            }),
          },
          {
            path: 'entregas/:deliveryId',
            lazy: async () => ({
              Component: (await import('../pages/delivery-detail-page')).DeliveryDetailPage,
            }),
          },
          {
            path: 'importaciones',
            lazy: async () => ({ Component: (await import('../pages/imports-page')).ImportsPage }),
          },
          {
            path: 'importaciones/nueva',
            lazy: async () => ({
              Component: (await import('../pages/new-import-page')).NewImportPage,
            }),
          },
          {
            path: 'importaciones/:importId',
            lazy: async () => ({
              Component: (await import('../pages/import-detail-page')).ImportDetailPage,
            }),
          },
          {
            path: 'finanzas',
            lazy: async () => ({ Component: (await import('../pages/finance-page')).FinancePage }),
          },
          {
            path: 'bancos/conciliacion',
            lazy: async () => ({
              Component: (await import('../pages/reconciliation-page')).ReconciliationPage,
            }),
          },
          {
            path: 'reportes',
            lazy: async () => ({ Component: (await import('../pages/reports-page')).ReportsPage }),
          },
          {
            path: 'auditoria',
            lazy: async () => ({ Component: (await import('../pages/audit-page')).AuditPage }),
          },
          {
            path: 'configuracion',
            lazy: async () => ({
              Component: (await import('../pages/settings-page')).SettingsPage,
            }),
          },
          {
            path: '*',
            Component: RouteErrorPage,
          },
        ],
      },
    ],
  },
]);
