import { Module, Global, Inject, OnApplicationShutdown } from '@nestjs/common';
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
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  // Disconnect cleanly so pooled connections don't leak across hot-reloads.
  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
