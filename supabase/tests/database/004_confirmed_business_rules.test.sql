begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(10);

select is(
  (select release_penalty_amount from public.product_categories where code = 'PLUSH'),
  5.00::numeric,
  'Peluches propone S/5'
);

select is(
  (select release_penalty_amount from public.product_categories where code = 'FIGURE'),
  10.00::numeric,
  'Figuras propone S/10'
);

select is(
  (select release_penalty_amount from public.product_categories where code = 'ACRYLIC'),
  3.00::numeric,
  'Acrílicos propone S/3'
);

select is(
  (select release_penalty_amount from public.product_categories where code = 'KEYCHAIN'),
  1.00::numeric,
  'Llaveros propone S/1'
);

select is(
  (select release_penalty_amount from public.product_categories where code = 'OTHER'),
  0.00::numeric,
  'Otros propone S/0 y puede editarse'
);

select is(
  (
    select setting_value ->> 'selectionMode'
    from public.business_settings
    where setting_key = 'penalties.combine_late_and_release'
  ),
  'MAX_SINGLE',
  'Atraso y liberación no se acumulan'
);

select ok(
  (
    select (setting_value ->> 'deductFromDeposit')::boolean
    from public.business_settings
    where setting_key = 'refunds.deduct_penalty_from_deposit'
  ),
  'La penalidad se retiene del adelanto'
);

select is(
  (
    select setting_value ->> 'receiptMode'
    from public.business_settings
    where setting_key = 'receipts.mixed_payment_treatment'
  ),
  'ONE_RECEIPT',
  'El pago mixto utiliza un comprobante'
);

select is(
  (
    select setting_value ->> 'mode'
    from public.business_settings
    where setting_key = 'imports.unit_cost_allocation'
  ),
  'AUTOMATIC',
  'El costo unitario importado se calcula automáticamente'
);

select is(
  (
    select (setting_value #>> '{}')::integer
    from public.business_settings
    where setting_key = 'notifications.card_due_days_before'
  ),
  15,
  'La tarjeta avisa con 15 días de anticipación'
);

select * from finish();
rollback;
