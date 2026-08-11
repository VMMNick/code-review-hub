import pino from 'pino';
import { env } from './env.js';

// A single structured logger for the whole backend. Plain JSON output (the
// pino default) is used in every environment on purpose — it's what a
// Docker/production log aggregator expects, and keeping dev output in the
// same shape avoids "worked in dev, broke in prod" surprises from a
// pretty-printer transform that only runs locally.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.nodeEnv === 'production' ? 'info' : 'debug')
});
