# Guía de publicación de Yukimi Gestión

La publicación usa tres servicios separados:

- Supabase: autenticación, PostgreSQL y archivos privados.
- Render: API Express.
- Cloudflare Pages: frontend React.

No es necesario comprar un dominio.

## 1. Preparar el repositorio

1. Subir el proyecto a un repositorio privado de GitHub.
2. Confirmar que `.env` no esté versionado.
3. Ejecutar localmente `npm run typecheck`, `npm test` y `npm run build`.
4. Ejecutar la migración 023 y sus comprobaciones en Supabase.

GitHub Actions ejecutará las mismas verificaciones con Node.js 24.

## 2. Publicar la API en Render

1. Crear un Web Service desde el repositorio.
2. Render puede detectar `render.yaml`.
3. Configurar los secretos:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `CORS_ORIGINS` temporalmente con la URL de Cloudflare Pages cuando exista.
4. El endpoint de salud debe responder en `/api/v1/health`.

La API usa solamente la clave pública `anon`; nunca debe configurarse `service_role`.

## 3. Publicar el frontend en Cloudflare Pages

1. Crear un proyecto Pages desde el mismo repositorio.
2. Directorio raíz: raíz del repositorio.
3. Comando de compilación:

```text
npm ci && npm run build:shared && npm run build -w @yukimi/web
```

4. Directorio de salida:

```text
apps/web/dist
```

5. Variables de compilación:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL=https://<api-render>/api/v1`

El archivo `_redirects` permite abrir rutas internas como `/ventas` sin obtener un 404.

## 4. CORS definitivo

Cuando Cloudflare entregue la URL `https://<proyecto>.pages.dev`, cambiar en Render:

```text
CORS_ORIGINS=https://<proyecto>.pages.dev
```

Para permitir una URL adicional, separarla con coma.

## 5. Cuentas reales

1. En Supabase Authentication, desactivar el registro público.
2. Enviar invitaciones a Lorena y Camila.
3. Tras aceptar cada invitación, activar su perfil y asignar el rol `ADMIN`.
4. Verificar que ambas tengan los mismos permisos.
5. Desactivar la cuenta de pruebas de Claudia antes del uso real, salvo que se conserve explícitamente para soporte.

## 6. Validación final

- Inicio de sesión desde dos navegadores.
- Creación simultánea sobre la última unidad disponible.
- Pago, boleta, entrega e importación completos.
- Reportes CSV y PDF.
- Alertas y auditoría.
- Vista móvil.
- Archivos privados inaccesibles sin sesión.

## 7. Operación

Render en plan gratuito puede suspender la API por inactividad. La primera solicitud después de un periodo sin uso puede tardar más. Supabase y Cloudflare Pages continúan funcionando de acuerdo con los límites de sus planes.
