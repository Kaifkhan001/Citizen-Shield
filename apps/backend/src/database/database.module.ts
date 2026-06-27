import { Module, Global } from '@nestjs/common';
import { PrismaClient } from '@citizen-shield/database';
import { withSoftDelete } from './prisma.extension';

export const PRISMA_CLIENT = 'PRISMA_CLIENT';

const prismaProvider = {
  provide: PRISMA_CLIENT,
  useFactory: () => {
    const base = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
    return withSoftDelete(base);
  },
};

@Global()
@Module({
  providers: [prismaProvider],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
