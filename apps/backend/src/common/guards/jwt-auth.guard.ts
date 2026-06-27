// JwtAuthGuard — verifies the access token from `Authorization: Bearer <jwt>`.
// On success, attaches `{ id, email, role }` to the request as `request.user`.
//
// Routes that need auth opt in with `@UseGuards(JwtAuthGuard)`. The guard is
// global in the sense that you can register it once on AppModule and decorate
// individual routes with `@Public()` to opt out — but for clarity we attach
// it per-controller.

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyAccessToken, type JwtPayload } from '@citizen-shield/auth';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header',
      });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Empty access token',
      });
    }
    let payload: JwtPayload;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired access token',
      });
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return true;
  }
}
