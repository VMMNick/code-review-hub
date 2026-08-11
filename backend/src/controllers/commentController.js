import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { getReviewOrThrow } from './reviewController.js';
import { getIo, reviewRoom } from '../realtime/ioRegistry.js';

const createCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  lineNumber: z.number().int().positive().nullable().optional(),
  parentId: z.string().uuid().nullable().optional()
});

// Returned as a flat list ordered by created_at; the client groups by
// line_number and threads replies under their parent using parent_id.
export async function listComments(req, res, next) {
  try {
    await getReviewOrThrow(req.params.reviewId, req.user.id);
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.review_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.reviewId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createComment(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.reviewId, req.user.id);
    const { content, lineNumber, parentId } = createCommentSchema.parse(req.body);

    if (parentId) {
      const { rows } = await pool.query(
        'SELECT id, review_id FROM comments WHERE id = $1',
        [parentId]
      );
      const parent = rows[0];
      if (!parent || parent.review_id !== review.id) {
        throw new HttpError(400, 'parentId must reference a comment on the same review');
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO comments (review_id, line_number, author_id, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [review.id, lineNumber ?? null, req.user.id, content, parentId ?? null]
    );
    const comment = { ...rows[0], author_name: req.user.name ?? req.user.email };

    // Broadcast to everyone viewing this review, including the author's own
    // other tabs. The comment id is unique (DB-generated), so clients dedupe
    // by id instead of the server trying to guess which socket to skip —
    // that sidesteps races where the REST response and the socket event
    // arrive in either order.
    getIo()?.to(reviewRoom(review.id)).emit('comment:new', comment);

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.reviewId, req.user.id);
    const { rows } = await pool.query(
      'SELECT * FROM comments WHERE id = $1 AND review_id = $2',
      [req.params.commentId, review.id]
    );
    const comment = rows[0];
    if (!comment) throw new HttpError(404, 'Comment not found');
    if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the author or an admin can delete this comment');
    }
    // ON DELETE CASCADE on parent_id removes replies to this comment too.
    await pool.query('DELETE FROM comments WHERE id = $1', [comment.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
