// JwtAuthGuard — verifies the access token from `Authorization: Bearer <jwt>`.
// On success, attaches `{ id, email, role }` to the request as `request.user`.
//
// Routes that need auth opt in with `@UseGuards(JwtAuthGuard)`. The guard is
// global in the sense that you can register it once on AppModule and decorate
// individual routes with `@Public()` to opt out — but for clarity we attach
// it per-controller.
//
// Token failures are differentiated:
//   - `AUTH_TOKEN_INVALID` (bad signature / malformed / wrong algorithm)
//   - `AUTH_TOKEN_EXPIRED` (signature ok but past expiry)
//   - `AUTH_UNAUTHORIZED` (missing or empty Authorization header)
// The frontend uses these codes to decide whether to silent-refresh
// (`AUTH_TOKEN_EXPIRED`) or to send the user back to /login (anything else).

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyAccessToken } from '@citizen-shield/auth';
import { ErrorCode } from '@citizen-shield/errors';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_UNAUTHORIZED,
        message: 'Missing or malformed Authorization header',
      });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_UNAUTHORIZED,
        message: 'Empty access token',
      });
    }
    const result = await verifyAccessToken(token);
    if (!result.ok) {
      throw new UnauthorizedException({
        code:
          result.reason === 'expired' ? ErrorCode.AUTH_EXPIRED_TOKEN : ErrorCode.AUTH_INVALID_TOKEN,
        message:
          result.reason === 'expired' ? 'Access token has expired' : 'Access token is invalid',
      });
    }
    req.user = {
      id: result.payload.sub,
      email: result.payload.email,
      role: result.payload.role,
    };
    return true;
  }
}
