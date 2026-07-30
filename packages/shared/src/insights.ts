import { z } from 'zod';

export const notificationPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;

export const notificationStatusSchema = z.enum(['NEW', 'READ', 'RESOLVED', 'DISMISSED']);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationItemSchema = z.object({
  id: z.string().uuid(),
  typeCode: z.string(),
  typeName: z.string().optional(),
  title: z.string(),
  body: z.string(),
  priority: notificationPrioritySchema,
  status: notificationStatusSchema,
  actionUrl: z.string().nullable(),
  relatedEntityType: z.string().nullable().optional(),
  relatedEntityId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const notificationMutationResultSchema = z.object({
  id: z.string().uuid(),
  status: notificationStatusSchema,
  version: z.number().int().positive(),
});
export type NotificationMutationResult = z.infer<typeof notificationMutationResultSchema>;

export const dashboardPrioritySchema = notificationItemSchema.pick({
  id: true,
  typeCode: true,
  title: true,
  body: true,
  priority: true,
  status: true,
  actionUrl: true,
  createdAt: true,
});

export const dashboardActivitySchema = z.object({
  id: z.number().int().nonnegative(),
  occurredAt: z.string(),
  actorName: z.string(),
  module: z.string(),
  action: z.string(),
  entityId: z.string().nullable(),
  reason: z.string().nullable(),
});

export const dashboardRecentSaleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  clientName: z.string(),
  totalAmount: z.number(),
  paidTotal: z.number(),
  balanceAmount: z.number(),
  paymentStateCode: z.string(),
  deliveryStateCode: z.string(),
  createdAt: z.string(),
});

export const dashboardSchema = z.object({
  businessDate: z.string(),
  summary: z.object({
    salesTodayCount: z.number().int().nonnegative(),
    salesTodayAmount: z.number(),
    confirmedPaymentsToday: z.number(),
    paymentsDueSoon: z.number().int().nonnegative(),
    overduePayments: z.number().int().nonnegative(),
    pendingDeliveries: z.number().int().nonnegative(),
    pendingReceipts: z.number().int().nonnegative(),
    lowStockVariants: z.number().int().nonnegative(),
    activeImports: z.number().int().nonnegative(),
    transitBoxes: z.number().int().nonnegative(),
    delayedImports: z.number().int().nonnegative(),
  }),
  weekly: z.array(
    z.object({
      date: z.string(),
      salesAmount: z.number(),
      collectionsAmount: z.number(),
    }),
  ),
  accounts: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      currencyCode: z.string().length(3),
      currentBalance: z.number(),
      monthInflows: z.number(),
      monthOutflows: z.number(),
      balanceAsOf: z.string().optional(),
    }),
  ),
  priorities: z.array(dashboardPrioritySchema),
  recentActivity: z.array(dashboardActivitySchema),
  recentSales: z.array(dashboardRecentSaleSchema),
});
export type DashboardData = z.infer<typeof dashboardSchema>;

export const reportWarehouseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});

export const reportDataSchema = z.object({
  generatedAt: z.string(),
  period: z.object({
    startDate: z.string(),
    endDate: z.string(),
    previousStartDate: z.string(),
    previousEndDate: z.string(),
  }),
  warehouses: z.array(reportWarehouseSchema),
  summary: z.object({
    netSales: z.number(),
    collected: z.number(),
    estimatedCost: z.number(),
    estimatedProfit: z.number(),
    averageTicket: z.number(),
    outstandingBalance: z.number(),
    salesCount: z.number().int().nonnegative(),
    unitsSold: z.number().int().nonnegative(),
    previousNetSales: z.number(),
    salesChangePercent: z.number().nullable(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      salesAmount: z.number(),
      collectionsAmount: z.number(),
      salesCount: z.number().int().nonnegative(),
    }),
  ),
  topProducts: z.array(
    z.object({
      variantId: z.string().uuid(),
      productName: z.string(),
      variantName: z.string(),
      sku: z.string(),
      units: z.number().int().nonnegative(),
      revenue: z.number(),
      cost: z.number(),
      profit: z.number(),
    }),
  ),
  categories: z.array(
    z.object({
      name: z.string(),
      units: z.number().int().nonnegative(),
      revenue: z.number(),
    }),
  ),
  topClients: z.array(
    z.object({
      clientId: z.string().uuid(),
      clientName: z.string(),
      salesCount: z.number().int().nonnegative(),
      purchased: z.number(),
      outstanding: z.number(),
    }),
  ),
  inventory: z.object({
    availableUnits: z.number().int().nonnegative(),
    reservedUnits: z.number().int().nonnegative(),
    lowStockVariants: z.number().int().nonnegative(),
    valuationPen: z.number(),
  }),
  lowStock: z.array(
    z.object({
      variantId: z.string().uuid(),
      productName: z.string(),
      variantName: z.string(),
      sku: z.string(),
      available: z.number().int(),
      minimum: z.number().int().nonnegative(),
    }),
  ),
  channels: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      salesCount: z.number().int().nonnegative(),
      amount: z.number(),
    }),
  ),
});
export type ReportData = z.infer<typeof reportDataSchema>;

export const auditItemSchema = z.object({
  id: z.number().int().nonnegative(),
  occurredAt: z.string(),
  actorName: z.string(),
  actorId: z.string().uuid().nullable(),
  module: z.string(),
  tableName: z.string(),
  action: z.string(),
  entityId: z.string().nullable(),
  reason: z.string().nullable(),
  oldValues: z.record(z.string(), z.unknown()).nullable(),
  newValues: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  requestId: z.string().nullable(),
});
export type AuditItem = z.infer<typeof auditItemSchema>;

export const auditLogSchema = z.object({
  items: z.array(auditItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  summary: z.object({
    last30Days: z.number().int().nonnegative(),
    sensitiveActions: z.number().int().nonnegative(),
    actors: z.array(z.object({ actorName: z.string(), count: z.number().int().nonnegative() })),
  }),
});
export type AuditLogData = z.infer<typeof auditLogSchema>;

export const registerReportExportSchema = z.object({
  reportType: z.string().trim().min(1).max(50),
  format: z.enum(['CSV', 'XLSX', 'PDF', 'PDF_PRINT']),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  filename: z.string().trim().min(1).max(255),
  objectPath: z.string().trim().max(500).nullable().optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
});
export type RegisterReportExportInput = z.infer<typeof registerReportExportSchema>;

export const reportExportResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  generatedAt: z.string(),
});
export type ReportExportResult = z.infer<typeof reportExportResultSchema>;
