import type {
  CreateDeliveryInput,
  DeliveryDetail,
  DeliveryMethod,
  DeliveryStateCode,
  UpdateDeliveryInput,
  UpdateDeliveryStateInput,
  UpsertDeliveryPartnerInput,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import type { DeliveriesRepository, DeliveryListQuery } from './deliveries.repository.js';

const stateNames: Record<DeliveryStateCode, string> = {
  PENDING_INSTRUCTIONS: 'Pendiente de indicaciones',
  ACCUMULATED: 'Acumula almacén',
  PENDING_AGENCY_DISPATCH: 'Pendiente de despacho a agencia',
  DELIVERED_TO_AGENCY: 'Entregado a agencia',
  OUT_FOR_DELIVERY: 'En reparto',
  PARTIALLY_DELIVERED: 'Parcialmente entregado',
  DELIVERED_TO_CLIENT: 'Entregado al cliente',
  CANCELLED: 'Cancelada',
};

const terminalStates = new Set<DeliveryStateCode>(['DELIVERED_TO_CLIENT', 'CANCELLED']);

function agencyTransitions(state: DeliveryStateCode): DeliveryStateCode[] {
  switch (state) {
    case 'PENDING_INSTRUCTIONS':
      return ['PENDING_AGENCY_DISPATCH', 'ACCUMULATED', 'CANCELLED'];
    case 'ACCUMULATED':
      return ['PENDING_AGENCY_DISPATCH', 'CANCELLED'];
    case 'PENDING_AGENCY_DISPATCH':
      return ['DELIVERED_TO_AGENCY', 'CANCELLED'];
    case 'DELIVERED_TO_AGENCY':
      return ['DELIVERED_TO_CLIENT', 'CANCELLED'];
    case 'OUT_FOR_DELIVERY':
    case 'PARTIALLY_DELIVERED':
      return ['DELIVERED_TO_CLIENT', 'CANCELLED'];
    default:
      return [];
  }
}

function motorbikeOrOtherTransitions(state: DeliveryStateCode): DeliveryStateCode[] {
  switch (state) {
    case 'PENDING_INSTRUCTIONS':
    case 'ACCUMULATED':
    case 'PENDING_AGENCY_DISPATCH':
      return ['OUT_FOR_DELIVERY', 'CANCELLED'];
    case 'OUT_FOR_DELIVERY':
    case 'PARTIALLY_DELIVERED':
      return ['DELIVERED_TO_CLIENT', 'CANCELLED'];
    default:
      return [];
  }
}

function inPersonTransitions(state: DeliveryStateCode): DeliveryStateCode[] {
  switch (state) {
    case 'PENDING_INSTRUCTIONS':
    case 'ACCUMULATED':
      return ['DELIVERED_TO_CLIENT', 'CANCELLED'];
    default:
      return [];
  }
}

function accumulatedTransitions(state: DeliveryStateCode): DeliveryStateCode[] {
  if (state === 'PENDING_INSTRUCTIONS') return ['ACCUMULATED', 'CANCELLED'];
  return [];
}

export function getAllowedDeliveryTransitionCodes(
  method: DeliveryMethod,
  state: DeliveryStateCode,
): DeliveryStateCode[] {
  if (terminalStates.has(state)) return [];
  switch (method) {
    case 'AGENCY':
      return agencyTransitions(state);
    case 'MOTORBIKE':
    case 'OTHER':
      return motorbikeOrOtherTransitions(state);
    case 'IN_PERSON':
      return inPersonTransitions(state);
    case 'WAREHOUSE_ACCUMULATION':
      return accumulatedTransitions(state);
  }
}

function normalizeAllowedTransitions(detail: DeliveryDetail): DeliveryDetail['allowedTransitions'] {
  const allowedCodes = getAllowedDeliveryTransitionCodes(detail.deliveryMethod, detail.stateCode);
  const repositoryTransitions = new Map(
    detail.allowedTransitions.map((transition) => [transition.stateCode, transition]),
  );
  return allowedCodes.map(
    (stateCode) =>
      repositoryTransitions.get(stateCode) ?? {
        stateCode,
        name: stateNames[stateCode],
        requiresReason: true,
      },
  );
}

export class DeliveriesService {
  public constructor(private readonly repository: DeliveriesRepository) {}

  public list(query: DeliveryListQuery) {
    return this.repository.list(query);
  }

  public listPartners() {
    return this.repository.listPartners();
  }

  public upsertPartner(input: UpsertDeliveryPartnerInput) {
    return this.repository.upsertPartner(input);
  }

  public getSupportData(saleId?: string | undefined, deliveryId?: string | undefined) {
    return this.repository.getSupportData(saleId, deliveryId);
  }

  public async getById(deliveryId: string): Promise<DeliveryDetail> {
    const detail = await this.repository.getById(deliveryId);
    return { ...detail, allowedTransitions: normalizeAllowedTransitions(detail) };
  }

  public create(input: CreateDeliveryInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public update(deliveryId: string, input: UpdateDeliveryInput) {
    return this.repository.update(deliveryId, input);
  }

  public async advance(deliveryId: string, input: UpdateDeliveryStateInput) {
    const current = await this.repository.getById(deliveryId);
    const allowed = getAllowedDeliveryTransitionCodes(current.deliveryMethod, current.stateCode);
    if (!allowed.includes(input.nextStateCode)) {
      throw new AppError({
        code: 'INVALID_DELIVERY_TRANSITION',
        message: `No se puede pasar de “${stateNames[current.stateCode]}” a “${stateNames[input.nextStateCode]}”. Continúa con el siguiente paso logístico.`,
        statusCode: 409,
        details: {
          currentStateCode: current.stateCode,
          requestedStateCode: input.nextStateCode,
          allowedStateCodes: allowed,
        },
      });
    }
    const trackingNumber = input.trackingNumber?.trim() || current.trackingNumber;
    if (input.nextStateCode === 'DELIVERED_TO_AGENCY' && !trackingNumber) {
      throw new AppError({
        code: 'DELIVERY_TRACKING_REQUIRED',
        message: 'Registra el número de seguimiento entregado por la agencia.',
        statusCode: 422,
      });
    }
    return this.repository.advance(deliveryId, {
      ...input,
      trackingNumber: trackingNumber ?? null,
    });
  }
}
