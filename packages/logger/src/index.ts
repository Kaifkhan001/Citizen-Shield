// Citizen Shield logger — thin wrapper around pino that fits both NestJS
// (via nestjs-pino) and standalone use (via the bare pino instance).
//
// Backend bootstraps with `app.useLogger(appLogger)` and uses the
// nestjs-pino LoggerModule; the resulting log lines are JSON in production
// and pretty-printed in development for readability.

import 'reflect-metadata';
import { env } from '@citizen-shield/config';
import { Logger as NestPinoLogger, LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import type { Params as PinoParams } from 'nestjs-pino';

const isDev = env.NODE_ENV === 'development';

export const pinoOptions: PinoParams = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    // In dev, use pino-pretty for human-readable output. In prod, emit JSON
    // for log aggregators.
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,req.headers,res.headers',
          },
        }
      : undefined,
    // Standard HTTP request logging — we want method, url, status, latency.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },
};

export { LoggerModule, NestPinoLogger, pino };
export type { Params as PinoModuleOptions } from 'nestjs-pino';
