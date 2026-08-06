-- Yukimi Gestión
-- Migración 050: el costo pagado directamente por el cliente no pertenece a Yukimi

begin;

update public.deliveries
set shipping_cost = 0,
    updated_at = now(),
    version = version + 1
where cost_payer in ('CLIENT', 'NOT_APPLICABLE')
  and shipping_cost <> 0;

create or replace function private.normalize_delivery_shipping_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cost_payer in ('CLIENT', 'NOT_APPLICABLE') then
    new.shipping_cost := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_delivery_shipping_cost on public.deliveries;
create trigger trg_normalize_delivery_shipping_cost
before insert or update of shipping_cost, cost_payer
on public.deliveries
for each row
execute function private.normalize_delivery_shipping_cost();

notify pgrst, 'reload schema';

commit;
