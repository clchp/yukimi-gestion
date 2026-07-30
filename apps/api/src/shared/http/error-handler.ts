import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError({
      code: 'ROUTE_NOT_FOUND',
      message: `No existe la ruta ${request.method} ${request.originalUrl}.`,
      statusCode: 404,
    }),
  );
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        details: error.flatten(),
        requestId: request.requestId,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    request.log.warn({ error, code: error.code }, error.message);
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId: request.requestId,
      },
    });
    return;
  }

  request.log.error({ error }, 'Error no controlado');
  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno inesperado.',
      requestId: request.requestId,
    },
  });
};
