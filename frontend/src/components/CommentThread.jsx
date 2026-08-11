import { useState } from 'react';

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
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 4,
        padding: 8,
        marginBottom: 8,
        opacity: isResolved ? 0.6 : 1,
        background: isResolved ? '#f6fff6' : 'transparent'
      }}
    >
      <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>
          <strong>{comment.author_name}</strong>{' '}
          <span style={{ color: '#888', fontSize: 12 }}>
            {new Date(comment.created_at).toLocaleString('uk-UA')}
          </span>
        </span>
        {isResolved && <span style={{ color: '#2e7d32', fontSize: 12 }}>✓ вирішено</span>}
      </p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>

      {replies.length > 0 && (
        <div style={{ marginLeft: 16, borderLeft: '2px solid #eee', paddingLeft: 8 }}>
          {replies.map((r) => (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <strong>{r.author_name}</strong>{' '}
              <span style={{ color: '#888', fontSize: 12 }}>
                {new Date(r.created_at).toLocaleString('uk-UA')}
              </span>
              <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {replying ? (
        <form onSubmit={handleReply}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Відповісти…"
            autoFocus
          />
          <div>
            <button type="submit">Відповісти</button>
            <button type="button" onClick={() => setReplying(false)}>
              Скасувати
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setReplying(true)}>
            Відповісти
          </button>
          <button type="button" onClick={() => onToggleResolved(comment.id, !isResolved)}>
            {isResolved ? 'Повернути в роботу' : 'Позначити вирішеним'}
          </button>
        </div>
      )}
    </div>
  );
}
