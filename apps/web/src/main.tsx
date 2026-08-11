import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { installDeliveryCostLock } from './app/delivery-cost-lock';
import { installDeliveryDetailCost } from './app/delivery-detail-cost';
import { installDeliveryPartnerOptions } from './app/delivery-partner-options';
import { installFinalPendingCorrections } from './app/final-pending-corrections';
import { installFinanceReportsSmartCharts } from './app/finance-reports-smart-charts';
import { installImportBoxActionClarity } from './app/import-box-action-clarity';
import { installImportDniFinalAdjustments } from './app/import-dni-final-adjustments';
import { installImportDniManagementRuntime } from './app/import-dni-management-runtime';
import { installImportFinalPolish } from './app/import-final-polish';
import { installImportInsuranceResolutionRuntime } from './app/import-insurance-resolution-runtime';
import { installImportLayoutFixes } from './app/import-layout-fixes';
import { installImportParentReceiptSync } from './app/import-parent-receipt-sync';
import { installImportReconciliationFinalFixes } from './app/import-reconciliation-final-fixes';
import { installImportSmartWorkflow } from './app/import-smart-workflow';
import { installNotificationSettingsRuntime } from './app/notification-settings-runtime';
import { installPendingWorkflowEnhancements } from './app/pending-workflow-enhancements';
import { installPostMergeReviewFixes } from './app/post-merge-review-fixes';
import { installProductionFinalPolish } from './app/production-final-polish';
import { installRuntimeUxEnhancements } from './app/runtime-ux-enhancements';
import { installSaleWizardSummaryEnhancement } from './app/sale-wizard-summary-enhancement';
import { installSettingsPartnerNavFinalFix } from './app/settings-partner-nav-final-fix';
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
installImportParentReceiptSync();
installImportLayoutFixes();
installImportSmartWorkflow();
installImportBoxActionClarity();
installImportDniManagementRuntime();
installImportDniFinalAdjustments();
installImportFinalPolish();
installImportInsuranceResolutionRuntime();
installDeliveryCostLock();
installDeliveryDetailCost();
installDeliveryPartnerOptions();
installPostMergeReviewFixes();
installSettingsPartnerNavFinalFix();
installFinanceReportsSmartCharts();
installNotificationSettingsRuntime();
installProductionFinalPolish(queryClient);

const isLocalPushHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if ('serviceWorker' in navigator && (import.meta.env.PROD || isLocalPushHost)) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
