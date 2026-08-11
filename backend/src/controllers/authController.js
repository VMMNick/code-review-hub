import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate
} from '../utils/tokens.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(255)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), refreshExpiryDate()]
  );
  return { accessToken, refreshToken };
}

export async function register(req, res, next) {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      throw new HttpError(409, 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'author')
       RETURNING id, email, name, role, created_at`,
      [email, passwordHash, name]
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
    const { refreshToken } = req.body;
    if (!refreshToken) throw new HttpError(400, 'refreshToken is required');

    const tokenHash = hashToken(refreshToken);
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

    // Rotate: revoke old, issue new pair
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [record.id]);
    const user = { id: record.user_id, email: record.email, role: record.role, name: record.name };
    const tokens = await issueTokenPair(user);

    res.json({ ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
        [hashToken(refreshToken)]
      );
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
