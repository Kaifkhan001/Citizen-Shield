// CasesService — CRUD over soft-deletable Case rows.
//
// Authorization: a USER can only access their own cases. ADMIN can access any.
// Soft-delete is enforced by the Prisma extension, so `findUnique` on a
// soft-deleted row returns null automatically.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@citizen-shield/database';
import { CaseStatus, UserRole, type CaseCategory } from '@citizen-shield/types';
import type { CaseResponse } from '@citizen-shield/validation';
import { ErrorCode } from '@citizen-shield/errors';
import { PRISMA_CLIENT } from '../database/database.module';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class CasesService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async create(
    user: AuthenticatedUser,
    input: { title: string; description: string; category: CaseCategory },
  ): Promise<CaseResponse> {
    const created = await this.prisma.case.create({
      data: {
        userId: user.id,
        title: input.title,
        description: input.description,
        category: input.category,
        status: CaseStatus.DRAFT,
      },
    });
    return toResponse(created);
  }

  async findAll(user: AuthenticatedUser): Promise<CaseResponse[]> {
    const where: Prisma.CaseWhereInput = user.role === UserRole.ADMIN ? {} : { userId: user.id };
    const rows = await this.prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toResponse);
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<CaseResponse> {
    const row = await this.prisma.case.findUnique({ where: { id } });
    if (!row || !this.userCanAccess(user, row.userId)) {
      throw new NotFoundException({ code: ErrorCode.CASE_NOT_FOUND, message: 'Case not found' });
    }
    return toResponse(row);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: { title?: string; description?: string; category?: CaseCategory; status?: CaseStatus },
  ): Promise<CaseResponse> {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing || !this.userCanAccess(user, existing.userId)) {
      throw new NotFoundException({ code: ErrorCode.CASE_NOT_FOUND, message: 'Case not found' });
    }
    const updated = await this.prisma.case.update({
      where: { id },
      data: input,
    });
    return toResponse(updated);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing || !this.userCanAccess(user, existing.userId)) {
      throw new NotFoundException({ code: ErrorCode.CASE_NOT_FOUND, message: 'Case not found' });
    }
    await this.prisma.case.delete({ where: { id } });
    return { id, deleted: true };
  }

  private userCanAccess(user: AuthenticatedUser, ownerId: string): boolean {
    return user.role === UserRole.ADMIN || user.id === ownerId;
  }
}

type DbCase = {
  id: string;
  title: string;
  description: string;
  category: CaseCategory;
  status: CaseStatus;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toResponse(c: DbCase): CaseResponse {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    status: c.status,
    userId: c.userId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
