-- Yukimi Gestión
-- Migración 024: completar el endurecimiento RLS de exportaciones de reportes

begin;

alter table public.report_exports enable row level security;
alter table public.report_exports force row level security;

commit;
