import type { RegisterReportExportInput } from '@yukimi/shared';
import type { AuditListQuery, InsightsRepository } from './insights.repository.js';

export class InsightsService {
  public constructor(private readonly repository: InsightsRepository) {}

  public async getDashboard() {
    await this.repository.refreshNotifications();
    return this.repository.getDashboard();
  }

  public async getNotifications(limit: number, status?: string | undefined) {
    await this.repository.refreshNotifications();
    return this.repository.getNotifications(limit, status);
  }

  public setNotificationStatus(notificationId: string, status: 'READ' | 'RESOLVED' | 'DISMISSED') {
    return this.repository.setNotificationStatus(notificationId, status);
  }

  public getReports(startDate: string, endDate: string, warehouseId?: string | undefined) {
    return this.repository.getReports(startDate, endDate, warehouseId);
  }

  public getAuditLog(query: AuditListQuery) {
    return this.repository.getAuditLog(query);
  }

  public registerReportExport(input: RegisterReportExportInput) {
    return this.repository.registerReportExport(input);
  }
}
