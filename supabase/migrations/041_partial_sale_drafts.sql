-- Yukimi Gestión
-- Migración 041: los borradores pueden guardarse sin cliente mientras no se confirmen.

begin;

alter table public.sale_drafts
  alter column client_id drop not null;

comment on column public.sale_drafts.client_id is
  'Cliente opcional mientras el registro sea un borrador. La venta final exige un cliente válido.';

notify pgrst, 'reload schema';

commit;
