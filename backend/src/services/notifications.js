import { pool } from '../db/pool.js';
import { getIo, userRoom } from '../realtime/ioRegistry.js';

async function createNotification({ userId, type, reviewId, commentId, actorId }) {
  if (userId === actorId) return null; // never notify yourself
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, review_id, comment_id, actor_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, reviewId, commentId, actorId]
  );
  const notification = rows[0];
  getIo()?.to(userRoom(userId)).emit('notification:new', notification);
  return notification;
}

// Notify the parent comment's author that someone replied to their thread.
export async function notifyReply({ parentAuthorId, reviewId, commentId, actorId }) {
  if (!parentAuthorId) return;
  await createNotification({ userId: parentAuthorId, type: 'reply', reviewId, commentId, actorId });
}

// Mentions match @<email-local-part> against the project's members, e.g.
// "@kolya" resolves to whoever's email is kolya@example.com. The email
// local part is unambiguous and unique — display names can contain spaces
// or collide, and there's no separate "username" field in the schema.
const MENTION_PATTERN = /@([a-zA-Z0-9._-]+)/g;

export async function notifyMentions({ content, projectId, reviewId, commentId, actorId }) {
  const handles = [...content.matchAll(MENTION_PATTERN)].map((m) => m[1].toLowerCase());
  if (handles.length === 0) return;

  const { rows: members } = await pool.query(
    `SELECT u.id, u.email FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = $1`,
    [projectId]
  );
  const matchedUserIds = new Set(
    members.filter((m) => handles.includes(m.email.split('@')[0].toLowerCase())).map((m) => m.id)
  );

  await Promise.all(
    [...matchedUserIds].map((userId) =>
      createNotification({ userId, type: 'mention', reviewId, commentId, actorId })
    )
  );
}
