import { Module, Global } from '@nestjs/common';
import { PrismaClient } from '@citizen-shield/database';

const prismaProvider = {
  provide: PrismaClient,
  useFactory: () => {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  },
};

@Global()
@Module({
  providers: [prismaProvider],
  exports: [PrismaClient],
})
export class DatabaseModule {}
