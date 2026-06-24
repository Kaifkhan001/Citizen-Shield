import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { env } from '@citizen-shield/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.NODE_ENV === 'development' ? true : false,
    credentials: true,
  });

  // Note: global validation is handled by Zod at the route level, not class-validator.
  // Pipes that translate DTOs will be added alongside the first DTO in a later milestone.

  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  await app.listen(env.BACKEND_PORT);
  logger.log(`🚀 Citizen Shield API running at http://localhost:${env.BACKEND_PORT}/api`);
  logger.log(`🏥 Health check available at http://localhost:${env.BACKEND_PORT}/api/health`);
}

void bootstrap();

