// EnvelopeInterceptor — wraps every 2xx response body in
// `{ success: true, data }`. Pairs with HttpExceptionFilter (which handles
// the failure side).
//
// Controllers return bare payloads (`AuthResponse`, `CaseResponse`, etc.).
// The interceptor takes care of envelope shape so route handlers stay clean.

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: data ?? null,
      })),
    );
  }
}
