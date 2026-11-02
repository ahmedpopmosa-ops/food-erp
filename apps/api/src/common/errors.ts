import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * API error with a stable, translatable `code` (e.g. "branches.duplicateCode"). Clients map codes to
 * localized messages; `message` is an English fallback for logs and API consumers.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const notFound = (entity: string) =>
  new AppError(HttpStatus.NOT_FOUND, `${entity}.notFound`, `${entity} not found`);
export const forbidden = (code = 'auth.forbidden', message = 'You do not have permission to do this') =>
  new AppError(HttpStatus.FORBIDDEN, code, message);
export const unauthorized = (code = 'auth.unauthenticated') =>
  new AppError(HttpStatus.UNAUTHORIZED, code, 'Authentication required');
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const staleVersion = () =>
  conflict('conflict.stale', 'This record was changed by someone else; reload and try again');

export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
