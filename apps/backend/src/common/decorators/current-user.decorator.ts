// `@CurrentUser()` decorator — extracts the authenticated user attached to
// the request by JwtAuthGuard.

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser, UserRole } from '@citizen-shield/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return req.user;
  },
);

export type { AuthUser };
