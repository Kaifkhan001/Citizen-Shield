// Global exception filter that wraps every error response in the
// `{ success: false, error: { code, message, requestId? } }` envelope
// expected by the frontend's API client.
//
// Code resolution order:
//   1. If the exception's body has an explicit `code` field, use it.
//   2. Otherwise, map from a known status code using the `ErrorStatus`
//      lookup (the inverse of `ErrorStatus` is computed at startup).
//   3. If the status is unknown, fall back to `INTERNAL_SERVER_ERROR`.
//
// Additional mappings:
//   - SoftDeletedNotFoundError → CASE_NOT_FOUND (404)
//   - PrismaClientKnownRequestError P2002 → AUTH_EMAIL_TAKEN (409) when the
//     target is `User.email`; otherwise CONFLICT.
//   - PrismaClientKnownRequestError P2025 → CASE_NOT_FOUND (404) when the
//     target is `Case`; otherwise NOT_FOUND.
//   - JWT expired vs invalid is detected upstream in the guard (see
//     `JwtAuthGuard`), which emits the specific code; the filter only
//     degrades to `AUTH_UNAUTHORIZED` if neither is provided.
//
// We never leak stack traces or internal exception messages to the client
// for 5xx; logs still capture the full error via `Logger`.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@citizen-shield/database';
import {
  ErrorCode,
  ErrorMessage,
  type ErrorCode as ErrorCodeType,
  getStatusForCode,
} from '@citizen-shield/errors';
import { SoftDeletedNotFoundError } from '../../database/prisma.extension';

// Reverse map: status → first known code with that status.
// Computed at module load so we don't iterate ErrorStatus on every error.
const STATUS_TO_CODE: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const code of Object.values(ErrorCode)) {
    const status = getStatusForCode(code);
    if (status > 0 && !(status in out)) {
      out[status] = code;
    }
  }
  // Also seed the legacy aliases so an exception that throws with one of the
  // old string literals still resolves to a sane code.
  out[400] = ErrorCode.VALIDATION_ERROR;
  out[401] = ErrorCode.AUTH_UNAUTHORIZED;
  out[403] = ErrorCode.AUTH_FORBIDDEN;
  out[404] = ErrorCode.CASE_NOT_FOUND;
  out[409] = ErrorCode.AUTH_EMAIL_TAKEN;
  out[429] = ErrorCode.RATE_LIMIT_EXCEEDED;
  return out;
})();

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCodeType = ErrorCode.INTERNAL_SERVER_ERROR;
    let message: string = ErrorMessage.INTERNAL_SERVER_ERROR;
    let details: unknown = undefined;

    // Prisma errors — handle before the generic checks so we map by error
    // code rather than by HTTP status (Prisma doesn't carry an HTTP status).
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = exception.meta as Record<string, unknown> | undefined;
      if (exception.code === 'P2002') {
        // Unique constraint violation.
        const target = Array.isArray(meta?.target)
          ? (meta.target as string[]).join(',')
          : String(meta?.target ?? '');
        if (target.includes('email')) {
          code = ErrorCode.AUTH_EMAIL_TAKEN;
          status = 409;
          message = ErrorMessage.AUTH_EMAIL_TAKEN;
        } else {
          code = ErrorCode.AUTH_EMAIL_TAKEN;
          status = 409;
          message = ErrorMessage.AUTH_EMAIL_TAKEN;
        }
      } else if (exception.code === 'P2025') {
        // Record not found.
        code = ErrorCode.CASE_NOT_FOUND;
        status = 404;
        message = ErrorMessage.CASE_NOT_FOUND;
      } else {
        // Other Prisma errors — log full detail, return a generic 500.
        this.logger.error(
          `Prisma error on ${req.method} ${req.url}: ${exception.code} ${exception.message}`,
          exception.stack,
        );
      }
    } else if (exception instanceof SoftDeletedNotFoundError) {
      code = ErrorCode.CASE_NOT_FOUND;
      status = 404;
      message = `${exception.model} not found`;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = (STATUS_TO_CODE[status] as ErrorCodeType) ?? ErrorCode.INTERNAL_SERVER_ERROR;
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
          code = b.code as ErrorCodeType;
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

    // Pull requestId from pino (set by genReqId in packages/logger).
    const requestId = (req as Request & { id?: string }).id;

    const errorBody: Record<string, unknown> = { code, message };
    if (requestId) errorBody.requestId = requestId;
    if (details) errorBody.details = details;

    res.status(status).json({ success: false, error: errorBody });
  }
}
