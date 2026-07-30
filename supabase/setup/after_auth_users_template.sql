-- Ejecutar DESPUÉS de crear manualmente las dos cuentas en Supabase Auth.
-- Reemplace los correos de ejemplo antes de ejecutar.

begin;

-- 1) Activar las cuentas y asignar el rol ADMIN.
select private.bootstrap_admin_by_email('lorena@example.com', 'Lorena');
select private.bootstrap_admin_by_email('camila@example.com', 'Camila');

-- 2) Relacionar cada administradora con su almacén principal.
insert into public.warehouse_managers(warehouse_id, user_id, is_primary, assigned_by)
select w.id, p.id, true, p.id
from public.warehouses w
join public.profiles p on lower(p.email_snapshot::text) = lower('lorena@example.com')
where w.code = 'LORENA'
on conflict (warehouse_id, user_id) do update set is_primary = true;

insert into public.warehouse_managers(warehouse_id, user_id, is_primary, assigned_by)
select w.id, p.id, true, p.id
from public.warehouses w
join public.profiles p on lower(p.email_snapshot::text) = lower('camila@example.com')
where w.code = 'CAMILA'
on conflict (warehouse_id, user_id) do update set is_primary = true;

-- 3) Cuando se confirme a qué banco está vinculada Yape, descomente una opción.
-- update public.financial_accounts yape
-- set linked_parent_account_id = (select id from public.financial_accounts where code = 'BCP-PEN')
-- where yape.code = 'YAPE-PEN';

-- update public.financial_accounts yape
-- set linked_parent_account_id = (select id from public.financial_accounts where code = 'SCOTIABANK-PEN')
-- where yape.code = 'YAPE-PEN';

commit;
