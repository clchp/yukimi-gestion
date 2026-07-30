-- Yukimi Gestión
-- Migración 000: extensiones y esquemas base
-- Requiere: Supabase PostgreSQL

begin;

create schema if not exists extensions;
create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

comment on schema private is
  'Funciones internas y helpers de seguridad. No debe exponerse mediante la API.';

-- Supabase trabaja en UTC. Las fechas de negocio se almacenan como timestamptz
-- y la capa de presentación las mostrará en America/Lima.

commit;
