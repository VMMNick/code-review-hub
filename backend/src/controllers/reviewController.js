import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { assertProjectAccess } from './projectController.js';
import { sanitizePlainText } from '../utils/sanitize.js';
import { getIo, reviewRoom } from '../realtime/ioRegistry.js';
import { cached, invalidateKeys, bumpVersion, getVersion } from '../utils/cache.js';

const REVIEWS_LIST_TTL_SECONDS = 30;
const REVIEW_ROW_TTL_SECONDS = 60;

const reviewsListVersionKey = (projectId) => `cache:v:reviews:${projectId}`;
const reviewRowKey = (reviewId) => `cache:review:${reviewId}`;

// Called on any write that changes which reviews show up in a project's
// list or how they sort/filter (create/status change/delete). Bumping the
// version is enough — see utils/cache.js for why we don't need to hunt down
// and delete every cached filter/page combination individually.
async function invalidateReviewsList(projectId) {
  await bumpVersion(reviewsListVersionKey(projectId));
}

// 500,000 chars (~500KB) caps a single review's code so one request can't
// tie up the DB/response payload indefinitely. This is a field-level limit
// with a clean validation error, on top of (not instead of) the blunter
// express.json({ limit }) body-size cap in app.js.
const MAX_CODE_SNAPSHOT_LENGTH = 500_000;

const createReviewSchema = z.object({
  title: z.string().min(1).max(255),
  codeSnapshot: z.string().min(1).max(
    MAX_CODE_SNAPSHOT_LENGTH,
    `Code snapshot too large (max ${MAX_CODE_SNAPSHOT_LENGTH.toLocaleString()} characters)`
  )
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'approved', 'changes_requested'])
});

const addRevisionSchema = z.object({
  codeSnapshot: z.string().min(1).max(
    MAX_CODE_SNAPSHOT_LENGTH,
    `Code snapshot too large (max ${MAX_CODE_SNAPSHOT_LENGTH.toLocaleString()} characters)`
  )
});

const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listReviewsQuerySchema = z.object({
  status: z.enum(['open', 'approved', 'changes_requested']).optional(),
  authorId: z.string().uuid().optional(),
  dateFrom: z.string().regex(isoDatePattern, 'dateFrom must be YYYY-MM-DD or ISO 8601').optional(),
  dateTo: z.string().regex(isoDatePattern, 'dateTo must be YYYY-MM-DD or ISO 8601').optional(),
  q: z.string().min(1).max(255).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional()
});

// Filters are all optional query params: ?status=&authorId=&dateFrom=&dateTo=&q=
// Built as a parameterized WHERE clause (never string-interpolated) so
// there's no SQL injection surface even though the filter set is dynamic.
// Paginated (?page=&limit=, 1-indexed, default 20/page, max 100/page) so a
// project with thousands of reviews doesn't ship them all in one response.
export async function listReviews(req, res, next) {
  try {
    await assertProjectAccess(req.params.projectId, req.user.id);
    const filters = listReviewsQuerySchema.parse(req.query);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;

    const conditions = ['project_id = $1'];
    const params = [req.params.projectId];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.authorId) {
      params.push(filters.authorId);
      conditions.push(`author_id = $${params.length}`);
    }
    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filters.dateTo) {
      params.push(filters.dateTo);
      conditions.push(`created_at <= $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      conditions.push(`title ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');

    // Cache key includes the project's list-version plus every filter/page
    // value that affects the result, so two different filter combos never
    // collide, and any write to this project's reviews invalidates all of
    // them at once via invalidateReviewsList() bumping the version.
    const version = await getVersion(reviewsListVersionKey(req.params.projectId));
    const cacheKey = `cache:reviews:${req.params.projectId}:v${version}:${JSON.stringify({ ...filters, page, limit })}`;

    const result = await cached(cacheKey, REVIEWS_LIST_TTL_SECONDS, async () => {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reviews WHERE ${where}`,
        params
      );
      const total = countRows[0].total;

      const { rows } = await pool.query(
        `SELECT * FROM reviews WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      return {
        reviews: rows,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createReview(req, res, next) {
  const client = await pool.connect();
  try {
    await assertProjectAccess(req.params.projectId, req.user.id);
    const { title, codeSnapshot } = createReviewSchema.parse(req.body);
    const cleanTitle = sanitizePlainText(title, { fieldName: 'title' });

    // The review row and its first revision are written together so a
    // review never exists without at least one entry in review_revisions
    // for the diff view to anchor on.
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO reviews (project_id, title, code_snapshot, author_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      // codeSnapshot deliberately isn't run through sanitizePlainText — it's
      // source code rendered verbatim in Monaco, not HTML, so stripping tags
      // would corrupt any HTML/JSX/XML file under review.
      [req.params.projectId, cleanTitle, codeSnapshot, req.user.id]
    );
    const review = rows[0];
    await client.query(
      `INSERT INTO review_revisions (review_id, revision_number, code_snapshot, author_id)
       VALUES ($1, 1, $2, $3)`,
      [review.id, codeSnapshot, req.user.id]
    );
    await client.query('COMMIT');
    await invalidateReviewsList(req.params.projectId);

    res.status(201).json(review);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// The raw review row is fetched on essentially every review/comment/revision
// request (getReviewOrThrow is called from all of those controllers), so
// it's cached by id. Deliberately caches only the row itself, not the
// caller's projectRole computed below — that's per-user and would leak
// across users if it were part of the cached value.
async function fetchReviewRow(reviewId) {
  return cached(reviewRowKey(reviewId), REVIEW_ROW_TTL_SECONDS, async () => {
    const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
    return rows[0] ?? null;
  });
}

// Attaches the caller's effective project role (admin/reviewer/author) onto
// the review as `projectRole`, so callers can make permission decisions
// without a second round trip to project_members.
export async function getReviewOrThrow(reviewId, userId) {
  const review = await fetchReviewRow(reviewId);
  if (!review) throw new HttpError(404, 'Review not found');
  const project = await assertProjectAccess(review.project_id, userId);
  return { ...review, projectRole: project.role };
}

export async function getReview(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    res.json(review);
  } catch (err) {
    next(err);
  }
}

// Lightweight list — omits code_snapshot so N revisions x up to 500KB each
// don't all come back at once just to populate a version picker.
export async function listRevisions(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    const { rows } = await pool.query(
      `SELECT rr.id, rr.revision_number, rr.author_id, rr.created_at, u.name AS author_name
       FROM review_revisions rr
       JOIN users u ON u.id = rr.author_id
       WHERE rr.review_id = $1
       ORDER BY rr.revision_number ASC`,
      [review.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function getRevision(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    const { rows } = await pool.query(
      'SELECT * FROM review_revisions WHERE review_id = $1 AND id = $2',
      [review.id, req.params.revisionId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Revision not found');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Pushes a new code revision (e.g. the author addressed feedback and wants
// reviewers to see just what changed). Only the review's author or a
// project admin can do this — reviewers/other authors comment, they don't
// rewrite someone else's submission.
export async function addRevision(req, res, next) {
  const client = await pool.connect();
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    const isProjectAdmin = review.projectRole === 'admin';
    if (review.author_id !== req.user.id && !isProjectAdmin) {
      throw new HttpError(403, 'Only the review author or a project admin can push a new revision');
    }
    const { codeSnapshot } = addRevisionSchema.parse(req.body);

    await client.query('BEGIN');
    const { rows: numberRows } = await client.query(
      'SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM review_revisions WHERE review_id = $1',
      [review.id]
    );
    const nextRevisionNumber = numberRows[0].next;
    const { rows } = await client.query(
      `INSERT INTO review_revisions (review_id, revision_number, code_snapshot, author_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [review.id, nextRevisionNumber, codeSnapshot, req.user.id]
    );
    await client.query('UPDATE reviews SET code_snapshot = $1 WHERE id = $2', [codeSnapshot, review.id]);
    await client.query('COMMIT');
    await invalidateKeys(reviewRowKey(review.id));
    await invalidateReviewsList(review.project_id);

    const revision = rows[0];
    getIo()?.to(reviewRoom(review.id)).emit('review:revision', revision);
    res.status(201).json(revision);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

export async function updateReviewStatus(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    // Authors shouldn't be able to self-approve their own review; status
    // changes are a reviewer/admin call.
    if (!['admin', 'reviewer'].includes(review.projectRole)) {
      throw new HttpError(403, 'Only a reviewer or project admin can change review status');
    }
    const { status } = updateStatusSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE reviews SET status = $1 WHERE id = $2 RETURNING *`,
      [status, review.id]
    );
    await invalidateKeys(reviewRowKey(review.id));
    await invalidateReviewsList(review.project_id);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteReview(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.id, req.user.id);
    const isProjectAdmin = review.projectRole === 'admin';
    if (review.author_id !== req.user.id && !isProjectAdmin && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the author or a project admin can delete this review');
    }
    await pool.query('DELETE FROM reviews WHERE id = $1', [review.id]);
    await invalidateKeys(reviewRowKey(review.id));
    await invalidateReviewsList(review.project_id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
