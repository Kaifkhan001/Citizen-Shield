// `@Roles('ADMIN', 'USER')` — declares which roles are allowed on a route.
// RolesGuard (paired with this decorator) enforces the check at request time.

import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@citizen-shield/types';

export const ROLES_KEY = 'cs:roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
