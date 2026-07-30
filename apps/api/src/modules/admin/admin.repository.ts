import type {
  AdminSettings,
  CapacitySnapshot,
  NotificationPreferenceInput,
  PushSubscriptionInput,
  UpdateAdminProfileInput,
  UpdateBusinessSettingInput,
  UpsertFinancialAccountInput,
  UpsertWarehouseInput,
} from '@yukimi/shared';

export interface AdminRepository {
  getSettings(): Promise<AdminSettings>;
  updateSetting(
    key: string,
    input: UpdateBusinessSettingInput,
  ): Promise<{ key: string; version: number }>;
  upsertWarehouse(input: UpsertWarehouseInput): Promise<{ id: string; version: number }>;
  upsertFinancialAccount(
    input: UpsertFinancialAccountInput,
  ): Promise<{ id: string; version: number }>;
  updateProfile(
    profileId: string,
    input: UpdateAdminProfileInput,
  ): Promise<{ id: string; version: number }>;
  upsertNotificationPreference(
    input: NotificationPreferenceInput,
  ): Promise<{ notificationTypeCode: string; version: number }>;
  upsertPushSubscription(input: PushSubscriptionInput): Promise<{ id: string; isActive: boolean }>;
  getCapacitySnapshot(): Promise<CapacitySnapshot>;
}
