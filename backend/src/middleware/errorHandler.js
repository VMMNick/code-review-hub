import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { Sentry, isSentryEnabled } from '../config/sentry.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // zod .parse() throws ZodError, which has no .status — without this it
  // fell through to the generic 500 branch below, turning every bad request
  // body into a false "internal server error". Caught by writing the Week 8
  // validation tests.
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues });
  }
  const status = err.status ?? 500;
  if (status >= 500) {
    // Only unexpected (5xx) errors are worth an ERROR-level log entry and a
    // Sentry event — expected 4xx failures (bad input, missing auth, etc.)
    // are normal traffic, not incidents.
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    if (isSentryEnabled()) Sentry.captureException(err);
  } else {
    logger.warn({ status, path: req.path, method: req.method, message: err.message }, 'Request error');
  }
  res.status(status).json({ error: err.publicMessage ?? 'Internal server error' });
}

export class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}
