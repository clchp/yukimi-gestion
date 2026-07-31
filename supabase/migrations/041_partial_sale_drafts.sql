-- Yukimi Gestión
-- Migración 041: los borradores pueden guardarse incompletos; la venta final sigue siendo estricta.

begin;

alter table public.sale_drafts
  alter column client_id drop not null;

comment on column public.sale_drafts.client_id is
  'Cliente opcional mientras el registro sea un borrador. Debe existir antes de confirmar la venta.';

create or replace function private.validate_sale_draft_confirmation_v1(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.sale_drafts%rowtype;
  v_line_count integer;
begin
  select * into v_draft
  from public.sale_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'El borrador no existe.' using errcode = 'P0002';
  end if;
  if v_draft.client_id is null then
    raise exception 'Selecciona un cliente antes de confirmar la venta.';
  end if;

  select count(*)::integer
    into v_line_count
  from public.sale_draft_items
  where sale_draft_id = p_draft_id;

  if v_line_count <= 0 then
    raise exception 'Agrega al menos un producto antes de confirmar la venta.';
  end if;
end;
$$;

revoke execute on function private.validate_sale_draft_confirmation_v1(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
