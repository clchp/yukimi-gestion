import { AppError } from '../errors/app-error.js';

interface DatabaseErrorLike {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

const duplicateCodes = new Set(['23505']);
const foreignKeyCodes = new Set(['23503']);
const checkCodes = new Set(['23514', '23502', '22P02', 'P0001']);

export function mapSupabaseError(error: DatabaseErrorLike, fallbackMessage: string): AppError {
  if (duplicateCodes.has(error.code)) {
    return new AppError({
      code: 'DUPLICATE_RECORD',
      message: 'Ya existe un registro con esos datos.',
      statusCode: 409,
      details: { databaseCode: error.code, hint: error.hint },
      cause: error,
    });
  }

  if (foreignKeyCodes.has(error.code)) {
    return new AppError({
      code: 'RELATED_RECORD_NOT_FOUND',
      message: 'Uno de los registros relacionados no existe o ya no está disponible.',
      statusCode: 409,
      details: { databaseCode: error.code, hint: error.hint },
      cause: error,
    });
  }


  if (error.code === '40001') {
    return new AppError({
      code: 'OPTIMISTIC_LOCK_CONFLICT',
      message: error.message || 'El registro fue modificado por otra administradora.',
      statusCode: 409,
      details: { databaseCode: error.code },
      cause: error,
    });
  }

  if (error.code === 'P0002') {
    return new AppError({
      code: 'RECORD_NOT_FOUND',
      message: error.message || 'El registro solicitado no existe.',
      statusCode: 404,
      details: { databaseCode: error.code },
      cause: error,
    });
  }

  if (error.code === '42501') {
    return new AppError({
      code: 'FORBIDDEN_OPERATION',
      message: 'Tu cuenta no tiene autorización para realizar esta operación.',
      statusCode: 403,
      cause: error,
    });
  }

  if (checkCodes.has(error.code)) {
    return new AppError({
      code: 'BUSINESS_RULE_VIOLATION',
      message: error.message || fallbackMessage,
      statusCode: 422,
      details: { databaseCode: error.code, hint: error.hint },
      cause: error,
    });
  }

  return new AppError({
    code: 'DATABASE_OPERATION_FAILED',
    message: fallbackMessage,
    statusCode: 503,
    details: { databaseCode: error.code, message: error.message, hint: error.hint },
    cause: error,
  });
}
