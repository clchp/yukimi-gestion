import type {
  AuditLogData,
  DashboardData,
  NotificationList,
  NotificationMutationResult,
  RegisterReportExportInput,
  ReportData,
  ReportExportResult,
} from '@yukimi/shared';

export interface AuditListQuery {
  search?: string | undefined;
  action?: string | undefined;
  module?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  page: number;
  pageSize: number;
}

export interface InsightsRepository {
  refreshNotifications(): Promise<{ processed: number; refreshedAt: string }>;
  getNotifications(limit: number, status?: string | undefined): Promise<NotificationList>;
  setNotificationStatus(
    notificationId: string,
    status: 'READ' | 'RESOLVED' | 'DISMISSED',
  ): Promise<NotificationMutationResult>;
  getDashboard(): Promise<DashboardData>;
  getReports(
    startDate: string,
    endDate: string,
    warehouseId?: string | undefined,
  ): Promise<ReportData>;
  getAuditLog(query: AuditListQuery): Promise<AuditLogData>;
  registerReportExport(input: RegisterReportExportInput): Promise<ReportExportResult>;
}
