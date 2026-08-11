import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate
} from '../utils/tokens.js';
import { cacheSession, getCachedSession, invalidateSession } from '../services/sessionCache.js';
import { sanitizePlainText } from '../utils/sanitize.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(255)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// refreshToken is opaque (not a JWT), but it must still be a bounded string
// before it reaches hashToken()/crypto — an object or oversized value there
// would throw an uncaught TypeError instead of a clean 400.
const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).max(512).optional()
});

const REFRESH_TTL_SECONDS = env.jwt.refreshTtlDays * 24 * 60 * 60;

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  // Postgres is the source of truth for revocation/expiry; Redis is a
  // best-effort read cache so the common refresh path can skip the DB join.
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, refreshExpiryDate()]
  );
  await cacheSession(tokenHash, {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  }, REFRESH_TTL_SECONDS);

  return { accessToken, refreshToken };
}

export async function register(req, res, next) {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const cleanName = sanitizePlainText(name, { fieldName: 'name' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      throw new HttpError(409, 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'author')
       RETURNING id, email, name, role, created_at`,
      [email, passwordHash, cleanName]
    );
    const user = rows[0];
    const tokens = await issueTokenPair(user);

    res.status(201).json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const tokens = await issueTokenPair(user);
    delete user.password_hash;

    res.json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);

    const tokenHash = hashToken(refreshToken);

    // Fast path: session cached in Redis means the token was valid and
    // unexpired as of when it was issued/last refreshed (cache TTL mirrors
    // the DB expiry) — skip the Postgres join entirely.
    let user = await getCachedSession(tokenHash);

    if (!user) {
      const { rows } = await pool.query(
        `SELECT rt.*, u.id AS user_id, u.email, u.role, u.name
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash]
      );
      const record = rows[0];
      if (!record || record.revoked_at || new Date(record.expires_at) < new Date()) {
        throw new HttpError(401, 'Invalid or expired refresh token');
      }
      user = { userId: record.user_id, email: record.email, role: record.role, name: record.name };
    }

    // Rotate: revoke the old token (by hash — no DB round trip needed to
    // fetch its id) and drop it from the cache so replaying it fails closed
    // via the Postgres fallback above.
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
    await invalidateSession(tokenHash);

    const tokens = await issueTokenPair({ id: user.userId, email: user.email, role: user.role, name: user.name });

    res.json({ ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const { refreshToken } = logoutSchema.parse(req.body ?? {});
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
      await invalidateSession(tokenHash);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
