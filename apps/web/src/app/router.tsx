import { createBrowserRouter } from 'react-router';
import { AppShell } from '../components/app-shell';
import { ProtectedRoute } from '../features/auth/protected-route';
import { AuditPage } from '../pages/audit-page';
import { ClientDetailPage } from '../pages/client-detail-page';
import { ClientFormPage } from '../pages/client-form-page';
import { ClientsPage } from '../pages/clients-page';
import { DashboardPage } from '../pages/dashboard-page';
import { DeliveriesPage } from '../pages/deliveries-page';
import { NewDeliveryPage } from '../pages/new-delivery-page';
import { DeliveryDetailPage } from '../pages/delivery-detail-page';
import { EditDeliveryPage } from '../pages/edit-delivery-page';
import { FinancePage } from '../pages/finance-page';
import { ImportsPage } from '../pages/imports-page';
import { NewImportPage } from '../pages/new-import-page';
import { ImportDetailPage } from '../pages/import-detail-page';
import { InventoryPage } from '../pages/inventory-page';
import { LoginPage } from '../pages/login-page';
import { NewProductPage } from '../pages/new-product-page';
import { NewSalePage } from '../pages/new-sale-page';
import { ProductsPage } from '../pages/products-page';
import { ReconciliationPage } from '../pages/reconciliation-page';
import { ReportsPage } from '../pages/reports-page';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { SalesPage } from '../pages/sales-page';
import { SetPasswordPage } from '../pages/set-password-page';
import { SettingsPage } from '../pages/settings-page';

export const router = createBrowserRouter([
  { path: '/iniciar-sesion', element: <LoginPage /> },
  { path: '/establecer-contrasena', element: <SetPasswordPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'ventas', element: <SalesPage /> },
          { path: 'ventas/nueva', element: <NewSalePage /> },
          { path: 'ventas/:saleId', element: <SaleDetailPage /> },
          { path: 'clientes', element: <ClientsPage /> },
          { path: 'clientes/nuevo', element: <ClientFormPage /> },
          { path: 'clientes/:clientId/editar', element: <ClientFormPage /> },
          { path: 'clientes/:clientId', element: <ClientDetailPage /> },
          { path: 'productos', element: <ProductsPage /> },
          { path: 'productos/nuevo', element: <NewProductPage /> },
          { path: 'inventario', element: <InventoryPage /> },
          { path: 'entregas', element: <DeliveriesPage /> },
          { path: 'entregas/nueva', element: <NewDeliveryPage /> },
          { path: 'entregas/:deliveryId/editar', element: <EditDeliveryPage /> },
          { path: 'entregas/:deliveryId', element: <DeliveryDetailPage /> },
          { path: 'importaciones', element: <ImportsPage /> },
          { path: 'importaciones/nueva', element: <NewImportPage /> },
          { path: 'importaciones/:importId', element: <ImportDetailPage /> },
          { path: 'finanzas', element: <FinancePage /> },
          { path: 'bancos/conciliacion', element: <ReconciliationPage /> },
          { path: 'reportes', element: <ReportsPage /> },
          { path: 'auditoria', element: <AuditPage /> },
          { path: 'configuracion', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
