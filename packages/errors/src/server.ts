// Server-only helpers — depend on `@nestjs/common` and therefore pull in
// `class-transformer`. Frontends MUST NOT import this file (the main
// `index.ts` re-exports everything else).

import { HttpException } from '@nestjs/common';
import { ErrorCode, ErrorMessage, ErrorStatus } from './index';

export class ApiError extends HttpException {
  constructor(code: ErrorCode, message?: string) {
    const body = {
      success: false as const,
      error: {
        code,
        message: message ?? ErrorMessage[code],
      },
    };
    super(body, ErrorStatus[code] || 500);
    this.name = 'ApiError';
  }
}

export function throwWithCode(code: ErrorCode, message?: string): never {
  throw new ApiError(code, message);
}
