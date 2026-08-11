import { useState } from 'react';

// Renders one top-level comment plus its replies (one level of threading,
// matching the flat parent_id model in the comments table).
export default function CommentThread({ comment, replies, onReply }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');

  async function handleReply(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await onReply(comment.id, text.trim());
    setText('');
    setReplying(false);
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, marginBottom: 8 }}>
      <p style={{ margin: 0 }}>
        <strong>{comment.author_name}</strong>{' '}
        <span style={{ color: '#888', fontSize: 12 }}>
          {new Date(comment.created_at).toLocaleString('uk-UA')}
        </span>
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
        <button type="button" onClick={() => setReplying(true)}>
          Відповісти
        </button>
      )}
    </div>
  );
}
