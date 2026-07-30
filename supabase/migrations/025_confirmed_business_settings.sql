-- Yukimi Gestión
-- Migración 025: decisiones confirmadas posteriores a la especificación v1.0

begin;

-- Los importes siguen siendo editables desde el catálogo. Solo completamos los
-- valores que en v1.0 estaban pendientes, para no sobrescribir ajustes reales.
update public.product_categories
set release_penalty_amount = 3.00,
    release_penalty_currency = 'PEN',
    updated_at = now(),
    version = version + 1
where code = 'ACRYLIC'
  and release_penalty_amount is null;

update public.product_categories
set release_penalty_amount = 1.00,
    release_penalty_currency = 'PEN',
    updated_at = now(),
    version = version + 1
where code = 'KEYCHAIN'
  and release_penalty_amount is null;

update public.product_categories
set release_penalty_amount = 0.00,
    release_penalty_currency = 'PEN',
    updated_at = now(),
    version = version + 1
where code = 'OTHER'
  and release_penalty_amount is null;

-- Reglas que estaban explícitamente pendientes en la línea base. El modo
-- MAX_SINGLE evita cobrar dos penalidades por el mismo incumplimiento.
update public.business_settings
set setting_value = '{
      "status":"CONFIRMED",
      "combine":false,
      "selectionMode":"MAX_SINGLE",
      "preferOnTie":"RELEASE"
    }'::jsonb,
    description = 'No se acumulan atraso y liberación: se conserva una sola penalidad, la mayor.',
    updated_at = now(),
    version = version + 1
where setting_key = 'penalties.combine_late_and_release'
  and setting_value ->> 'status' = 'PENDING_DEFINITION';

update public.business_settings
set setting_value = '{
      "status":"CONFIRMED",
      "deductFromDeposit":true,
      "refundRemainder":true,
      "minimumRefund":0
    }'::jsonb,
    description = 'La penalidad se retiene del adelanto y se devuelve el remanente.',
    updated_at = now(),
    version = version + 1
where setting_key = 'refunds.deduct_penalty_from_deposit'
  and setting_value ->> 'status' = 'PENDING_DEFINITION';

update public.business_settings
set setting_value = '{
      "status":"CONFIRMED",
      "receiptMode":"ONE_RECEIPT",
      "preservePaymentParts":true
    }'::jsonb,
    description = 'Un pago dividido conserva sus medios en caja y utiliza un solo comprobante.',
    updated_at = now(),
    version = version + 1
where setting_key = 'receipts.mixed_payment_treatment'
  and setting_value ->> 'status' = 'PENDING_DEFINITION';

update public.business_settings
set setting_value = '{
      "status":"CONFIRMED",
      "mode":"AUTOMATIC",
      "purchaseCosts":"BY_PURCHASE_VALUE",
      "cardAndCommission":"BY_PURCHASE_VALUE",
      "freightAndInsurance":"BY_WEIGHT",
      "weightFallback":["BY_QUANTITY","BY_PURCHASE_VALUE"],
      "customs":"BY_PURCHASE_VALUE",
      "roundingResidual":"HIGHEST_PURCHASE_VALUE_LINE"
    }'::jsonb,
    description = 'Distribución automática editable de costos incluidos, con fallback cuando falta peso.',
    updated_at = now(),
    version = version + 1
where setting_key = 'imports.unit_cost_allocation'
  and setting_value ->> 'status' = 'PENDING_DEFINITION';

-- Preferencias ERP configurables elegidas para las decisiones delegadas.
insert into public.business_settings(
  setting_key,
  setting_value,
  value_type,
  category,
  description,
  is_editable
)
values
  (
    'discounts.require_reason',
    'true'::jsonb,
    'BOOLEAN',
    'SALES',
    'Todo descuento exige un motivo.',
    true
  ),
  (
    'discounts.below_cost_policy',
    '{"mode":"WARN","requiresReason":true,"requiresSecondApproval":false}'::jsonb,
    'JSON',
    'SALES',
    'Advierte si el precio queda bajo el costo; no bloquea automáticamente.',
    true
  ),
  (
    'refunds.deposit_allocation_mode',
    '{"mode":"PRO_RATA_LINE_TOTAL","editableAtOperation":true}'::jsonb,
    'JSON',
    'REFUNDS',
    'Distribución sugerida del adelanto cuando se libera solo una línea de venta.',
    true
  ),
  (
    'notifications.card_due_days_before',
    '15'::jsonb,
    'NUMBER',
    'NOTIFICATIONS',
    'Anticipación de la alerta de pago de tarjeta.',
    true
  ),
  (
    'finance.yape_accounts',
    '{"status":"AWAITING_DETAILS","expectedCount":2,"linkedBankCode":"BCP-PEN"}'::jsonb,
    'JSON',
    'FINANCE',
    'Dos cuentas Yape vinculadas a BCP; faltan nombres visibles y propietarios.',
    true
  )
on conflict (setting_key) do nothing;

-- Se conoce el día y contenido del resumen, pero no sus destinatarios.
update public.business_settings
set setting_value = '{
      "status":"AWAITING_RECIPIENTS",
      "enabled":false,
      "dayOfWeekIso":1,
      "time":"08:00",
      "timezone":"America/Lima",
      "recipients":[],
      "sections":[
        "SALES",
        "COLLECTIONS",
        "OUTSTANDING_BALANCES",
        "PENALTIES",
        "TOP_PRODUCTS",
        "LOW_STOCK",
        "EXPENSES",
        "ESTIMATED_PROFIT",
        "DELAYED_IMPORTS",
        "PENDING_DELIVERIES"
      ]
    }'::jsonb,
    description = 'Resumen semanal de los lunes; queda desactivado hasta registrar destinatarios.',
    updated_at = now(),
    version = version + 1
where setting_key = 'notifications.weekly_email'
  and setting_value = '{"enabled":false,"day":null,"recipients":[]}'::jsonb;

commit;
