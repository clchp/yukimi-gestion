# Historial de archivos de migración

Esta carpeta conserva archivos retirados del orden ejecutable de Supabase sin
eliminarlos del repositorio.

## Duplicado de la migración 016

`016_Corregir_Total_Pagos.duplicate.sql` es una copia exacta de
`../migrations/016_fix_payment_declared_amount.sql`.

Se conserva únicamente como evidencia histórica. No debe ejecutarse ni copiarse
de nuevo a `supabase/migrations`, porque ambos archivos usan la versión `016` y
producen exactamente el mismo cambio.

La migración canónica y ejecutable es:

`supabase/migrations/016_fix_payment_declared_amount.sql`
