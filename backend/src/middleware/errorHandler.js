import { ZodError } from 'zod';

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
  console.error(err);
  const status = err.status ?? 500;
  res.status(status).json({ error: err.publicMessage ?? 'Internal server error' });
}

export class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}
