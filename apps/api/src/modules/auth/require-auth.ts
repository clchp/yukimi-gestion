import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import type { SupabaseAuthGateway } from './supabase-auth.gateway.js';

function readBearerToken(request: Request): string {
  const authorization = request.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError({
      code: 'AUTHORIZATION_REQUIRED',
      message: 'Debes iniciar sesión para realizar esta operación.',
      statusCode: 401,
    });
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError({
      code: 'AUTHORIZATION_REQUIRED',
      message: 'No se recibió un token de sesión.',
      statusCode: 401,
    });
  }

  return token;
}

export function requireAuth(authGateway: SupabaseAuthGateway) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const accessToken = readBearerToken(request);
      request.currentAccessToken = accessToken;
      request.currentUser = await authGateway.authenticate(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}
