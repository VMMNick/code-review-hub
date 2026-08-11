import { z } from 'zod';

const uuidSchema = z.string().uuid();

// Route params like :id/:projectId/:reviewId/:commentId/:userId are used
// directly in SQL queries. They're always parameterized (no injection risk
// either way), but a malformed value would previously fall through to
// Postgres and come back as a generic 500 ("invalid input syntax for type
// uuid") instead of a clean 400 — and it wastes a DB round trip on input
// that was never going to match anything.
//
// Meant to be wired up via router.param(name, validateUuidParam(name)) once
// per router — Express then runs it automatically for every route in that
// router (and any nested routers) that captures that param name.
export function validateUuidParam(paramName) {
  return (req, res, next, value) => {
    if (!uuidSchema.safeParse(value).success) {
      return res.status(400).json({ error: `Invalid ${paramName}: must be a UUID` });
    }
    next();
  };
}
