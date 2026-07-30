import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppLogger } from '../logging/logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: AppLogger;
    }
  }
}

export function requestContext(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const incomingRequestId = request.header('x-request-id');
    request.requestId = incomingRequestId?.trim() || randomUUID();
    request.log = logger.child({ requestId: request.requestId });
    response.setHeader('x-request-id', request.requestId);
    next();
  };
}
