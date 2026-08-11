import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

export async function listNotifications(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, a.name AS actor_name, r.title AS review_title
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       LEFT JOIN reviews r ON r.id = n.review_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) throw new HttpError(404, 'Notification not found');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await pool.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
