import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { api } from '../api/client.js';
import { detectLanguage } from '../utils/detectLanguage.js';
import CommentThread from '../components/CommentThread.jsx';

const LANGUAGE_OPTIONS = [
  'plaintext', 'javascript', 'typescript', 'python', 'ruby', 'go', 'rust',
  'java', 'kotlin', 'c', 'cpp', 'csharp', 'php', 'sql', 'shell', 'yaml',
  'json', 'html', 'css', 'scss', 'markdown'
];

// comments come back flat (ordered by created_at); group into
// { [lineNumber ?? 'general']: { topLevel: [...], repliesByParent: Map } }
function groupComments(comments) {
  const byLine = new Map();
  for (const c of comments) {
    if (c.parent_id) continue; // handled as a reply below
    const key = c.line_number ?? 'general';
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(c);
  }
  const repliesByParent = new Map();
  for (const c of comments) {
    if (!c.parent_id) continue;
    if (!repliesByParent.has(c.parent_id)) repliesByParent.set(c.parent_id, []);
    repliesByParent.get(c.parent_id).push(c);
  }
  return { byLine, repliesByParent };
}

export default function ReviewDetailPage() {
  const { reviewId } = useParams();
  const [review, setReview] = useState(null);
  const [comments, setComments] = useState([]);
  const [language, setLanguage] = useState('plaintext');
  const [activeLine, setActiveLine] = useState(null);
  const [lineCommentText, setLineCommentText] = useState('');
  const [generalCommentText, setGeneralCommentText] = useState('');
  const [error, setError] = useState(null);

  const loadComments = useCallback(async () => {
    const { data } = await api.get(`/reviews/${reviewId}/comments`);
    setComments(data);
  }, [reviewId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/reviews/${reviewId}`), api.get(`/reviews/${reviewId}/comments`)])
      .then(([reviewRes, commentsRes]) => {
        if (cancelled) return;
        setReview(reviewRes.data);
        setLanguage(detectLanguage(reviewRes.data.title));
        setComments(commentsRes.data);
      })
      .catch(() => !cancelled && setError('Не вдалося завантажити рев\'ю'));
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  function handleEditorMount(editor) {
    editor.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber) setActiveLine(lineNumber);
    });
  }

  async function handleAddLineComment(e) {
    e.preventDefault();
    if (!lineCommentText.trim()) return;
    await api.post(`/reviews/${reviewId}/comments`, {
      content: lineCommentText.trim(),
      lineNumber: activeLine
    });
    setLineCommentText('');
    await loadComments();
  }

  async function handleAddGeneralComment(e) {
    e.preventDefault();
    if (!generalCommentText.trim()) return;
    await api.post(`/reviews/${reviewId}/comments`, {
      content: generalCommentText.trim(),
      lineNumber: null
    });
    setGeneralCommentText('');
    await loadComments();
  }

  async function handleReply(parentId, content) {
    await api.post(`/reviews/${reviewId}/comments`, { content, parentId });
    await loadComments();
  }

  if (error) return <p role="alert">{error}</p>;
  if (!review) return <p>Завантаження…</p>;

  const { byLine, repliesByParent } = groupComments(comments);
  const activeLineComments = activeLine ? byLine.get(activeLine) ?? [] : [];
  const generalComments = byLine.get('general') ?? [];

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 2 }}>
        <p>
          <Link to={`/projects/${review.project_id}`}>← до проєкту</Link>
        </p>
        <h1>{review.title}</h1>
        <p>Статус: {review.status}</p>

        <label>
          Мова підсвітки{' '}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>

        <Editor
          height="70vh"
          language={language}
          value={review.code_snapshot}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            fontSize: 13,
            glyphMargin: true
          }}
        />
      </div>

      <div style={{ flex: 1, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2>{activeLine ? `Коментарі до рядка ${activeLine}` : 'Клацніть на рядок коду, щоб прокоментувати'}</h2>

        {activeLine && (
          <>
            <form onSubmit={handleAddLineComment}>
              <textarea
                value={lineCommentText}
                onChange={(e) => setLineCommentText(e.target.value)}
                rows={3}
                placeholder={`Коментар до рядка ${activeLine}…`}
                required
              />
              <div>
                <button type="submit">Додати коментар</button>
              </div>
            </form>

            {activeLineComments.map((c) => (
              <CommentThread
                key={c.id}
                comment={c}
                replies={repliesByParent.get(c.id) ?? []}
                onReply={handleReply}
              />
            ))}
            {activeLineComments.length === 0 && <p>Ще немає коментарів до цього рядка.</p>}
          </>
        )}

        <h2>Загальне обговорення</h2>
        <form onSubmit={handleAddGeneralComment}>
          <textarea
            value={generalCommentText}
            onChange={(e) => setGeneralCommentText(e.target.value)}
            rows={2}
            placeholder="Загальний коментар до рев'ю…"
            required
          />
          <div>
            <button type="submit">Додати</button>
          </div>
        </form>
        {generalComments.map((c) => (
          <CommentThread
            key={c.id}
            comment={c}
            replies={repliesByParent.get(c.id) ?? []}
            onReply={handleReply}
          />
        ))}
      </div>
    </div>
  );
}
