import type { SupabaseClient } from '@supabase/supabase-js';
import {
  auditLogSchema,
  dashboardSchema,
  notificationListSchema,
  notificationMutationResultSchema,
  reportDataSchema,
  reportExportResultSchema,
  type AuditLogData,
  type DashboardData,
  type NotificationList,
  type NotificationMutationResult,
  type RegisterReportExportInput,
  type ReportData,
  type ReportExportResult,
} from '@yukimi/shared';
import { z } from 'zod';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { AuditListQuery, InsightsRepository } from './insights.repository.js';

const refreshResultSchema = z.object({
  processed: z.number().int().nonnegative(),
  refreshedAt: z.string(),
});

export class SupabaseInsightsRepository implements InsightsRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async refreshNotifications(): Promise<{ processed: number; refreshedAt: string }> {
    const { data, error } = await this.client.rpc('refresh_operational_notifications_v1');
    if (error) throw mapSupabaseError(error, 'No se pudieron actualizar las alertas operativas.');
    return refreshResultSchema.parse(data);
  }

  public async getNotifications(
    limit: number,
    status?: string | undefined,
  ): Promise<NotificationList> {
    const { data, error } = await this.client.rpc('get_notifications_v1', {
      p_limit: limit,
      p_status: status ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las notificaciones.');
    return notificationListSchema.parse(data);
  }

  public async setNotificationStatus(
    notificationId: string,
    status: 'READ' | 'RESOLVED' | 'DISMISSED',
  ): Promise<NotificationMutationResult> {
    const { data, error } = await this.client.rpc('set_notification_status_v1', {
      p_notification_id: notificationId,
      p_status: status,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar la notificación.');
    return notificationMutationResultSchema.parse(data);
  }

  public async getDashboard(): Promise<DashboardData> {
    const { data, error } = await this.client.rpc('get_dashboard_v2');
    if (error) throw mapSupabaseError(error, 'No se pudo cargar el panel principal.');
    return dashboardSchema.parse(data);
  }

  public async getReports(
    startDate: string,
    endDate: string,
    warehouseId?: string | undefined,
  ): Promise<ReportData> {
    const { data, error } = await this.client.rpc('get_reports_v1', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_warehouse_id: warehouseId ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron generar los reportes.');
    return reportDataSchema.parse(data);
  }

  public async getAuditLog(query: AuditListQuery): Promise<AuditLogData> {
    const { data, error } = await this.client.rpc('get_audit_log_v1', {
      p_search: query.search ?? null,
      p_action: query.action ?? null,
      p_module: query.module ?? null,
      p_date_from: query.dateFrom ?? null,
      p_date_to: query.dateTo ?? null,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar la auditoría.');
    return auditLogSchema.parse(data);
  }

  public async registerReportExport(input: RegisterReportExportInput): Promise<ReportExportResult> {
    const { data, error } = await this.client.rpc('register_report_export_v1', { p_input: input });
    if (error)
      throw mapSupabaseError(
        error,
        'El archivo se generó, pero no se pudo registrar la exportación.',
      );
    return reportExportResultSchema.parse(data);
  }
}
