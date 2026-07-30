-- Yukimi Gestión - Migración 016
-- Corrige el recálculo automático del importe total de un pago.
-- El total debe derivarse de payment_parts, pero el trigger protector
-- estaba bloqueando la actualización interna realizada por el propio sistema.

begin;

create or replace function private.refresh_payment_declared_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_previous_setting text;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  v_previous_setting := coalesce(
    pg_catalog.current_setting('app.allow_payment_amount_update', true),
    'false'
  );

  perform pg_catalog.set_config(
    'app.allow_payment_amount_update',
    'true',
    true
  );

  update public.payments p
  set declared_amount = coalesce((
        select round(sum(pp.amount), 2)
        from public.payment_parts pp
        where pp.payment_id = v_payment_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where p.id = v_payment_id;

  perform pg_catalog.set_config(
    'app.allow_payment_amount_update',
    v_previous_setting,
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
exception
  when others then
    perform pg_catalog.set_config(
      'app.allow_payment_amount_update',
      coalesce(v_previous_setting, 'false'),
      true
    );
    raise;
end;
$$;

commit;

notify pgrst, 'reload schema';
