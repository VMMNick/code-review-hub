import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

// Refresh tokens are opaque random strings; only their hash is stored in DB
// (see refresh_tokens table), so a leaked DB dump can't be replayed directly.
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + env.jwt.refreshTtlDays);
  return d;
}
