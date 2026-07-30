import { z } from 'zod';

export const adminProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

export const adminWarehouseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  warehouseType: z.enum(['OPERATIONAL', 'FOREIGN', 'TRANSIT', 'OTHER']),
  description: z.string().nullable(),
  isVirtual: z.boolean(),
  isVisibleInOperations: z.boolean(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

export const adminFinancialAccountSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  accountTypeCode: z.enum(['BANK', 'WALLET', 'CASH', 'CREDIT_CARD']),
  currencyCode: z.string().length(3),
  institutionName: z.string().nullable(),
  maskedAccountNumber: z.string().nullable(),
  ownerName: z.string().nullable(),
  linkedParentAccountId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

export const editableSettingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  valueType: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  isEditable: z.boolean(),
  version: z.number().int().positive(),
});

export const adminSettingsSchema = z.object({
  profiles: z.array(adminProfileSchema),
  warehouses: z.array(adminWarehouseSchema),
  financialAccounts: z.array(adminFinancialAccountSchema),
  settings: z.array(editableSettingSchema),
  notificationTypes: z.array(
    z.object({ code: z.string(), name: z.string(), description: z.string().nullable() }),
  ),
  preferences: z.array(
    z.object({
      notificationTypeCode: z.string(),
      inAppEnabled: z.boolean(),
      pushEnabled: z.boolean(),
      emailEnabled: z.boolean(),
      quietHoursStart: z.string().nullable(),
      quietHoursEnd: z.string().nullable(),
      version: z.number().int().positive(),
    }),
  ),
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateBusinessSettingSchema = z.object({
  value: z.unknown(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});
export type UpdateBusinessSettingInput = z.infer<typeof updateBusinessSettingSchema>;

export const upsertWarehouseSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(150),
  warehouseType: z.enum(['OPERATIONAL', 'FOREIGN', 'TRANSIT', 'OTHER']),
  description: z.string().trim().max(500).nullable().optional(),
  isVirtual: z.boolean().default(false),
  isVisibleInOperations: z.boolean().default(true),
  isActive: z.boolean().default(true),
  version: z.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(5).max(500),
});
export type UpsertWarehouseInput = z.infer<typeof upsertWarehouseSchema>;

export const upsertFinancialAccountSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(150),
  accountTypeCode: z.enum(['BANK', 'WALLET', 'CASH', 'CREDIT_CARD']),
  currencyCode: z.string().length(3).default('PEN'),
  institutionName: z.string().trim().max(120).nullable().optional(),
  maskedAccountNumber: z.string().trim().max(80).nullable().optional(),
  ownerName: z.string().trim().max(150).nullable().optional(),
  linkedParentAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  version: z.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(5).max(500),
});
export type UpsertFinancialAccountInput = z.infer<typeof upsertFinancialAccountSchema>;

export const updateAdminProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});
export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;

export const notificationPreferenceInputSchema = z.object({
  notificationTypeCode: z.string().trim().min(1).max(80),
  inAppEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .nullable()
    .optional(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceInputSchema>;

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dhKey: z.string().min(10).max(1000),
  authKey: z.string().min(5).max(500),
  deviceName: z.string().trim().max(120).nullable().optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const capacitySnapshotSchema = z.object({
  checkedAt: z.string(),
  tables: z.array(z.object({ table: z.string(), estimatedRows: z.number().int().nonnegative() })),
  storage: z.array(
    z.object({
      bucket: z.string(),
      files: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
    }),
  ),
  pendingOutbox: z.number().int().nonnegative(),
  failedOutbox: z.number().int().nonnegative(),
  activePushSubscriptions: z.number().int().nonnegative(),
});
export type CapacitySnapshot = z.infer<typeof capacitySnapshotSchema>;
