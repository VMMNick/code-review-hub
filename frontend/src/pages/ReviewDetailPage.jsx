import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { api } from '../api/client.js';
import { detectLanguage } from '../utils/detectLanguage.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../realtime/socket.js';
import CommentThread from '../components/CommentThread.jsx';
import RevisionDiffView from '../components/RevisionDiffView.jsx';

const LANGUAGE_OPTIONS = [
  'plaintext', 'javascript', 'typescript', 'python', 'ruby', 'go', 'rust',
  'java', 'kotlin', 'c', 'cpp', 'csharp', 'php', 'sql', 'shell', 'yaml',
  'json', 'html', 'css', 'scss', 'markdown'
];

const TYPING_STOP_DELAY_MS = 2000;

// comments come back flat (ordered by created_at); group into
// { [lineNumber ?? 'general']: [...] } plus a parentId -> replies map
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

// Comments arrive both as the REST response (immediate, own tab) and as a
// 'comment:new' broadcast (all tabs, including the sender's). Since ids are
// DB-generated and unique, de-duping on append is enough to avoid double
// rendering regardless of which one lands first.
function addCommentDeduped(prev, comment) {
  if (prev.some((c) => c.id === comment.id)) return prev;
  return [...prev, comment];
}

export default function ReviewDetailPage() {
  const { reviewId } = useParams();
  const { user } = useAuth();
  const [review, setReview] = useState(null);
  const [comments, setComments] = useState([]);
  const [typists, setTypists] = useState([]);
  const [language, setLanguage] = useState('plaintext');
  const [activeLine, setActiveLine] = useState(null);
  const [lineCommentText, setLineCommentText] = useState('');
  const [generalCommentText, setGeneralCommentText] = useState('');
  const [hideResolved, setHideResolved] = useState(false);
  const [error, setError] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [diffMode, setDiffMode] = useState(false);
  const [newRevisionCode, setNewRevisionCode] = useState('');
  const [showPushForm, setShowPushForm] = useState(false);
  const typingTimeoutRef = useRef(null);
  const socketRef = useRef(null);

  const loadComments = useCallback(async () => {
    const { data } = await api.get(`/reviews/${reviewId}/comments`);
    setComments(data);
  }, [reviewId]);

  const loadRevisions = useCallback(async () => {
    const { data } = await api.get(`/reviews/${reviewId}/revisions`);
    setRevisions(data);
  }, [reviewId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/reviews/${reviewId}`),
      api.get(`/reviews/${reviewId}/comments`),
      api.get(`/reviews/${reviewId}/revisions`)
    ])
      .then(([reviewRes, commentsRes, revisionsRes]) => {
        if (cancelled) return;
        setReview(reviewRes.data);
        setLanguage(detectLanguage(reviewRes.data.title));
        setComments(commentsRes.data);
        setRevisions(revisionsRes.data);
      })
      .catch(() => !cancelled && setError('Не вдалося завантажити рев\'ю'));
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  // Socket.io: join the review's room, listen for live comments and typing
  // updates from other clients. The connection itself is app-wide (see
  // AuthContext) — this page only joins/leaves this review's room on it.
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function join() {
      socket.emit('review:join', reviewId);
    }
    if (socket.connected) join();
    socket.on('connect', join);

    function handleNewComment(comment) {
      setComments((prev) => addCommentDeduped(prev, comment));
    }
    function handleTypingUpdate({ typists: list }) {
      setTypists(list.filter((t) => t.userId !== user?.id));
    }
    function handleCommentResolved({ id, resolved_at, resolved_by }) {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved_at, resolved_by } : c)));
    }
    function handleNewRevision(revision) {
      setReview((prev) => (prev ? { ...prev, code_snapshot: revision.code_snapshot } : prev));
      loadRevisions();
    }
    socket.on('comment:new', handleNewComment);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('comment:resolved', handleCommentResolved);
    socket.on('review:revision', handleNewRevision);

    return () => {
      socket.emit('review:leave');
      socket.off('connect', join);
      socket.off('comment:new', handleNewComment);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('comment:resolved', handleCommentResolved);
      socket.off('review:revision', handleNewRevision);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [reviewId, user?.id]);

  function notifyTyping(lineNumber) {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('typing:start', { lineNumber: lineNumber ?? null });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop');
    }, TYPING_STOP_DELAY_MS);
  }

  function stopTyping() {
    clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('typing:stop');
  }

  function handleEditorMount(editor) {
    editor.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber) setActiveLine(lineNumber);
    });
  }

  async function handleAddLineComment(e) {
    e.preventDefault();
    if (!lineCommentText.trim()) return;
    stopTyping();
    const { data } = await api.post(`/reviews/${reviewId}/comments`, {
      content: lineCommentText.trim(),
      lineNumber: activeLine
    });
    setLineCommentText('');
    setComments((prev) => addCommentDeduped(prev, data));
  }

  async function handleAddGeneralComment(e) {
    e.preventDefault();
    if (!generalCommentText.trim()) return;
    stopTyping();
    const { data } = await api.post(`/reviews/${reviewId}/comments`, {
      content: generalCommentText.trim(),
      lineNumber: null
    });
    setGeneralCommentText('');
    setComments((prev) => addCommentDeduped(prev, data));
  }

  async function handleReply(parentId, content) {
    const { data } = await api.post(`/reviews/${reviewId}/comments`, { content, parentId });
    setComments((prev) => addCommentDeduped(prev, data));
  }

  async function handlePushRevision(e) {
    e.preventDefault();
    if (!newRevisionCode.trim()) return;
    const { data } = await api.post(`/reviews/${reviewId}/revisions`, { codeSnapshot: newRevisionCode });
    setReview((prev) => (prev ? { ...prev, code_snapshot: data.code_snapshot } : prev));
    setNewRevisionCode('');
    setShowPushForm(false);
    await loadRevisions();
  }

  async function handleToggleResolved(commentId, resolved) {
    const { data } = await api.patch(`/reviews/${reviewId}/comments/${commentId}/resolved`, { resolved });
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved_at: data.resolved_at, resolved_by: data.resolved_by } : c))
    );
  }

  if (error) return <p role="alert">{error}</p>;
  if (!review) return <p>Завантаження…</p>;

  const { byLine, repliesByParent } = groupComments(comments);
  const visibleComments = hideResolved ? comments.filter((c) => !c.resolved_at) : comments;
  const { byLine: visibleByLine } = groupComments(visibleComments);
  const activeLineComments = activeLine ? visibleByLine.get(activeLine) ?? [] : [];
  const generalComments = visibleByLine.get('general') ?? [];
  const typistsOnActiveLine = typists.filter((t) => t.lineNumber === activeLine);
  const typistsGeneral = typists.filter((t) => t.lineNumber === null);

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 2 }}>
        <p>
          <Link to={`/projects/${review.project_id}`}>← до проєкту</Link>
        </p>
        <h1>{review.title}</h1>
        <p>Статус: {review.status}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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

          <button type="button" onClick={() => setDiffMode((v) => !v)} disabled={revisions.length < 2}>
            {diffMode ? 'Показати поточний код' : 'Показати diff версій'}
          </button>

          {(review.author_id === user?.id || review.projectRole === 'admin') && (
            <button type="button" onClick={() => setShowPushForm((v) => !v)}>
              {showPushForm ? 'Скасувати' : 'Надіслати нову версію коду'}
            </button>
          )}

          <span style={{ color: '#888', fontSize: 12 }}>Версій: {revisions.length}</span>
        </div>

        {showPushForm && (
          <form onSubmit={handlePushRevision} style={{ marginTop: 8 }}>
            <textarea
              value={newRevisionCode}
              onChange={(e) => setNewRevisionCode(e.target.value)}
              rows={8}
              placeholder="Вставте оновлений код…"
              required
            />
            <div>
              <button type="submit">Опублікувати нову версію</button>
            </div>
          </form>
        )}

        {diffMode ? (
          <RevisionDiffView reviewId={reviewId} revisions={revisions} language={language} />
        ) : (
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
        )}
      </div>

      <div style={{ flex: 1, maxHeight: '80vh', overflowY: 'auto' }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
          />{' '}
          Приховати вирішені
        </label>

        <h2>{activeLine ? `Коментарі до рядка ${activeLine}` : 'Клацніть на рядок коду, щоб прокоментувати'}</h2>

        {activeLine && (
          <>
            <form onSubmit={handleAddLineComment}>
              <textarea
                value={lineCommentText}
                onChange={(e) => {
                  setLineCommentText(e.target.value);
                  notifyTyping(activeLine);
                }}
                onBlur={stopTyping}
                rows={3}
                placeholder={`Коментар до рядка ${activeLine}… (підтримується Markdown)`}
                required
              />
              <div>
                <button type="submit">Додати коментар</button>
              </div>
            </form>

            {typistsOnActiveLine.length > 0 && (
              <p style={{ color: '#888', fontStyle: 'italic' }}>
                {typistsOnActiveLine.map((t) => t.name).join(', ')} зараз друкує…
              </p>
            )}

            {activeLineComments.map((c) => (
              <CommentThread
                key={c.id}
                comment={c}
                replies={repliesByParent.get(c.id) ?? []}
                onReply={handleReply}
                onToggleResolved={handleToggleResolved}
              />
            ))}
            {activeLineComments.length === 0 && <p>Ще немає коментарів до цього рядка.</p>}
          </>
        )}

        <h2>Загальне обговорення</h2>
        <form onSubmit={handleAddGeneralComment}>
          <textarea
            value={generalCommentText}
            onChange={(e) => {
              setGeneralCommentText(e.target.value);
              notifyTyping(null);
            }}
            onBlur={stopTyping}
            rows={2}
            placeholder="Загальний коментар до рев'ю… (підтримується Markdown)"
            required
          />
          <div>
            <button type="submit">Додати</button>
          </div>
        </form>

        {typistsGeneral.length > 0 && (
          <p style={{ color: '#888', fontStyle: 'italic' }}>
            {typistsGeneral.map((t) => t.name).join(', ')} зараз друкує…
          </p>
        )}

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
