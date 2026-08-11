import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';

// These tests deliberately stay on paths that never touch Postgres or
// Redis (health check, 404, request validation, missing-auth guards) so the
// suite runs without docker-compose up — CI can add DB-backed integration
// tests separately once Postgres/Redis are provisioned there.
const app = createApp();

describe('GET /health', () => {
  it('returns ok without hitting the database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('404s with a JSON error body', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('POST /api/auth/register validation', () => {
  it('rejects a request missing required fields with 400, not 500', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'short', name: 'Коля' });
    expect(res.status).toBe(400);
  });
});

describe('protected routes without a token', () => {
  it('rejects GET /api/projects with 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('rejects a request with a garbage bearer token with 401', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
