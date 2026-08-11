import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { assertProjectAccess } from './projectController.js';
import { sanitizePlainText } from '../utils/sanitize.js';

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

const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

const listReviewsQuerySchema = z.object({
  status: z.enum(['open', 'approved', 'changes_requested']).optional(),
  authorId: z.string().uuid().optional(),
  dateFrom: z.string().regex(isoDatePattern, 'dateFrom must be YYYY-MM-DD or ISO 8601').optional(),
  dateTo: z.string().regex(isoDatePattern, 'dateTo must be YYYY-MM-DD or ISO 8601').optional(),
  q: z.string().min(1).max(255).optional()
});

// Filters are all optional query params: ?status=&authorId=&dateFrom=&dateTo=&q=
// Built as a parameterized WHERE clause (never string-interpolated) so
// there's no SQL injection surface even though the filter set is dynamic.
export async function listReviews(req, res, next) {
  try {
    await assertProjectAccess(req.params.projectId, req.user.id);
    const filters = listReviewsQuerySchema.parse(req.query);

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

    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createReview(req, res, next) {
  try {
    await assertProjectAccess(req.params.projectId, req.user.id);
    const { title, codeSnapshot } = createReviewSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO reviews (project_id, title, code_snapshot, author_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      // codeSnapshot deliberately isn't run through sanitizePlainText — it's
      // source code rendered verbatim in Monaco, not HTML, so stripping tags
      // would corrupt any HTML/JSX/XML file under review.
      [req.params.projectId, sanitizePlainText(title, { fieldName: 'title' }), codeSnapshot, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Attaches the caller's effective project role (admin/reviewer/author) onto
// the review as `projectRole`, so callers can make permission decisions
// without a second round trip to project_members.
export async function getReviewOrThrow(reviewId, userId) {
  const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
  const review = rows[0];
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
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
