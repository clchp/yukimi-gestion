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
import { apiRequest } from '../../app/api-client';

export const getAdminSettings = (): Promise<AdminSettings> => apiRequest('/admin/settings');
export const updateBusinessSetting = (key: string, input: UpdateBusinessSettingInput) =>
  apiRequest<{ key: string; version: number }>(`/admin/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const upsertWarehouse = (input: UpsertWarehouseInput) =>
  apiRequest<{ id: string; version: number }>('/admin/warehouses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const upsertFinancialAccount = (input: UpsertFinancialAccountInput) =>
  apiRequest<{ id: string; version: number }>('/admin/financial-accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminProfile = (profileId: string, input: UpdateAdminProfileInput) =>
  apiRequest<{ id: string; version: number }>(`/admin/profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const upsertNotificationPreference = (input: NotificationPreferenceInput) =>
  apiRequest<{ notificationTypeCode: string; version: number }>('/admin/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const registerPushSubscription = (input: PushSubscriptionInput) =>
  apiRequest<{ id: string; isActive: boolean }>('/admin/push-subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const getCapacitySnapshot = (): Promise<CapacitySnapshot> => apiRequest('/admin/capacity');
