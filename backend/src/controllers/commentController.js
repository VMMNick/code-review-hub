import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { getReviewOrThrow } from './reviewController.js';
import { getIo, reviewRoom } from '../realtime/ioRegistry.js';
import { sanitizePlainText } from '../utils/sanitize.js';
import { notifyReply, notifyMentions } from '../services/notifications.js';

const createCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  lineNumber: z.number().int().positive().nullable().optional(),
  parentId: z.string().uuid().nullable().optional()
});

const setResolvedSchema = z.object({ resolved: z.boolean() });

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

    let parent = null;
    if (parentId) {
      const { rows } = await pool.query(
        'SELECT id, review_id, author_id FROM comments WHERE id = $1',
        [parentId]
      );
      parent = rows[0];
      if (!parent || parent.review_id !== review.id) {
        throw new HttpError(400, 'parentId must reference a comment on the same review');
      }
    }

    const cleanContent = sanitizePlainText(content, { fieldName: 'content' });
    const { rows } = await pool.query(
      `INSERT INTO comments (review_id, line_number, author_id, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [review.id, lineNumber ?? null, req.user.id, cleanContent, parentId ?? null]
    );
    const comment = { ...rows[0], author_name: req.user.name ?? req.user.email };

    // Broadcast to everyone viewing this review, including the author's own
    // other tabs. The comment id is unique (DB-generated), so clients dedupe
    // by id instead of the server trying to guess which socket to skip —
    // that sidesteps races where the REST response and the socket event
    // arrive in either order.
    getIo()?.to(reviewRoom(review.id)).emit('comment:new', comment);

    // Notifications are best-effort: the comment is already committed, so a
    // failure here shouldn't turn a successful 201 into a 500.
    try {
      await notifyReply({
        parentAuthorId: parent?.author_id,
        reviewId: review.id,
        commentId: comment.id,
        actorId: req.user.id
      });
      await notifyMentions({
        content: cleanContent,
        projectId: review.project_id,
        reviewId: review.id,
        commentId: comment.id,
        actorId: req.user.id
      });
    } catch (notifyErr) {
      console.error('Failed to create notifications for comment', comment.id, notifyErr);
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

// Resolved state lives only on the top-level comment — a thread is
// resolved or it isn't, replies don't get their own state. Any project
// member can toggle it (same bar as posting a comment at all), not just
// the original author, since resolving is usually done by whoever fixed
// the issue, which may not be who's replying.
export async function setCommentResolved(req, res, next) {
  try {
    const review = await getReviewOrThrow(req.params.reviewId, req.user.id);
    const { resolved } = setResolvedSchema.parse(req.body);

    const { rows } = await pool.query(
      'SELECT * FROM comments WHERE id = $1 AND review_id = $2',
      [req.params.commentId, review.id]
    );
    const comment = rows[0];
    if (!comment) throw new HttpError(404, 'Comment not found');
    if (comment.parent_id) {
      throw new HttpError(400, 'Only a top-level comment can be marked resolved');
    }

    const { rows: updated } = await pool.query(
      `UPDATE comments SET resolved_at = $1, resolved_by = $2 WHERE id = $3 RETURNING *`,
      [resolved ? new Date() : null, resolved ? req.user.id : null, comment.id]
    );
    const result = updated[0];

    getIo()?.to(reviewRoom(review.id)).emit('comment:resolved', {
      id: result.id,
      resolved_at: result.resolved_at,
      resolved_by: result.resolved_by
    });

    res.json(result);
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
    const isProjectAdmin = review.projectRole === 'admin';
    if (comment.author_id !== req.user.id && !isProjectAdmin && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the author or a project admin can delete this comment');
    }
    // ON DELETE CASCADE on parent_id removes replies to this comment too.
    await pool.query('DELETE FROM comments WHERE id = $1', [comment.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
