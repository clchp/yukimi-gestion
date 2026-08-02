-- Yukimi Gestión
-- Migración 047: revalida la función de eliminación de borradores y fuerza la recarga de PostgREST.

begin;

create or replace function public.cancel_sale_draft_v1(
  p_draft_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.sale_drafts%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select * into v_draft
  from public.sale_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'El borrador no existe.' using errcode = 'P0002';
  end if;

  if v_draft.status <> 'DRAFT' then
    raise exception 'El borrador ya fue confirmado o eliminado.' using errcode = '40001';
  end if;

  if v_draft.version <> p_expected_version then
    raise exception 'El borrador cambió. Recarga la lista antes de eliminarlo.' using errcode = '40001';
  end if;

  perform set_config('app.audit_reason', 'Eliminación de borrador de venta', true);

  update public.sale_drafts
  set status = 'CANCELLED',
      updated_by = private.current_actor_id()
  where id = p_draft_id
    and status = 'DRAFT'
    and version = p_expected_version
  returning * into v_draft;

  if not found then
    raise exception 'El borrador cambió. Recarga la lista antes de eliminarlo.' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'id', v_draft.id,
    'status', v_draft.status,
    'version', v_draft.version
  );
end;
$$;

grant execute on function public.cancel_sale_draft_v1(uuid, bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
