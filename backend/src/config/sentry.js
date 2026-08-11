import * as Sentry from '@sentry/node';
import { env } from './env.js';

// Sentry is entirely opt-in: no SENTRY_DSN (the default for local dev, CI,
// and the test suite) means initSentry() is a no-op and nothing here ever
// tries to reach sentry.io. This keeps `npm test` and DSN-less deployments
// working exactly as before this feature was added.
const dsn = process.env.SENTRY_DSN;

export function isSentryEnabled() {
  return Boolean(dsn);
}

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: env.nodeEnv,
    // Keep trace sampling low/off outside production — Sentry's paid
    // performance monitoring quota is easy to burn through in dev.
    tracesSampleRate: env.nodeEnv === 'production' ? 0.1 : 0
  });
}

export { Sentry };
