import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditLogSchema,
  dashboardSchema,
  notificationListSchema,
  reportDataSchema,
} from '@yukimi/shared';

const id = '11111111-1111-4111-8111-111111111111';

test('dashboard contract accepts an empty real-data response', () => {
  const parsed = dashboardSchema.parse({
    businessDate: '2026-07-30',
    summary: {
      salesTodayCount: 0,
      salesTodayAmount: 0,
      confirmedPaymentsToday: 0,
      paymentsDueSoon: 0,
      overduePayments: 0,
      pendingDeliveries: 0,
      pendingReceipts: 0,
      lowStockVariants: 0,
      activeImports: 0,
      transitBoxes: 0,
      delayedImports: 0,
    },
    weekly: [],
    accounts: [],
    priorities: [],
    recentActivity: [],
    recentSales: [],
  });
  assert.equal(parsed.summary.salesTodayAmount, 0);
});

test('notification contract preserves priority and status', () => {
  const parsed = notificationListSchema.parse({
    unreadCount: 1,
    items: [
      {
        id,
        typeCode: 'PAYMENT_OVERDUE',
        typeName: 'Pago vencido',
        title: 'Pago vencido',
        body: 'Saldo pendiente.',
        priority: 'CRITICAL',
        status: 'NEW',
        actionUrl: `/ventas/${id}`,
        relatedEntityType: 'SALE',
        relatedEntityId: id,
        metadata: {},
        createdAt: '2026-07-30T01:00:00.000Z',
        readAt: null,
      },
    ],
  });
  assert.equal(parsed.items[0]?.priority, 'CRITICAL');
});

test('report and audit contracts accept empty datasets', () => {
  const report = reportDataSchema.parse({
    generatedAt: '2026-07-30T01:00:00.000Z',
    period: {
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      previousStartDate: '2026-06-01',
      previousEndDate: '2026-06-30',
    },
    warehouses: [],
    summary: {
      netSales: 0,
      collected: 0,
      estimatedCost: 0,
      estimatedProfit: 0,
      averageTicket: 0,
      outstandingBalance: 0,
      salesCount: 0,
      unitsSold: 0,
      previousNetSales: 0,
      salesChangePercent: null,
    },
    daily: [],
    topProducts: [],
    categories: [],
    topClients: [],
    inventory: { availableUnits: 0, reservedUnits: 0, lowStockVariants: 0, valuationPen: 0 },
    lowStock: [],
    channels: [],
  });
  const audit = auditLogSchema.parse({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
    summary: { last30Days: 0, sensitiveActions: 0, actors: [] },
  });
  assert.equal(report.summary.salesCount, 0);
  assert.equal(audit.total, 0);
});
