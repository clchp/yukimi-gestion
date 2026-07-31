import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminSettingsSchema,
  capacitySnapshotSchema,
  type AdminSettings,
  type CapacitySnapshot,
  type NotificationPreferenceInput,
  type PushSubscriptionInput,
  type UpdateAdminProfileInput,
  type UpdateBusinessSettingInput,
  type UpsertFinancialAccountInput,
  type UpsertWarehouseInput,
} from '@yukimi/shared';
import { z } from 'zod';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { AdminRepository } from './admin.repository.js';

const idVersionSchema = z.object({ id: z.string().uuid(), version: z.number().int().positive() });
const settingResultSchema = z.object({ key: z.string(), version: z.number().int().positive() });
const preferenceResultSchema = z.object({
  notificationTypeCode: z.string(),
  version: z.number().int().positive(),
});
const pushResultSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export class SupabaseAdminRepository implements AdminRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async getSettings(): Promise<AdminSettings> {
    const [profiles, warehouses, accounts, settings, notificationTypes, preferences] =
      await Promise.all([
        this.client
          .from('profiles')
          .select(
            'id,display_name,email_snapshot,phone,is_active,version,user_roles!user_roles_user_id_fkey!inner(role_code,revoked_at)',
          )
          .eq('user_roles.role_code', 'ADMIN')
          .is('user_roles.revoked_at', null)
          .order('display_name'),
        this.client
          .from('warehouses')
          .select(
            'id,code,name,warehouse_type,description,is_virtual,is_visible_in_operations,is_active,version',
          )
          .order('name'),
        this.client
          .from('financial_accounts')
          .select(
            'id,code,name,account_type_code,currency_code,institution_name,masked_account_number,owner_name,linked_parent_account_id,is_active,version',
          )
          .order('name'),
        this.client
          .from('business_settings')
          .select('setting_key,setting_value,value_type,category,description,is_editable,version')
          .eq('is_editable', true)
          .order('category')
          .order('setting_key'),
        this.client
          .from('notification_types')
          .select('code,name,description')
          .eq('is_active', true)
          .order('name'),
        this.client
          .from('notification_preferences')
          .select(
            'notification_type_code,in_app_enabled,push_enabled,email_enabled,quiet_hours_start,quiet_hours_end,version',
          )
          .order('notification_type_code'),
      ]);
    const failure = [profiles, warehouses, accounts, settings, notificationTypes, preferences].find(
      (result) => result.error,
    );
    if (failure?.error)
      throw mapSupabaseError(failure.error, 'No se pudo cargar la configuración administrativa.');

    return adminSettingsSchema.parse({
      profiles: (profiles.data ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email_snapshot,
        phone: row.phone,
        isActive: row.is_active,
        version: Number(row.version),
      })),
      warehouses: (warehouses.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        warehouseType: row.warehouse_type,
        description: row.description,
        isVirtual: row.is_virtual,
        isVisibleInOperations: row.is_visible_in_operations,
        isActive: row.is_active,
        version: Number(row.version),
      })),
      financialAccounts: (accounts.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        accountTypeCode: row.account_type_code,
        currencyCode: row.currency_code,
        institutionName: row.institution_name,
        maskedAccountNumber: row.masked_account_number,
        ownerName: row.owner_name,
        linkedParentAccountId: row.linked_parent_account_id,
        isActive: row.is_active,
        version: Number(row.version),
      })),
      settings: (settings.data ?? []).map((row) => ({
        key: row.setting_key,
        value: row.setting_value,
        valueType: row.value_type,
        category: row.category,
        description: row.description,
        isEditable: row.is_editable,
        version: Number(row.version),
      })),
      notificationTypes: (notificationTypes.data ?? []).map((row) => ({
        code: row.code,
        name: row.name,
        description: row.description,
      })),
      preferences: (preferences.data ?? []).map((row) => ({
        notificationTypeCode: row.notification_type_code,
        inAppEnabled: row.in_app_enabled,
        pushEnabled: row.push_enabled,
        emailEnabled: row.email_enabled,
        quietHoursStart: row.quiet_hours_start,
        quietHoursEnd: row.quiet_hours_end,
        version: Number(row.version),
      })),
    });
  }

  public async updateSetting(key: string, input: UpdateBusinessSettingInput) {
    const { data, error } = await this.client.rpc('update_business_setting_v1', {
      p_key: key,
      p_value: input.value,
      p_expected_version: input.version,
      p_reason: input.reason,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar la regla de negocio.');
    return settingResultSchema.parse(data);
  }

  public async upsertWarehouse(input: UpsertWarehouseInput) {
    const { data, error } = await this.client.rpc('upsert_warehouse_v1', { p_input: input });
    if (error) throw mapSupabaseError(error, 'No se pudo guardar el almacén.');
    return idVersionSchema.parse(data);
  }

  public async upsertFinancialAccount(input: UpsertFinancialAccountInput) {
    const { data, error } = await this.client.rpc('upsert_financial_account_v1', {
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo guardar la cuenta financiera.');
    return idVersionSchema.parse(data);
  }

  public async updateProfile(profileId: string, input: UpdateAdminProfileInput) {
    const { data, error } = await this.client.rpc('update_admin_profile_v1', {
      p_profile_id: profileId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar la administradora.');
    return idVersionSchema.parse(data);
  }

  public async upsertNotificationPreference(input: NotificationPreferenceInput) {
    const { data, error } = await this.client.rpc('upsert_notification_preference_v1', {
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo guardar la preferencia de notificación.');
    return preferenceResultSchema.parse(data);
  }

  public async upsertPushSubscription(input: PushSubscriptionInput) {
    const { data, error } = await this.client.rpc('upsert_push_subscription_v1', {
      p_input: input,
    });
    if (error)
      throw mapSupabaseError(
        error,
        'No se pudo registrar este dispositivo para notificaciones push.',
      );
    return pushResultSchema.parse(data);
  }

  public async getCapacitySnapshot(): Promise<CapacitySnapshot> {
    const { data, error } = await this.client.rpc('get_capacity_snapshot_v1');
    if (error) throw mapSupabaseError(error, 'No se pudo consultar la capacidad del sistema.');
    return capacitySnapshotSchema.parse(data);
  }
}
