import { useEffect } from 'react';

const translations: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  ACCUMULATED: 'Acumulada',
  DAMAGED: 'Dañado',
  LOST: 'Perdido',
  IN_TRANSIT: 'En tránsito',
  PREORDER: 'Preventa',
  PREORDER_PENDING: 'Preventa pendiente',
  QUOTATION: 'Cotización',
  PURCHASE_CONFIRMED: 'Compra confirmada',
  REGISTERED: 'Registrada',
  FOREIGN_WAREHOUSE: 'En almacén internacional',
  DISPATCH_CONFIRMED: 'Despacho confirmado',
  SHIPPED: 'Enviada',
  RECEIVED_PERU: 'Recibida en Perú',
  STOCKED: 'Ingresada a stock',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
  DELIVERED: 'Entregada',
  PARTIAL: 'Parcial',
  PARTIALLY_DELIVERED: 'Entrega parcial',
  WITHOUT_PAYMENT: 'Sin pago',
  UNPAID: 'Sin pago',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  VOIDED: 'Anulada',
  OPEN: 'Abierta',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
  SUBMITTED: 'Presentada',
  APPROVED: 'Aprobada',
  PARTIALLY_APPROVED: 'Aprobada parcialmente',
  REJECTED: 'Rechazada',
  INSERT: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  OTHER: 'Otra acción',
  ADMIN: 'Administradora',
  OWNER: 'Propietaria',
  OPERATIONAL: 'Operativo',
  VIRTUAL: 'Virtual',
  INTERNATIONAL: 'Internacional',
  FOREIGN: 'Internacional',
  CASH: 'Efectivo',
  BANK: 'Banco',
  DIGITAL_WALLET: 'Billetera digital',
  CREDIT_CARD: 'Tarjeta de crédito',
  AIR: 'Aéreo',
  SEA: 'Marítimo',
};

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const current = node.nodeValue ?? '';
    const trimmed = current.trim();
    const translated = translations[trimmed];
    if (!translated) return;
    node.nodeValue = current.replace(trimmed, translated);
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.matches('script, style, code, pre, input, textarea, option')) return;
  for (const child of node.childNodes) translateNode(child);
}

export function GlobalLocalizationBridge() {
  useEffect(() => {
    translateNode(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') translateNode(record.target);
        for (const node of record.addedNodes) translateNode(node);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
