import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { installDeliveryCostLock } from './app/delivery-cost-lock';
import { installDeliveryDetailCost } from './app/delivery-detail-cost';
import { installDeliveryPartnerOptions } from './app/delivery-partner-options';
import { installFinalPendingCorrections } from './app/final-pending-corrections';
import { installImportReconciliationFinalFixes } from './app/import-reconciliation-final-fixes';
import { installPendingWorkflowEnhancements } from './app/pending-workflow-enhancements';
import { installRuntimeUxEnhancements } from './app/runtime-ux-enhancements';
import { installSaleWizardSummaryEnhancement } from './app/sale-wizard-summary-enhancement';
import { router } from './app/router';
import { FeedbackProvider } from './components/ui/feedback-provider';
import { GlobalFormValidationBridge } from './components/ui/global-form-validation-bridge';
import { AuthProvider } from './features/auth/auth-context';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor principal.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FeedbackProvider>
          <GlobalFormValidationBridge />
          <RouterProvider router={router} />
        </FeedbackProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

installFinalPendingCorrections();
installRuntimeUxEnhancements();
installPendingWorkflowEnhancements();
installSaleWizardSummaryEnhancement();
installImportReconciliationFinalFixes();
installDeliveryCostLock();
installDeliveryDetailCost();
installDeliveryPartnerOptions();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
