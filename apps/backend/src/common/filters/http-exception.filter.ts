// Global exception filter that wraps every error response in the
// `{ success: false, error: { code, message } }` envelope expected by the
// frontend's API client.
//
// Status-code → error-code mapping:
//   400  → VALIDATION_ERROR
//   401  → UNAUTHORIZED
//   403  → FORBIDDEN
//   404  → NOT_FOUND
//   409  → CONFLICT
//   429  → RATE_LIMITED
//   5xx  → INTERNAL_ERROR
//
// We never leak stack traces or internal exception messages to the client
// for 5xx; logs still capture the full error.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SoftDeletedNotFoundError } from '../../database/prisma.extension';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof SoftDeletedNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = `${exception.model} not found`;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? code;
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.message === 'string') {
          message = b.message;
        } else if (Array.isArray(b.message)) {
          message = (b.message as unknown[]).map((m) => String(m)).join('; ');
        }
        if ('code' in b && typeof b.code === 'string') {
          code = b.code;
        }
        if ('issues' in b) {
          details = b.issues;
        }
      }
    } else if (exception instanceof Error) {
      // Unhandled — log with stack; don't leak to client.
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.url}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown exception on ${req.method} ${req.url}: ${String(exception)}`);
    }

    const payload: Record<string, unknown> = {
      success: false,
      error: { code, message },
    };
    if (details) payload.error = { ...(payload.error as object), details };

    res.status(status).json(payload);
  }
}
