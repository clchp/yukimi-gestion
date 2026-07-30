import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  confirmBankReconciliationSchema,
  createCashClosureSchema,
  createFinanceCategorySchema,
  createFinanceTransferSchema,
  createManualFinanceTransactionSchema,
  createObligationSchema,
  createReceivedLoanSchema,
  financeActionReasonSchema,
  financeAttachmentRegistrationSchema,
  importBankStatementSchema,
  payLoanInstallmentSchema,
  payObligationSchema,
  updateFinanceCategorySchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { FinanceService } from './finance.service.js';
import { SupabaseFinanceRepository } from './supabase-finance.repository.js';

function accessTokenOrThrow(token: string | undefined): string {
  if (!token)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  return token;
}

const transactionListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  type: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const reconciliationQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
});

export function createFinanceRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request): FinanceService {
    return new FinanceService(
      new SupabaseFinanceRepository(
        clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
      ),
    );
  }

  router.get('/support-data', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getSupportData() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getDashboard() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/transactions', async (request, response, next) => {
    try {
      const query = transactionListQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request).listTransactions(query) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/categories', async (request, response, next) => {
    try {
      response.status(201).json({
        data: await serviceFor(request).createCategory(
          createFinanceCategorySchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/categories/:categoryId', async (request, response, next) => {
    try {
      const categoryId = z.string().uuid().parse(request.params.categoryId);
      response.json({
        data: await serviceFor(request).updateCategory(
          categoryId,
          updateFinanceCategorySchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/transactions', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).createManualTransaction(
          createManualFinanceTransactionSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/transfers', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).createTransfer(
          createFinanceTransferSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/transactions/:transactionId/reverse', async (request, response, next) => {
    try {
      const transactionId = z.string().uuid().parse(request.params.transactionId);
      const { reason } = financeActionReasonSchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({
        data: await serviceFor(request).reverseTransaction(transactionId, reason, key),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/transactions/:transactionId/attachments', async (request, response, next) => {
    try {
      const transactionId = z.string().uuid().parse(request.params.transactionId);
      response.status(201).json({
        data: await serviceFor(request).registerAttachment(
          transactionId,
          financeAttachmentRegistrationSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/obligations', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).createObligation(
          createObligationSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/obligations/:obligationId/pay', async (request, response, next) => {
    try {
      const obligationId = z.string().uuid().parse(request.params.obligationId);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({
        data: await serviceFor(request).payObligation(
          obligationId,
          payObligationSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/loans', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).createReceivedLoan(
          createReceivedLoanSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/loan-installments/:installmentId/pay', async (request, response, next) => {
    try {
      const installmentId = z.string().uuid().parse(request.params.installmentId);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({
        data: await serviceFor(request).payLoanInstallment(
          installmentId,
          payLoanInstallmentSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cash-closures', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).createCashClosure(
          createCashClosureSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/bank-reconciliation', async (request, response, next) => {
    try {
      const query = reconciliationQuerySchema.parse(request.query);
      response.json({
        data: await serviceFor(request).getBankReconciliation(query.accountId, query.batchId),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-statements/import', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(request).importBankStatement(
          importBankStatementSchema.parse(request.body),
          key,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-rows/:rowId/reconcile', async (request, response, next) => {
    try {
      const rowId = z.string().uuid().parse(request.params.rowId);
      response.json({
        data: await serviceFor(request).confirmBankReconciliation(
          rowId,
          confirmBankReconciliationSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-candidates/:candidateId/dismiss', async (request, response, next) => {
    try {
      const candidateId = z.string().uuid().parse(request.params.candidateId);
      const { reason } = financeActionReasonSchema.parse(request.body);
      response.json({ data: await serviceFor(request).dismissBankCandidate(candidateId, reason) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-rows/:rowId/ignore', async (request, response, next) => {
    try {
      const rowId = z.string().uuid().parse(request.params.rowId);
      const { reason } = financeActionReasonSchema.parse(request.body);
      response.json({ data: await serviceFor(request).ignoreBankRow(rowId, reason) });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/bank-reconciliations/:reconciliationId/reverse',
    async (request, response, next) => {
      try {
        const reconciliationId = z.string().uuid().parse(request.params.reconciliationId);
        const { reason } = financeActionReasonSchema.parse(request.body);
        response.json({
          data: await serviceFor(request).reverseBankReconciliation(reconciliationId, reason),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
