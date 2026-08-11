import rateLimit from 'express-rate-limit';

// Moderate limiter for authenticated write endpoints that are otherwise
// cheap to spam (creating projects/reviews/comments, inviting members).
// Separate from the tight unauthenticated limiter on /auth/* and the loose
// global limiter in app.js — this one is keyed by user, not IP, since
// multiple teammates can legitimately share an office IP.
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip
});
