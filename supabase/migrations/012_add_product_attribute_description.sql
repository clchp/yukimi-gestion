-- Yukimi Gestión
-- Migración 012: agrega descripción a las definiciones de atributos de producto
-- Corrige la incompatibilidad entre el esquema y el repositorio de catálogos.

begin;

alter table public.product_attribute_definitions
  add column if not exists description text;

comment on column public.product_attribute_definitions.description is
  'Descripción opcional del atributo para formularios, ayudas y mantenimiento del catálogo.';

commit;

-- Fuerza a PostgREST/Supabase a refrescar la caché del esquema.
notify pgrst, 'reload schema';
