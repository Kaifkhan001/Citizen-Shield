// Backend-only helper that throws the right Nest HttpException for
// a given error code. The web app can't import this file because it
// transitively pulls in `@nestjs/common` (and `class-transformer`).
//
// We didn't add a `throwWithCode` to `@citizen-shield/errors` for
// exactly this reason: the errors package is web-safe.
//
// Resolution: pick the exception class that matches the canonical
// status for the code (using `ErrorStatus`), then attach `{ code,
// message }` to the body so the global HttpExceptionFilter surfaces
// the exact registry code instead of a status-derived default.

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ErrorCode,
  ErrorStatus,
  getMessageForCode,
  type ErrorCode as ErrorCodeType,
} from '@citizen-shield/errors';

/**
 * Throws an HttpException whose envelope the global filter renders
 * as `{ success: false, error: { code, message, requestId? } }`.
 *
 * `message` overrides the registry's neutral default; pass an
 * empty string to fall back to the registry message.
 */
export function throwApiError(code: ErrorCodeType, message?: string): never {
  const status = ErrorStatus[code] ?? 500;
  const finalMessage = message !== undefined && message !== '' ? message : getMessageForCode(code);
  const body = { code, message: finalMessage };

  switch (status) {
    case HttpStatus.BAD_REQUEST:
      throw new BadRequestException(body);
    case HttpStatus.UNAUTHORIZED:
      throw new UnauthorizedException(body);
    case HttpStatus.NOT_FOUND:
      throw new NotFoundException(body);
    case HttpStatus.CONFLICT:
      throw new ConflictException(body);
    case HttpStatus.TOO_MANY_REQUESTS:
    case HttpStatus.BAD_GATEWAY:
    case HttpStatus.SERVICE_UNAVAILABLE:
      // Nest doesn't ship first-class exceptions for these statuses
      // in v10; use the generic HttpException so the filter still
      // extracts the { code, message } body.
      throw new HttpException(body, status);
    default:
      throw new HttpException(body, status >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : status);
  }
}

/**
 * Re-export `ErrorCode` so callers can
 * `import { throwApiError, ErrorCode } from '../../common/api-error'`.
 */
export { ErrorCode };
