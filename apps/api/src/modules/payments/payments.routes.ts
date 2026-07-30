import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  createCreditNoteSchema,
  createPaymentSchema,
  createReceiptSchema,
  paymentActionReasonSchema,
  paymentAttachmentRegistrationSchema,
  receiptAttachmentRegistrationSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { PaymentsService } from './payments.service.js';
import { SupabasePaymentsRepository } from './supabase-payments.repository.js';

function actorIdOrThrow(id: string | undefined): string {
  if (!id) throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró el usuario de la sesión.', statusCode: 401 });
  return id;
}
function accessTokenOrThrow(token: string | undefined): string {
  if (!token) throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró la sesión.', statusCode: 401 });
  return token;
}

export function createPaymentsRouter(authGateway: SupabaseAuthGateway, clientFactory: UserSupabaseClientFactory): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request) {
    return new PaymentsService(new SupabasePaymentsRepository(
      clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
      actorIdOrThrow(request.currentUser?.id),
    ));
  }

  router.get('/support-data', async (request, response, next) => {
    try { response.json({ data: await serviceFor(request).getSupportData() }); } catch (error) { next(error); }
  });

  router.get('/sales/:saleId', async (request, response, next) => {
    try { response.json({ data: await serviceFor(request).getSaleFinancials(z.string().uuid().parse(request.params.saleId)) }); } catch (error) { next(error); }
  });

  router.post('/sales/:saleId', async (request, response, next) => {
    try {
      const saleId = z.string().uuid().parse(request.params.saleId);
      const input = createPaymentSchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).createPayment(saleId, input, key) });
    } catch (error) { next(error); }
  });

  router.post('/:paymentId/attachments', async (request, response, next) => {
    try {
      const paymentId = z.string().uuid().parse(request.params.paymentId);
      const input = paymentAttachmentRegistrationSchema.parse(request.body);
      response.status(201).json({ data: await serviceFor(request).registerPaymentAttachment(paymentId, input) });
    } catch (error) { next(error); }
  });

  router.post('/:paymentId/confirm', async (request, response, next) => {
    try {
      const paymentId = z.string().uuid().parse(request.params.paymentId);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({ data: await serviceFor(request).confirmPayment(paymentId, key) });
    } catch (error) { next(error); }
  });

  router.post('/:paymentId/reject', async (request, response, next) => {
    try {
      const paymentId = z.string().uuid().parse(request.params.paymentId);
      const { reason } = paymentActionReasonSchema.parse(request.body);
      response.json({ data: await serviceFor(request).rejectPayment(paymentId, reason) });
    } catch (error) { next(error); }
  });

  router.post('/:paymentId/reverse', async (request, response, next) => {
    try {
      const paymentId = z.string().uuid().parse(request.params.paymentId);
      const { reason } = paymentActionReasonSchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({ data: await serviceFor(request).reversePayment(paymentId, reason, key) });
    } catch (error) { next(error); }
  });

  router.post('/sales/:saleId/receipts', async (request, response, next) => {
    try {
      const saleId = z.string().uuid().parse(request.params.saleId);
      const input = createReceiptSchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).createReceipt(saleId, input, key) });
    } catch (error) { next(error); }
  });

  router.post('/receipts/:receiptId/attachments', async (request, response, next) => {
    try {
      const receiptId = z.string().uuid().parse(request.params.receiptId);
      const input = receiptAttachmentRegistrationSchema.parse(request.body);
      response.status(201).json({ data: await serviceFor(request).registerReceiptAttachment(receiptId, input) });
    } catch (error) { next(error); }
  });

  router.post('/receipts/:receiptId/annul', async (request, response, next) => {
    try {
      const receiptId = z.string().uuid().parse(request.params.receiptId);
      const { reason } = paymentActionReasonSchema.parse(request.body);
      response.json({ data: await serviceFor(request).annulReceipt(receiptId, reason) });
    } catch (error) { next(error); }
  });

  router.post('/receipts/:receiptId/credit-notes', async (request, response, next) => {
    try {
      const receiptId = z.string().uuid().parse(request.params.receiptId);
      const input = createCreditNoteSchema.parse(request.body);
      response.status(201).json({ data: await serviceFor(request).createCreditNote(receiptId, input) });
    } catch (error) { next(error); }
  });

  router.post('/sales/:saleId/late-penalty', async (request, response, next) => {
    try { response.json({ data: await serviceFor(request).calculateLatePenalty(z.string().uuid().parse(request.params.saleId)) }); } catch (error) { next(error); }
  });

  router.post('/penalties/:penaltyId/waive', async (request, response, next) => {
    try {
      const penaltyId = z.string().uuid().parse(request.params.penaltyId);
      const { reason } = paymentActionReasonSchema.parse(request.body);
      response.json({ data: await serviceFor(request).waivePenalty(penaltyId, reason) });
    } catch (error) { next(error); }
  });

  return router;
}
