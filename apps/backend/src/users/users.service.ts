// UsersService — wraps Prisma for user CRUD. The only place outside Prisma
// that knows about passwordHash shape; consumers receive SafeUser.

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, User } from '@citizen-shield/database';
import { UserRole, type SafeUser } from '@citizen-shield/types';
import { hashPassword } from '@citizen-shield/auth';
import { PRISMA_CLIENT } from '../database/database.module';

@Injectable()
export class UsersService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  toSafeUser(user: User): SafeUser {
    // Strip passwordHash — never expose it to API consumers.
    const safe = { ...user } as Record<string, unknown>;
    delete safe.passwordHash;
    return safe as unknown as SafeUser;
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return this.toSafeUser(user);
  }

  async findByEmailWithHash(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(input: {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
  }): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this email already exists',
      });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role ?? UserRole.USER,
      },
    });
    return this.toSafeUser(user);
  }
}
