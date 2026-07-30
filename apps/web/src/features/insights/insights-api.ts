import type {
  AuditLogData,
  DashboardData,
  NotificationList,
  NotificationMutationResult,
  RegisterReportExportInput,
  ReportData,
  ReportExportResult,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function getDashboard(): Promise<DashboardData> {
  return apiRequest<DashboardData>('/insights/dashboard');
}

export function getNotifications(
  filters: { limit?: number | undefined; status?: string | undefined } = {},
): Promise<NotificationList> {
  const params = new URLSearchParams();
  params.set('limit', String(filters.limit ?? 30));
  if (filters.status) params.set('status', filters.status);
  return apiRequest<NotificationList>(`/insights/notifications?${params.toString()}`);
}

export function setNotificationStatus(
  id: string,
  status: 'READ' | 'RESOLVED' | 'DISMISSED',
): Promise<NotificationMutationResult> {
  return apiRequest<NotificationMutationResult>(`/insights/notifications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function getReports(filters: {
  startDate: string;
  endDate: string;
  warehouseId?: string | undefined;
}): Promise<ReportData> {
  const params = new URLSearchParams({ startDate: filters.startDate, endDate: filters.endDate });
  if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
  return apiRequest<ReportData>(`/insights/reports?${params.toString()}`);
}

export function registerReportExport(
  input: RegisterReportExportInput,
): Promise<ReportExportResult> {
  return apiRequest<ReportExportResult>('/insights/reports/exports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getAuditLog(filters: {
  search?: string | undefined;
  action?: string | undefined;
  module?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<AuditLogData> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.action) params.set('action', filters.action);
  if (filters.module) params.set('module', filters.module);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 25));
  return apiRequest<AuditLogData>(`/insights/audit?${params.toString()}`);
}
