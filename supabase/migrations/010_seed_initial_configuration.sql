-- Yukimi Gestión
-- Migración 010: datos iniciales, catálogos y reglas configurables

begin;

-- Monedas y roles.
insert into public.currencies(code, name, symbol, decimal_places)
values
  ('PEN', 'Sol peruano', 'S/', 2),
  ('USD', 'Dólar estadounidense', 'US$', 2)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  is_active = true;

insert into public.app_roles(code, name, description, is_system)
values ('ADMIN', 'Administradora', 'Acceso completo a la operación de Yukimi Gestión.', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

-- Contadores visibles. Los UUID siguen siendo los identificadores internos.
insert into public.business_counters(counter_key, prefix, last_value, padding)
values
  ('CLIENT', 'CLI-', 0, 6),
  ('PRODUCT', 'PRD-', 0, 6),
  ('PRODUCT_VARIANT', 'SKU-', 0, 7),
  ('INVENTORY_LOT', 'LOT-', 0, 7),
  ('INVENTORY_MOVEMENT', 'MOV-', 0, 8),
  ('SALE', 'VTA-', 0, 7),
  ('PAYMENT', 'PAG-', 0, 8),
  ('REFUND', 'DEV-', 0, 7),
  ('RETURN_CASE', 'RET-', 0, 7),
  ('RECEIPT', 'CMP-', 0, 8),
  ('CREDIT_NOTE', 'NCR-', 0, 8),
  ('DELIVERY', 'ENT-', 0, 7),
  ('IMPORT', 'IMP-', 0, 6),
  ('IMPORT_BOX', 'CJA-', 0, 7),
  ('FINANCIAL_TRANSACTION', 'FIN-', 0, 8),
  ('LOAN', 'PRE-', 0, 6),
  ('OBLIGATION', 'OBL-', 0, 6),
  ('CASH_CLOSURE', 'CIE-', 0, 7),
  ('BANK_IMPORT', 'BAN-', 0, 7)
on conflict (counter_key) do update set
  prefix = excluded.prefix,
  padding = excluded.padding;

-- Configuración del negocio. Las decisiones pendientes se conservan como datos,
-- para que una confirmación futura no obligue a rediseñar la base.
insert into public.business_settings(setting_key, setting_value, value_type, category, description, is_editable)
values
  ('app.timezone', to_jsonb('America/Lima'::text), 'STRING', 'GENERAL', 'Zona horaria utilizada para mostrar y calcular fechas de negocio.', false),
  ('app.default_currency', to_jsonb('PEN'::text), 'STRING', 'GENERAL', 'Moneda principal del negocio.', false),
  ('sales.default_payment_term_days', '14'::jsonb, 'NUMBER', 'SALES', 'Plazo normal desde la separación.', true),
  ('sales.high_value_payment_term_days', '21'::jsonb, 'NUMBER', 'SALES', 'Plazo excepcional para productos de alto valor.', true),
  ('sales.release_grace_hours', '24'::jsonb, 'DURATION', 'SALES', 'Horas durante las cuales una separación puede cancelarse sin penalidad de liberación.', true),
  ('penalties.late_daily', '{"amount":1,"currency":"PEN","enabled":true}'::jsonb, 'MONEY', 'PENALTIES', 'Penalidad por cada día posterior al vencimiento.', true),
  ('penalties.combine_late_and_release', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'PENALTIES', 'Define si la penalidad diaria se acumula con la penalidad de liberación.', true),
  ('refunds.deduct_penalty_from_deposit', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'REFUNDS', 'Forma exacta de descontar la penalidad del adelanto.', true),
  ('receipts.required_for_new_sales', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'RECEIPTS', 'Obligatoriedad de boleta para todas las ventas nuevas.', true),
  ('receipts.mixed_payment_treatment', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'RECEIPTS', 'Tratamiento de boleta cuando un pago combina más de un medio.', true),
  ('imports.unit_cost_allocation', '{"status":"PENDING_DEFINITION","mode":"MANUAL"}'::jsonb, 'JSON', 'IMPORTS', 'Cálculo automático o manual de tarjeta, comisión, flete y aduanas.', true),
  ('dispatch.weekdays_iso', '[1,4]'::jsonb, 'JSON', 'DELIVERIES', 'Días habituales de despacho: lunes y jueves.', true),
  ('notifications.payment_due_days_before', '3'::jsonb, 'NUMBER', 'NOTIFICATIONS', 'Anticipación de alertas de pagos por vencer.', true),
  ('notifications.import_arrival_days_before', '3'::jsonb, 'NUMBER', 'NOTIFICATIONS', 'Anticipación de alertas de llegada de importaciones.', true),
  ('notifications.weekly_email', '{"enabled":false,"day":null,"recipients":[]}'::jsonb, 'JSON', 'NOTIFICATIONS', 'Configuración pendiente del resumen semanal por correo.', true),
  ('files.max_image_bytes', '5242880'::jsonb, 'NUMBER', 'FILES', 'Tamaño máximo inicial de imágenes: 5 MB.', true),
  ('files.max_document_bytes', '10485760'::jsonb, 'NUMBER', 'FILES', 'Tamaño máximo inicial de documentos: 10 MB.', true)
on conflict (setting_key) do update set
  description = excluded.description,
  category = excluded.category;

-- Socios comerciales reutilizables.
insert into public.partner_types(code, name, description)
values
  ('SUPPLIER', 'Proveedor', 'Vendedor o tienda de origen de la mercadería.'),
  ('INTERNATIONAL_OPERATOR', 'Operador internacional', 'Transportista o intermediario internacional.'),
  ('LOCAL_OPERATOR', 'Operador local', 'Operador logístico dentro de Perú.'),
  ('AGENCY', 'Agencia', 'Agencia de envío interprovincial.'),
  ('COURIER', 'Courier o motorizado', 'Servicio de entrega al cliente.'),
  ('LENDER', 'Prestamista', 'Persona o entidad relacionada con préstamos.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.business_partners(code, legal_name, trade_name, country_code, is_active)
values
  ('PART-SHALOM', 'Shalom Empresarial S.A.C.', 'Shalom', 'PE', true),
  ('PART-OLVA', 'Olva Courier S.A.C.', 'Olva', 'PE', true),
  ('PART-AFEXPRESS', 'AF Express', 'AF Express', 'PE', true)
on conflict (code) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  is_active = true;

insert into public.business_partner_types(partner_id, partner_type_code)
select bp.id, x.partner_type_code
from public.business_partners bp
join (values
  ('PART-SHALOM', 'AGENCY'),
  ('PART-SHALOM', 'LOCAL_OPERATOR'),
  ('PART-OLVA', 'AGENCY'),
  ('PART-OLVA', 'LOCAL_OPERATOR'),
  ('PART-AFEXPRESS', 'COURIER'),
  ('PART-AFEXPRESS', 'LOCAL_OPERATOR')
) as x(partner_code, partner_type_code) on x.partner_code = bp.code
on conflict do nothing;

-- Catálogo de productos.
insert into public.product_categories(code, name, description, release_penalty_amount, release_penalty_currency, sort_order)
values
  ('PLUSH', 'Peluches', 'Peluches y productos blandos.', 5.00, 'PEN', 10),
  ('FIGURE', 'Figuras', 'Figuras, estatuillas y coleccionables.', 10.00, 'PEN', 20),
  ('ACRYLIC', 'Acrílicos', 'Stands, placas y accesorios acrílicos.', null, 'PEN', 30),
  ('KEYCHAIN', 'Llaveros', 'Llaveros y colgantes.', null, 'PEN', 40),
  ('OTHER', 'Otros', 'Productos que no pertenecen a las categorías principales.', null, 'PEN', 99)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  release_penalty_amount = excluded.release_penalty_amount,
  release_penalty_currency = excluded.release_penalty_currency,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.franchises(code, name, description)
values ('OTHER', 'Otros / Sin franquicia', 'Valor disponible cuando el producto no pertenece a una franquicia definida.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.product_attribute_definitions(code, name, data_type, sort_order)
values
  ('COLOR', 'Color', 'COLOR', 10),
  ('SIZE', 'Tamaño', 'TEXT', 20),
  ('DESIGN', 'Diseño', 'TEXT', 30),
  ('EDITION', 'Edición', 'TEXT', 40)
on conflict (code) do update set name = excluded.name, data_type = excluded.data_type, sort_order = excluded.sort_order, is_active = true;

-- Almacenes visibles y ubicaciones virtuales de importación.
insert into public.warehouses(code, name, warehouse_type, description, is_virtual, is_visible_in_operations)
values
  ('LORENA', 'Almacén Lorena', 'OPERATIONAL', 'Almacén operativo gestionado por Lorena.', false, true),
  ('CAMILA', 'Almacén Camila', 'OPERATIONAL', 'Almacén operativo gestionado por Camila.', false, true),
  ('FOREIGN', 'Almacén en el extranjero', 'FOREIGN', 'Ubicación virtual para mercadería recibida en el almacén extranjero.', true, false),
  ('TRANSIT', 'Tránsito internacional', 'TRANSIT', 'Ubicación virtual para mercadería embarcada o en tránsito.', true, false)
on conflict (code) do update set
  name = excluded.name,
  warehouse_type = excluded.warehouse_type,
  description = excluded.description,
  is_virtual = excluded.is_virtual,
  is_visible_in_operations = excluded.is_visible_in_operations,
  is_active = true;

insert into public.inventory_bucket_types(
  code, name, description, counts_as_on_hand, counts_as_sellable,
  counts_as_reserved, is_terminal, sort_order
)
values
  ('AVAILABLE', 'Disponible', 'Unidades disponibles para venta o separación.', true, true, false, false, 10),
  ('RESERVED', 'Reservado', 'Unidades separadas para clientes.', true, false, true, false, 20),
  ('ACCUMULATED', 'Acumulado para cliente', 'Unidades que permanecen en almacén a nombre del cliente.', true, false, true, false, 30),
  ('DAMAGED', 'Dañado', 'Unidades físicamente presentes pero no vendibles.', true, false, false, false, 40),
  ('LOST', 'Perdido', 'Unidades registradas como perdidas.', false, false, false, true, 50),
  ('IN_TRANSIT', 'En tránsito', 'Unidades que todavía no ingresaron a un almacén operativo.', false, false, false, false, 60),
  ('PREORDER_EXPECTED', 'Preventa esperada', 'Unidades esperadas y asignables a preventa.', false, false, true, false, 70),
  ('GIFTED', 'Regalado', 'Salida por regalo a cliente.', false, false, false, true, 80),
  ('USED_DYNAMIC', 'Utilizado en dinámica', 'Salida por sorteo o dinámica.', false, false, false, true, 90),
  ('DELIVERED', 'Entregado', 'Unidad entregada al cliente.', false, false, false, true, 100)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  counts_as_on_hand = excluded.counts_as_on_hand,
  counts_as_sellable = excluded.counts_as_sellable,
  counts_as_reserved = excluded.counts_as_reserved,
  is_terminal = excluded.is_terminal,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.inventory_movement_types(code, name, description, requires_reason)
values
  ('INITIAL_STOCK', 'Stock inicial', 'Carga inicial de existencias.', true),
  ('IMPORT_RECEIPT', 'Ingreso por importación', 'Recepción de mercadería importada.', false),
  ('IMPORT_TRANSFER', 'Movimiento logístico de importación', 'Traslado entre almacén extranjero, tránsito y Perú.', false),
  ('RESERVATION', 'Reserva', 'Traslado de disponible a reservado.', false),
  ('RELEASE', 'Liberación', 'Retorno de reservado a disponible.', true),
  ('SALE', 'Venta', 'Salida comercial de inventario.', false),
  ('DELIVERY', 'Entrega', 'Traslado de reservado o acumulado a entregado.', false),
  ('RETURN', 'Devolución', 'Ingreso por devolución de cliente.', true),
  ('DAMAGE', 'Daño', 'Traslado a estado dañado.', true),
  ('LOSS', 'Pérdida', 'Salida por pérdida.', true),
  ('GIFT', 'Regalo', 'Salida por regalo.', true),
  ('DYNAMIC', 'Dinámica', 'Salida por sorteo o dinámica.', true),
  ('TRANSFER', 'Transferencia entre almacenes', 'Traslado entre almacenes operativos.', true),
  ('ADJUSTMENT', 'Ajuste autorizado', 'Corrección de inventario con motivo obligatorio.', true),
  ('PREORDER_ALLOCATION', 'Asignación de preventa', 'Asignación de una unidad esperada a una preventa.', false),
  ('PREORDER_RELEASE', 'Liberación de preventa', 'Liberación de una unidad esperada.', true),
  ('CANCELLATION', 'Cancelación', 'Movimiento compensatorio por cancelación.', true),
  ('REVERSAL', 'Reversión', 'Movimiento compensatorio de otro movimiento.', true)
on conflict (code) do update set name = excluded.name, description = excluded.description, requires_reason = excluded.requires_reason, is_active = true;

-- Venta y pagos.
insert into public.sales_channels(code, name, description, sort_order)
values
  ('WHATSAPP', 'WhatsApp', 'Venta coordinada por WhatsApp.', 10),
  ('LIVE', 'Live', 'Venta realizada durante una transmisión en vivo.', 20),
  ('FAIR', 'Feria', 'Venta realizada en feria o evento.', 30),
  ('OTHER', 'Otro', 'Canal configurable o excepcional.', 99)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

insert into public.sale_types(code, name, description)
values
  ('REGULAR', 'Venta regular', 'Venta de productos en stock.'),
  ('PREORDER', 'Preventa', 'Venta de producto asociado a una importación.'),
  ('CUSTOM_ORDER', 'Venta bajo pedido', 'Servicio de búsqueda y compra de un producto específico.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.discount_types(code, name, calculation_mode, description)
values
  ('QUANTITY', 'Descuento por cantidad', 'MANUAL', 'Descuento por llevar dos o más productos.'),
  ('LAST_UNITS', 'Últimas unidades', 'MANUAL', 'Descuento para liquidar las últimas unidades.'),
  ('LIQUIDATION', 'Liquidación', 'MANUAL', 'Descuento por liquidación de temporada.'),
  ('SEASONAL', 'Temporada', 'MANUAL', 'Promoción temporal.'),
  ('PROMOTION', 'Promoción', 'MANUAL', 'Descuento asociado a una promoción.'),
  ('MANUAL', 'Descuento manual autorizado', 'MANUAL', 'Descuento con motivo obligatorio.')
on conflict (code) do update set name = excluded.name, calculation_mode = excluded.calculation_mode, description = excluded.description, is_active = true;

insert into public.payment_methods(code, name, requires_proof)
values
  ('YAPE', 'Yape', true),
  ('TRANSFER', 'Transferencia', true),
  ('CASH', 'Efectivo', false)
on conflict (code) do update set name = excluded.name, requires_proof = excluded.requires_proof, is_active = true;

-- Finanzas.
insert into public.financial_account_types(code, name, description)
values
  ('BANK', 'Cuenta bancaria', 'Cuenta en una entidad bancaria.'),
  ('WALLET', 'Billetera digital', 'Yape u otra billetera digital.'),
  ('CASH', 'Efectivo', 'Caja de efectivo.'),
  ('CREDIT_CARD', 'Tarjeta de crédito', 'Cuenta de obligación o tarjeta utilizada para compras.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.financial_accounts(
  code, name, account_type_code, currency_code, institution_name,
  opening_balance, current_balance, is_active
)
values
  ('BCP-PEN', 'BCP', 'BANK', 'PEN', 'BCP', 0, 0, true),
  ('SCOTIABANK-PEN', 'Scotiabank', 'BANK', 'PEN', 'Scotiabank', 0, 0, true),
  ('YAPE-PEN', 'Yape', 'WALLET', 'PEN', 'Yape', 0, 0, true),
  ('CASH-PEN', 'Efectivo', 'CASH', 'PEN', null, 0, 0, true)
on conflict (code) do update set
  name = excluded.name,
  account_type_code = excluded.account_type_code,
  currency_code = excluded.currency_code,
  institution_name = excluded.institution_name,
  is_active = true;

insert into public.financial_transaction_types(code, name, description)
values
  ('INCOME', 'Ingreso', 'Entrada de dinero.'),
  ('EXPENSE', 'Gasto', 'Salida de dinero.'),
  ('TRANSFER', 'Transferencia', 'Movimiento entre cuentas propias.'),
  ('LOAN_RECEIVED', 'Préstamo recibido', 'Ingreso de dinero por préstamo.'),
  ('LOAN_PAYMENT', 'Pago de préstamo', 'Salida relacionada con una cuota o cancelación de préstamo.'),
  ('ADJUSTMENT', 'Ajuste', 'Corrección documentada de saldo.'),
  ('REFUND', 'Devolución al cliente', 'Salida por reembolso.'),
  ('REVERSAL', 'Reversión', 'Operación compensatoria de una transacción previa.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.financial_categories(code, name, nature, description, sort_order)
values
  ('SALES', 'Ventas', 'INCOME', 'Ingresos confirmados por ventas.', 10),
  ('CUSTOM_ORDER_SALES', 'Venta bajo pedido', 'INCOME', 'Ingreso por servicio de búsqueda y compra bajo pedido.', 20),
  ('PAYROLL', 'Planilla', 'EXPENSE', 'Pagos de planilla.', 100),
  ('SUNAT', 'Pago SUNAT', 'EXPENSE', 'Obligaciones tributarias.', 110),
  ('CUSTOMS', 'Pago aduanas', 'EXPENSE', 'Pagos de aduanas e importación.', 120),
  ('FX', 'Tipo de cambio', 'EXPENSE', 'Diferencias o costos de cambio de moneda.', 130),
  ('MOBILITY', 'Movilidades', 'EXPENSE', 'Movilidad y transporte operativo.', 140),
  ('PACKAGING', 'Compra de embalaje', 'EXPENSE', 'Materiales de embalaje.', 150),
  ('MOTORBIKE', 'Pago motorizado', 'EXPENSE', 'Pago a motorizados o courier.', 160),
  ('AGENCY', 'Pago agencia', 'EXPENSE', 'Pago a agencias de envío.', 170),
  ('LOANS', 'Préstamos', 'LOAN', 'Préstamos recibidos o pagados.', 180),
  ('SERPOST', 'Apoyo Serpost', 'EXPENSE', 'Gastos relacionados con Serpost.', 190),
  ('RETURNS', 'Devoluciones', 'BOTH', 'Devoluciones y reembolsos.', 200),
  ('OTHER', 'Otros', 'BOTH', 'Categoría abierta para operaciones excepcionales.', 999)
on conflict (code) do update set
  name = excluded.name,
  nature = excluded.nature,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- Workflows y estados.
insert into public.workflow_definitions(code, name, description)
values
  ('SALE_COMMERCIAL', 'Estado comercial de venta', 'Ciclo comercial independiente del pago y la entrega.'),
  ('SALE_PAYMENT', 'Estado de pago de venta', 'Situación del saldo de la venta.'),
  ('SALE_DELIVERY', 'Estado global de entrega', 'Situación resumida de las entregas de la venta.'),
  ('PAYMENT', 'Pago', 'Registro, confirmación y reversión de pagos.'),
  ('RECEIPT', 'Boleta', 'Registro de boletas y notas de crédito.'),
  ('RELEASE_REQUEST', 'Solicitud de liberación', 'Solicitud, aprobación y ejecución de liberación.'),
  ('REFUND', 'Devolución de dinero', 'Aprobación y procesamiento de reembolsos.'),
  ('RETURN_CASE', 'Devolución o cambio', 'Caso de devolución o cambio de producto.'),
  ('DELIVERY', 'Entrega', 'Flujo logístico de una entrega.'),
  ('IMPORT', 'Importación', 'Flujo general de una compra internacional.'),
  ('IMPORT_BOX', 'Caja de importación', 'Flujo individual de una caja.'),
  ('FINANCIAL_TRANSACTION', 'Transacción financiera', 'Publicación y reversión del libro financiero.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.workflow_states(workflow_code, state_code, label, sort_order, is_initial, is_terminal)
values
  ('SALE_COMMERCIAL','DRAFT','Borrador',10,true,false),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','Pendiente de confirmación',20,false,false),
  ('SALE_COMMERCIAL','RESERVED','Reservada',30,false,false),
  ('SALE_COMMERCIAL','ACTIVE','Activa',40,false,false),
  ('SALE_COMMERCIAL','COMPLETED','Completada',90,false,true),
  ('SALE_COMMERCIAL','CANCELLED','Cancelada',91,false,true),
  ('SALE_COMMERCIAL','ANNULLED','Anulada',92,false,true),

  ('SALE_PAYMENT','UNPAID','Sin pago confirmado',10,true,false),
  ('SALE_PAYMENT','PARTIAL','Parcialmente pagada',20,false,false),
  ('SALE_PAYMENT','PAID','Pagada',90,false,true),
  ('SALE_PAYMENT','OVERDUE','Vencida',30,false,false),
  ('SALE_PAYMENT','REFUNDED','Reembolsada',91,false,true),

  ('SALE_DELIVERY','PENDING','Pendiente',10,true,false),
  ('SALE_DELIVERY','ACCUMULATED','Acumula almacén',20,false,false),
  ('SALE_DELIVERY','PARTIAL','Parcialmente entregada',30,false,false),
  ('SALE_DELIVERY','DELIVERED','Entregada',90,false,true),
  ('SALE_DELIVERY','CANCELLED','Cancelada',91,false,true),

  ('PAYMENT','PENDING','Pendiente de confirmación',10,true,false),
  ('PAYMENT','CONFIRMED','Confirmado',90,false,true),
  ('PAYMENT','REJECTED','Rechazado',91,false,true),
  ('PAYMENT','REVERSED','Revertido',92,false,true),

  ('RECEIPT','PENDING','Pendiente de emisión',10,true,false),
  ('RECEIPT','ISSUED','Emitida',90,false,false),
  ('RECEIPT','ANNULLED','Anulada',91,false,false),
  ('RECEIPT','CREDIT_NOTE','Con nota de crédito',92,false,true),
  ('RECEIPT','HISTORICAL_WITHOUT_RECEIPT','Venta antigua sin boleta',93,false,true),

  ('RELEASE_REQUEST','REQUESTED','Solicitada',10,true,false),
  ('RELEASE_REQUEST','APPROVED','Aprobada',20,false,false),
  ('RELEASE_REQUEST','REJECTED','Rechazada',90,false,true),
  ('RELEASE_REQUEST','EXECUTED','Ejecutada',91,false,true),
  ('RELEASE_REQUEST','CANCELLED','Cancelada',92,false,true),

  ('REFUND','PENDING','Pendiente',10,true,false),
  ('REFUND','APPROVED','Aprobada',20,false,false),
  ('REFUND','PROCESSED','Procesada',90,false,true),
  ('REFUND','REJECTED','Rechazada',91,false,true),
  ('REFUND','CANCELLED','Cancelada',92,false,true),

  ('RETURN_CASE','OPEN','Abierto',10,true,false),
  ('RETURN_CASE','UNDER_REVIEW','En revisión',20,false,false),
  ('RETURN_CASE','APPROVED','Aprobado',30,false,false),
  ('RETURN_CASE','REJECTED','Rechazado',90,false,true),
  ('RETURN_CASE','COMPLETED','Completado',91,false,true),
  ('RETURN_CASE','CANCELLED','Cancelado',92,false,true),

  ('DELIVERY','PENDING_INSTRUCTIONS','Pendiente de indicaciones',10,true,false),
  ('DELIVERY','ACCUMULATED','Acumula almacén',20,false,false),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','Pendiente de despacho a agencia',30,false,false),
  ('DELIVERY','DELIVERED_TO_AGENCY','Entregado a agencia',40,false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','En reparto',50,false,false),
  ('DELIVERY','PARTIALLY_DELIVERED','Parcialmente entregado',60,false,false),
  ('DELIVERY','DELIVERED_TO_CLIENT','Entregado al cliente',90,false,true),
  ('DELIVERY','CANCELLED','Cancelado',91,false,true),

  ('IMPORT','QUOTATION','Cotización',10,true,false),
  ('IMPORT','PURCHASE_CONFIRMED','Compra confirmada',20,false,false),
  ('IMPORT','FOREIGN_WAREHOUSE','Almacén extranjero',30,false,false),
  ('IMPORT','DISPATCH_CONFIRMED','Confirmación de despacho',40,false,false),
  ('IMPORT','SHIPPED','Embarcado',50,false,false),
  ('IMPORT','IN_TRANSIT','En tránsito',60,false,false),
  ('IMPORT','RECEIVED_PERU','Recibido en Perú',70,false,false),
  ('IMPORT','STOCKED','Ingresado a stock',90,false,true),
  ('IMPORT','CANCELLED','Cancelado',91,false,true),

  ('IMPORT_BOX','REGISTERED','Registrada',10,true,false),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','Almacén extranjero',20,false,false),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','Confirmación de despacho',30,false,false),
  ('IMPORT_BOX','SHIPPED','Embarcada',40,false,false),
  ('IMPORT_BOX','IN_TRANSIT','En tránsito',50,false,false),
  ('IMPORT_BOX','RECEIVED_PERU','Recibida en Perú',60,false,false),
  ('IMPORT_BOX','STOCKED','Ingresada a stock',90,false,true),
  ('IMPORT_BOX','CANCELLED','Cancelada',91,false,true),

  ('FINANCIAL_TRANSACTION','DRAFT','Borrador',10,true,false),
  ('FINANCIAL_TRANSACTION','POSTED','Publicada',20,false,false),
  ('FINANCIAL_TRANSACTION','REVERSED','Revertida',90,false,true),
  ('FINANCIAL_TRANSACTION','CANCELLED','Cancelada',91,false,true)
on conflict (workflow_code, state_code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_initial = excluded.is_initial,
  is_terminal = excluded.is_terminal,
  is_active = true;

-- Transiciones. Requieren motivo cuando la operación es destructiva o compensatoria.
insert into public.workflow_transitions(
  workflow_code, from_state_code, to_state_code, requires_confirmation, requires_reason
)
values
  ('SALE_COMMERCIAL','DRAFT','PENDING_CONFIRMATION',false,false),
  ('SALE_COMMERCIAL','DRAFT','RESERVED',true,false),
  ('SALE_COMMERCIAL','DRAFT','CANCELLED',true,true),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','RESERVED',true,false),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','CANCELLED',true,true),
  ('SALE_COMMERCIAL','RESERVED','ACTIVE',false,false),
  ('SALE_COMMERCIAL','RESERVED','COMPLETED',true,false),
  ('SALE_COMMERCIAL','RESERVED','CANCELLED',true,true),
  ('SALE_COMMERCIAL','RESERVED','ANNULLED',true,true),
  ('SALE_COMMERCIAL','ACTIVE','COMPLETED',true,false),
  ('SALE_COMMERCIAL','ACTIVE','CANCELLED',true,true),
  ('SALE_COMMERCIAL','ACTIVE','ANNULLED',true,true),

  ('SALE_PAYMENT','UNPAID','PARTIAL',false,false),
  ('SALE_PAYMENT','UNPAID','PAID',false,false),
  ('SALE_PAYMENT','UNPAID','OVERDUE',false,false),
  ('SALE_PAYMENT','PARTIAL','PAID',false,false),
  ('SALE_PAYMENT','PARTIAL','OVERDUE',false,false),
  ('SALE_PAYMENT','PARTIAL','UNPAID',true,true),
  ('SALE_PAYMENT','PAID','PARTIAL',true,true),
  ('SALE_PAYMENT','PAID','OVERDUE',true,true),
  ('SALE_PAYMENT','PAID','UNPAID',true,true),
  ('SALE_PAYMENT','PAID','REFUNDED',true,true),
  ('SALE_PAYMENT','OVERDUE','PARTIAL',false,false),
  ('SALE_PAYMENT','OVERDUE','PAID',false,false),
  ('SALE_PAYMENT','OVERDUE','UNPAID',true,true),
  ('SALE_PAYMENT','REFUNDED','UNPAID',true,true),
  ('SALE_PAYMENT','REFUNDED','PARTIAL',true,true),

  ('SALE_DELIVERY','PENDING','ACCUMULATED',false,false),
  ('SALE_DELIVERY','PENDING','PARTIAL',false,false),
  ('SALE_DELIVERY','PENDING','DELIVERED',false,false),
  ('SALE_DELIVERY','PENDING','CANCELLED',true,true),
  ('SALE_DELIVERY','ACCUMULATED','PARTIAL',false,false),
  ('SALE_DELIVERY','ACCUMULATED','DELIVERED',false,false),
  ('SALE_DELIVERY','ACCUMULATED','CANCELLED',true,true),
  ('SALE_DELIVERY','PARTIAL','DELIVERED',false,false),
  ('SALE_DELIVERY','PARTIAL','ACCUMULATED',false,false),
  ('SALE_DELIVERY','PARTIAL','CANCELLED',true,true),

  ('PAYMENT','PENDING','CONFIRMED',true,false),
  ('PAYMENT','PENDING','REJECTED',true,true),
  ('PAYMENT','CONFIRMED','REVERSED',true,true),

  ('RECEIPT','PENDING','ISSUED',false,false),
  ('RECEIPT','PENDING','HISTORICAL_WITHOUT_RECEIPT',true,true),
  ('RECEIPT','ISSUED','ANNULLED',true,true),
  ('RECEIPT','ANNULLED','CREDIT_NOTE',false,false),

  ('RELEASE_REQUEST','REQUESTED','APPROVED',true,false),
  ('RELEASE_REQUEST','REQUESTED','REJECTED',true,true),
  ('RELEASE_REQUEST','REQUESTED','CANCELLED',true,true),
  ('RELEASE_REQUEST','APPROVED','EXECUTED',true,false),
  ('RELEASE_REQUEST','APPROVED','CANCELLED',true,true),

  ('REFUND','PENDING','APPROVED',true,false),
  ('REFUND','PENDING','REJECTED',true,true),
  ('REFUND','PENDING','CANCELLED',true,true),
  ('REFUND','APPROVED','PROCESSED',true,false),
  ('REFUND','APPROVED','CANCELLED',true,true),

  ('RETURN_CASE','OPEN','UNDER_REVIEW',false,false),
  ('RETURN_CASE','OPEN','CANCELLED',true,true),
  ('RETURN_CASE','UNDER_REVIEW','APPROVED',true,false),
  ('RETURN_CASE','UNDER_REVIEW','REJECTED',true,true),
  ('RETURN_CASE','APPROVED','COMPLETED',true,false),
  ('RETURN_CASE','APPROVED','CANCELLED',true,true),

  ('DELIVERY','PENDING_INSTRUCTIONS','ACCUMULATED',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','PENDING_AGENCY_DISPATCH',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','OUT_FOR_DELIVERY',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','CANCELLED',true,true),
  ('DELIVERY','ACCUMULATED','PENDING_AGENCY_DISPATCH',false,false),
  ('DELIVERY','ACCUMULATED','OUT_FOR_DELIVERY',false,false),
  ('DELIVERY','ACCUMULATED','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','ACCUMULATED','CANCELLED',true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','DELIVERED_TO_AGENCY',false,false),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','CANCELLED',true,true),
  ('DELIVERY','DELIVERED_TO_AGENCY','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','DELIVERED_TO_AGENCY','PARTIALLY_DELIVERED',false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','PARTIALLY_DELIVERED',false,false),
  ('DELIVERY','PARTIALLY_DELIVERED','DELIVERED_TO_CLIENT',false,false),

  ('IMPORT','QUOTATION','PURCHASE_CONFIRMED',true,false),
  ('IMPORT','QUOTATION','CANCELLED',true,true),
  ('IMPORT','PURCHASE_CONFIRMED','FOREIGN_WAREHOUSE',false,false),
  ('IMPORT','PURCHASE_CONFIRMED','CANCELLED',true,true),
  ('IMPORT','FOREIGN_WAREHOUSE','DISPATCH_CONFIRMED',false,false),
  ('IMPORT','FOREIGN_WAREHOUSE','CANCELLED',true,true),
  ('IMPORT','DISPATCH_CONFIRMED','SHIPPED',false,false),
  ('IMPORT','DISPATCH_CONFIRMED','CANCELLED',true,true),
  ('IMPORT','SHIPPED','IN_TRANSIT',false,false),
  ('IMPORT','IN_TRANSIT','RECEIVED_PERU',false,false),
  ('IMPORT','RECEIVED_PERU','STOCKED',true,false),

  ('IMPORT_BOX','REGISTERED','FOREIGN_WAREHOUSE',false,false),
  ('IMPORT_BOX','REGISTERED','CANCELLED',true,true),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','DISPATCH_CONFIRMED',false,false),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','CANCELLED',true,true),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','SHIPPED',false,false),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','CANCELLED',true,true),
  ('IMPORT_BOX','SHIPPED','IN_TRANSIT',false,false),
  ('IMPORT_BOX','IN_TRANSIT','RECEIVED_PERU',false,false),
  ('IMPORT_BOX','RECEIVED_PERU','STOCKED',true,false),

  ('FINANCIAL_TRANSACTION','DRAFT','POSTED',true,false),
  ('FINANCIAL_TRANSACTION','DRAFT','CANCELLED',true,true),
  ('FINANCIAL_TRANSACTION','POSTED','REVERSED',true,true)
on conflict (workflow_code, from_state_code, to_state_code) do update set
  requires_confirmation = excluded.requires_confirmation,
  requires_reason = excluded.requires_reason,
  is_active = true;

-- Tipos de notificación.
insert into public.notification_types(code, name, default_priority, default_channels, description)
values
  ('PAYMENT_DUE_SOON', 'Pago próximo a vencer', 'HIGH', array['IN_APP','PUSH'], 'Aviso anticipado del vencimiento de una venta.'),
  ('PAYMENT_OVERDUE', 'Pago vencido', 'CRITICAL', array['IN_APP','PUSH'], 'Venta con saldo posterior al vencimiento.'),
  ('STOCK_LOW', 'Stock bajo', 'HIGH', array['IN_APP','PUSH'], 'La disponibilidad alcanzó el mínimo configurado.'),
  ('IMPORT_ARRIVAL_SOON', 'Importación próxima a llegar', 'NORMAL', array['IN_APP','PUSH'], 'Fecha estimada próxima.'),
  ('IMPORT_DELAYED', 'Importación retrasada', 'HIGH', array['IN_APP','PUSH'], 'La importación superó la fecha estimada.'),
  ('MERCHANDISE_RECEIVED', 'Ingreso de mercadería', 'HIGH', array['IN_APP','PUSH'], 'Mercadería recibida o ingresada a stock.'),
  ('CARD_PAYMENT_DUE', 'Pago de tarjeta', 'HIGH', array['IN_APP','PUSH'], 'Obligación de tarjeta próxima a vencer.'),
  ('SUNAT_PAYMENT_DUE', 'Pago a SUNAT', 'HIGH', array['IN_APP','PUSH'], 'Obligación tributaria próxima a vencer.'),
  ('DISPATCH_PENDING', 'Despacho pendiente', 'HIGH', array['IN_APP','PUSH'], 'Entrega programada para el próximo día de despacho.'),
  ('RECEIPT_PENDING', 'Boleta pendiente', 'HIGH', array['IN_APP'], 'Pago confirmado sin boleta registrada.'),
  ('SALE_CONFIRMED', 'Venta confirmada', 'NORMAL', array['IN_APP'], 'Venta confirmada y stock reservado.'),
  ('PAYMENT_CONFIRMED', 'Pago confirmado', 'NORMAL', array['IN_APP'], 'Ingreso financiero generado por un pago.'),
  ('PAYMENT_REVERSED', 'Pago revertido', 'CRITICAL', array['IN_APP','PUSH'], 'Pago y movimiento financiero revertidos.'),
  ('WEEKLY_SUMMARY', 'Resumen semanal', 'NORMAL', array['EMAIL'], 'Reporte semanal configurable.')
on conflict (code) do update set
  name = excluded.name,
  default_priority = excluded.default_priority,
  default_channels = excluded.default_channels,
  description = excluded.description,
  is_active = true;

commit;
