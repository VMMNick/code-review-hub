import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// `fallback` is a convenience default for local dev/tests only — it never
// applies in production. Without this split, an operator who forgot to set
// JWT_ACCESS_SECRET in prod would silently get 'dev-access-secret-change-me',
// a value sitting in plain sight in this file, letting anyone forge valid
// access tokens. Failing loudly on boot is much safer than failing silently
// at request time. An empty string counts as "not set" too, since that's
// what a misconfigured `${VAR:-}`-style shell/Compose interpolation produces.
function required(name, fallback) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (!isProduction && fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/code_review_hub'),
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30)
  },
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'
};
