// Citizen Shield logger — thin wrapper around pino that fits both NestJS
// (via nestjs-pino) and standalone use (via the bare pino instance).
//
// Backend bootstraps with `app.useLogger(appLogger)` and uses the
// nestjs-pino LoggerModule; the resulting log lines are JSON in production
// and pretty-printed in development for readability.

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { env } from '@citizen-shield/config';
import { Logger as NestPinoLogger, LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import type { Params as PinoParams } from 'nestjs-pino';

const isDev = env.NODE_ENV === 'development';
export const REQUEST_ID_HEADER = 'x-request-id';

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
    // Honor an inbound X-Request-ID header if it looks like a UUID or short
    // opaque token; otherwise mint a fresh UUID. The generated id is also
    // attached to `req.id` so controllers and the global exception filter
    // can read it.
    genReqId: (req, res) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128) {
        res.setHeader(REQUEST_ID_HEADER, incoming);
        return incoming;
      }
      const id = randomUUID();
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // Stamp every request log with the request id, method, route, status,
    // and the user id (when `req.user` has been attached by JwtAuthGuard).
    customProps: (req) => {
      const r = req as unknown as {
        id?: string;
        user?: { id?: string };
        method?: string;
        url?: string;
      };
      return {
        requestId: r.id,
        method: r.method,
        route: r.url,
        userId: r.user?.id,
      };
    },
    // Standard HTTP request logging — we want method, url, status, latency.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Redact sensitive headers / cookies from prod logs. Headers are hidden
    // by pino-pretty's `ignore` rule in dev (see above).
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      remove: false,
      censor: '[REDACTED]',
    },
  },
};

export { LoggerModule, NestPinoLogger, pino };
export type { Params as PinoModuleOptions } from 'nestjs-pino';
