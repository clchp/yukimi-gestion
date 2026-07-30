# Fase 2 — Sistema visual y prototipo responsive

## Objetivo

Integrar la información funcional generada en Stitch dentro de un frontend React mantenible, mejorando jerarquía, densidad, legibilidad y adaptación móvil sin copiar literalmente el HTML exportado.

## Fuentes revisadas

- Exportación de Stitch de 16 pantallas de escritorio.
- Exportación de Stitch de 10 pantallas móviles.
- Documento de sistema visual generado por Stitch.
- Referencias de dashboards administrativos monocromáticos entregadas por Claudia.

## Decisiones de diseño

- Mantener una identidad profesional con acentos ciruela y lavanda, sin convertir la aplicación en una interfaz temática o infantil.
- Utilizar fondo neutro cálido, superficies blancas, bordes suaves y sombras discretas.
- Reservar los colores intensos para acciones, estados y alertas.
- Evitar el glassmorphism excesivo en tablas y zonas con mucha información.
- Emplear una navegación lateral estable en escritorio y navegación inferior en móvil.
- Reemplazar tablas extensas por tarjetas de información en pantallas menores de 900 px.
- Mantener siempre visibles total, saldo, disponibilidad y estado cuando sean relevantes.
- Diseñar formularios por secciones o pasos, especialmente para ventas.

## Arquitectura del frontend visual

```text
src/
├── components/
│   ├── app-shell.tsx
│   └── ui/
│       ├── page-header.tsx
│       ├── panel.tsx
│       ├── progress-bar.tsx
│       ├── stat-card.tsx
│       ├── status-badge.tsx
│       └── toolbar.tsx
├── data/
│   └── mock-data.ts
├── pages/
└── styles/
    ├── tokens.css
    ├── auth.css
    ├── shell.css
    ├── components.css
    ├── modules.css
    ├── responsive.css
    └── global.css
```

## Pantallas integradas

- Inicio de sesión.
- Creación de contraseña por invitación.
- Panel principal.
- Lista y detalle de clientes.
- Lista y creación de productos.
- Inventario.
- Lista, creación y detalle de ventas.
- Entregas.
- Importaciones y cajas.
- Finanzas.
- Conciliación bancaria.
- Reportes.
- Auditoría.
- Configuración.

## Estado funcional

La autenticación y protección de rutas se conservan. Los datos mostrados dentro de los módulos son datos de demostración para validar la interfaz. Todavía no crean, modifican ni consultan operaciones reales en Supabase.

## Próximo paso

Conectar el primer bloque real en este orden:

1. Configuraciones.
2. Almacenes.
3. Categorías, franquicias, marcas y líneas.
4. Productos.
5. Variantes.
6. Inventario inicial y movimientos.
