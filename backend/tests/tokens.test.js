import { describe, it, expect } from '@jest/globals';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate
} from '../src/utils/tokens.js';

describe('access tokens', () => {
  const user = { id: 'user-1', role: 'author', email: 'a@example.com', name: 'Коля' };

  it('round-trips claims through sign/verify', () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe(user.role);
    expect(payload.email).toBe(user.email);
    expect(payload.name).toBe(user.name);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(user);
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('refresh tokens', () => {
  it('generates unique opaque tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it('hashes deterministically so the same token can be looked up by hash', () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it('produces an expiry date in the future', () => {
    expect(refreshExpiryDate().getTime()).toBeGreaterThan(Date.now());
  });
});
