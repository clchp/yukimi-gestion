import type {
  NotificationPreferenceInput,
  PushSubscriptionInput,
  UpdateAdminProfileInput,
  UpdateBusinessSettingInput,
  UpsertFinancialAccountInput,
  UpsertWarehouseInput,
} from '@yukimi/shared';
import type { AdminRepository } from './admin.repository.js';

export class AdminService {
  public constructor(private readonly repository: AdminRepository) {}
  public getSettings() {
    return this.repository.getSettings();
  }
  public updateSetting(key: string, input: UpdateBusinessSettingInput) {
    return this.repository.updateSetting(key, input);
  }
  public upsertWarehouse(input: UpsertWarehouseInput) {
    return this.repository.upsertWarehouse(input);
  }
  public upsertFinancialAccount(input: UpsertFinancialAccountInput) {
    return this.repository.upsertFinancialAccount(input);
  }
  public updateProfile(profileId: string, input: UpdateAdminProfileInput) {
    return this.repository.updateProfile(profileId, input);
  }
  public upsertNotificationPreference(input: NotificationPreferenceInput) {
    return this.repository.upsertNotificationPreference(input);
  }
  public upsertPushSubscription(input: PushSubscriptionInput) {
    return this.repository.upsertPushSubscription(input);
  }
  public getCapacitySnapshot() {
    return this.repository.getCapacitySnapshot();
  }
}
