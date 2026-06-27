import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from '@citizen-shield/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // pino-based structured logger (JSON in prod, pretty in dev).
  app.useLogger(app.get(PinoLogger));

  // Security headers (CSP off by default — frontend is same-origin via Next.js).
  app.use(helmet());

  // Parse cookies for the refresh token.
  app.use(cookieParser());

  // CORS allowlist from env. credentials: true so the refresh cookie travels.
  app.enableCors({
    origin: env.WEB_ORIGINS.length > 0 ? env.WEB_ORIGINS : true,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // OpenAPI / Swagger UI — dev-only. The route is registered before any
  // global prefix so the URL is `/api/docs`, not `/api/api/docs`.
  if (env.NODE_ENV !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('Citizen Shield API')
      .setDescription('Authentication and case CRUD endpoints (M3.5).')
      .setVersion('0.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Global exception filter — wraps every error in the `{ success, error }` envelope.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptor — wraps every 2xx response in `{ success, data }`.
  app.useGlobalInterceptors(new EnvelopeInterceptor());

  // Validation is per-route: each handler that takes a body opts in with
  // `@Body(new ZodValidationPipe(schema))`. No global pipe is registered
  // because ZodValidationPipe needs a schema at construction time.

  app.enableShutdownHooks();

  await app.listen(env.BACKEND_PORT);
  const logger = app.get(PinoLogger);
  logger.log(`🚀 Citizen Shield API running at http://localhost:${env.BACKEND_PORT}/api`);
  logger.log(`🏥 Health check available at http://localhost:${env.BACKEND_PORT}/api/health`);
  if (env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger UI available at http://localhost:${env.BACKEND_PORT}/api/docs`);
  }
}

void bootstrap();
