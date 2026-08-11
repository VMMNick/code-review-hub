import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import reviewDetailRoutes from './routes/reviewDetailRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
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
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  // Global rate limit; auth routes have their own tighter limiter.
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/reviews', reviewDetailRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
