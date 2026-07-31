-- Yukimi Gestión
-- Migración 045: la obligatoriedad del documento se valida en el contrato/API.
-- Se evita bloquear cargas históricas y operaciones internas que no modifican esos datos.

begin;

drop trigger if exists trg_require_client_document_v1 on public.clients;
drop function if exists private.require_client_document_v1();

notify pgrst, 'reload schema';
commit;
