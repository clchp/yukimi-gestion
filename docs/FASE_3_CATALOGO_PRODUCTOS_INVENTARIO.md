# Fase 3 — Catálogo, productos e inventario real

Esta fase reemplaza los datos demostrativos de productos e inventario por información real de Supabase.

## Alcance implementado

- Catálogos configurables: categorías, franquicias, marcas y líneas.
- Consulta de almacenes, monedas y atributos de variantes.
- Creación atómica de productos, variantes, atributos, lotes y stock inicial.
- Códigos de producto, SKU, lotes y movimientos generados en PostgreSQL.
- Idempotencia para impedir productos duplicados por doble clic o reintento.
- Imágenes privadas en Supabase Storage con registro en `attachments`.
- Lista real de productos con búsqueda, filtros, paginación y resumen.
- Inventario real por almacén y vista consolidada.
- Control optimista al activar o desactivar catálogos.
- Interfaz responsive para escritorio y móvil.

## Migración requerida

El proyecto Supabase existente ya tiene las migraciones 000–010. Ejecuta únicamente:

```text
supabase/migrations/011_catalog_products_api.sql
```

Luego ejecuta:

```text
supabase/tests/003_phase3_catalog_checks.sql
```

El mensaje `Success. No rows returned` indica que las verificaciones pasaron. Cualquier problema aparecerá como un error de PostgreSQL.

## Flujo de prueba

1. Inicia sesión con Claudia — Pruebas.
2. Abre **Configuración → Catálogos**.
3. Crea la franquicia `Jujutsu Kaisen`.
4. Crea una marca opcional y una línea asociada.
5. Abre **Productos → Nuevo producto**.
6. Registra el producto, una o varias variantes y stock en Lorena o Camila.
7. Adjunta una imagen.
8. Confirma que aparece en Productos.
9. Abre Inventario y valida el saldo por almacén.
10. Revisa `inventory_movements`, `inventory_movement_lines` y `audit_log` en Supabase.

## Reglas de integridad

- Todo producto tiene al menos una variante, incluso si se llama `Estándar`.
- El stock inicial crea lotes y un movimiento `INITIAL_STOCK`; no edita saldos directamente.
- Una operación repetida con la misma clave de idempotencia devuelve el mismo producto.
- El stock no puede ser negativo.
- Los buckets de imágenes continúan siendo privados.
- Los catálogos se desactivan; no se eliminan.
