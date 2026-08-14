import { useState } from 'react';
import CommentMarkdown from './CommentMarkdown.jsx';

// Renders one top-level comment plus its replies (one level of threading,
// matching the flat parent_id model in the comments table). Resolved state
// lives only on the top-level comment.
export default function CommentThread({ comment, replies, onReply, onToggleResolved }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const isResolved = Boolean(comment.resolved_at);

  async function handleReply(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await onReply(comment.id, text.trim());
    setText('');
    setReplying(false);
  }

  return (
    <div className={`comment-thread${isResolved ? ' resolved' : ''}`}>
      <div className="comment-head">
        <span>
          <span className="comment-author">{comment.author_name}</span>
          <span className="comment-time">{new Date(comment.created_at).toLocaleString('uk-UA')}</span>
        </span>
        {isResolved && <span className="comment-resolved-flag">✓ вирішено</span>}
      </div>
      <CommentMarkdown content={comment.content} />

      {replies.length > 0 && (
        <div className="comment-replies">
          {replies.map((r) => (
            <div key={r.id}>
              <span className="comment-author">{r.author_name}</span>
              <span className="comment-time">{new Date(r.created_at).toLocaleString('uk-UA')}</span>
              <CommentMarkdown content={r.content} />
            </div>
          ))}
        </div>
      )}

      {replying ? (
        <form className="comment-reply-form" onSubmit={handleReply}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Відповісти…"
            autoFocus
          />
          <div className="actions">
            <button type="submit" className="btn-sm">Відповісти</button>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setReplying(false)}>
              Скасувати
            </button>
          </div>
        </form>
      ) : (
        <div className="comment-actions">
          <button type="button" className="btn-sm btn-ghost" onClick={() => setReplying(true)}>
            Відповісти
          </button>
          {/* Guarded: only top-level comments can be resolved (backend
              enforces this too), and a caller could in principle omit the
              handler — this button previously rendered unconditionally and
              threw if clicked without one, which happened to affect every
              general (non-line) comment until this prop was wired up. */}
          {onToggleResolved && !comment.parent_id && (
            <button type="button" className="btn-sm btn-ghost" onClick={() => onToggleResolved(comment.id, !isResolved)}>
              {isResolved ? 'Повернути в роботу' : 'Позначити вирішеним'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
