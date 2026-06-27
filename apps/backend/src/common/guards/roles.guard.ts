// RolesGuard — paired with `@Roles('ADMIN', 'USER')`. Reads the role list
// off the route handler / class metadata and checks `request.user.role`
// against it. By default (no `@Roles()`) every authenticated user passes.

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@citizen-shield/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: { role: UserRole } }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient role',
      });
    }
    return true;
  }
}
