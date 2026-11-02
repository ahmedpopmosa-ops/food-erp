import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { ApiError } from '@ros/contracts';
import type { AppRequest } from './auth-context';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'http.badRequest',
  401: 'auth.unauthenticated',
  403: 'auth.forbidden',
  404: 'http.notFound',
  405: 'http.methodNotAllowed',
  409: 'conflict',
  413: 'http.payloadTooLarge',
  415: 'http.unsupportedMediaType',
  429: 'http.tooManyRequests',
};

/** Every error leaves the API as `{ statusCode, code, message, details? }`; internals are logged, never returned. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<AppRequest>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        {
          requestId: req.id,
          path: req.path,
          err:
            exception instanceof Error
              ? { name: exception.name, message: exception.message, stack: exception.stack }
              : exception,
        },
        'Unhandled error',
      );
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'code' in response) return response as ApiError;
      const message =
        typeof response === 'string' ? response : ((response as { message?: unknown }).message ?? exception.message);
      return { statusCode: status, code: CODE_BY_STATUS[status] ?? `http.${status}`, message: String(message) };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002')
        return { statusCode: 409, code: 'conflict.duplicate', message: 'A record with these values already exists' };
      if (exception.code === 'P2025') return { statusCode: 404, code: 'http.notFound', message: 'Record not found' };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'internal', message: 'Internal server error' };
  }
}
