import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { assertProjectAccess } from './projectController.js';

const createReviewSchema = z.object({
  title: z.string().min(1).max(255),
  codeSnapshot: z.string().min(1)
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'approved', 'changes_requested'])
});

export async function listReviews(req, res, next) {
  try {
    await assertProjectAccess(req.params.projectId, req.user.id);
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE project_id = $1 ORDER BY created_at DESC`,
      [req.params.projectId]
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
      [req.params.projectId, title, codeSnapshot, req.user.id]
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
