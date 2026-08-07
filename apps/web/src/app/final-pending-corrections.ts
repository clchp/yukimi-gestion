import { installDeliveryExpenseRuntime } from './delivery-expense-runtime';
import { installDeliveryPartnersRuntime } from './delivery-partners-runtime';
import { installProductReportRuntime } from './product-report-runtime';

export function installFinalPendingCorrections() {
  installProductReportRuntime();
  installDeliveryPartnersRuntime();
  installDeliveryExpenseRuntime();
}
