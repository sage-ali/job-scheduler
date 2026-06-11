import { env } from '@config/env';
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

const isDev = env.NODE_ENV === 'development';
const logLevel = env.LOG_LEVEL;

export const REDACTED_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'access_token',
  '*.access_token',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  '*.authorization',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
];

const options: LoggerOptions = {
  level: logLevel,

  base: {
    service: 'job-scheduler-api',
    env: process.env.NODE_ENV ?? 'development',
  },

  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },

  formatters: {
    level: (label) => ({ level: label }),
    bindings: (b) => ({
      service: String(b['service']),
      env: String(b['env']),
    }),
  },

  timestamp: () => `, "timestamp":"${new Date().toISOString()}"`,
};

const logger: PinoLogger = isDev
  ? pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{event} - {msg}',
          singleLine: true,
        },
      },
    })
  : pino(options);

export { logger, logLevel };
