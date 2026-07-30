# Fase 1 — Fundación técnica

## Decisiones

- Monolito modular.
- TypeScript estricto.
- Supabase PostgreSQL como fuente de verdad.
- Supabase Auth para identidad y sesiones.
- React para el frontend administrativo.
- API modular para orquestar casos de uso y mantener reglas fuera de las pantallas.
- Reglas críticas de integridad reforzadas en PostgreSQL.

## Responsabilidades

### Base de datos

- Integridad referencial.
- RLS.
- Operaciones atómicas.
- Auditoría y libro de movimientos.
- Correlativos e idempotencia.

### API

- Casos de uso.
- Autorización de aplicación.
- Validaciones de entrada.
- Composición de consultas y respuestas.
- Adaptadores externos futuros.

### Frontend

- Presentación.
- Interacción.
- Formularios y validaciones inmediatas.
- Gestión de sesión.
- No contiene reglas financieras ni de inventario definitivas.

## Criterios de cierre de la fase

- `npm install` reproducible.
- TypeScript sin errores.
- Pruebas verdes.
- Build de API y frontend exitoso.
- Login real con la cuenta de pruebas.
- Rol ADMIN verificado por API y RLS.
- Cierre de sesión funcional.
- Variables sensibles fuera del repositorio.
