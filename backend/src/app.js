import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { Sentry, initSentry, isSentryEnabled } from './config/sentry.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import reviewDetailRoutes from './routes/reviewDetailRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  // No-op unless SENTRY_DSN is set — see config/sentry.js.
  initSentry();

  const app = express();

  app.use(helmet());
  // No CSRF middleware here on purpose: auth is a JWT sent in the
  // Authorization header (see requireAuth), read from localStorage on the
  // client — never a cookie. Browsers only auto-attach cookies cross-site,
  // so a forged cross-origin request can't reproduce that header; CSRF
  // tokens only matter for cookie-based sessions. `credentials: true` is
  // dropped below for the same reason — nothing here relies on cookies.
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  // Structured request logging (replaces morgan): every request becomes one
  // JSON log line with method/url/status/response time, tagged with a
  // per-request id so a single request's log lines can be grepped together.
  // The health check is excluded — it's polled constantly by container
  // orchestrators and would otherwise drown out real traffic in the logs.
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' }
    })
  );

  // Global rate limit; auth routes have their own tighter limiter.
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/reviews', reviewDetailRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Sentry must see the route handlers' thrown/next(err) errors before our
  // own errorHandler swallows them into a JSON response, but only wires in
  // when a DSN is actually configured (see config/sentry.js).
  if (isSentryEnabled()) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
