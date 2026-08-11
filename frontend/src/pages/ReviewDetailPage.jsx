import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { api } from '../api/client.js';
import { detectLanguage } from '../utils/detectLanguage.js';

const LANGUAGE_OPTIONS = [
  'plaintext', 'javascript', 'typescript', 'python', 'ruby', 'go', 'rust',
  'java', 'kotlin', 'c', 'cpp', 'csharp', 'php', 'sql', 'shell', 'yaml',
  'json', 'html', 'css', 'scss', 'markdown'
];

export default function ReviewDetailPage() {
  const { reviewId } = useParams();
  const [review, setReview] = useState(null);
  const [language, setLanguage] = useState('plaintext');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/reviews/${reviewId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setReview(data);
        setLanguage(detectLanguage(data.title));
      })
      .catch(() => !cancelled && setError('Не вдалося завантажити рев\'ю'));
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  if (error) return <p role="alert">{error}</p>;
  if (!review) return <p>Завантаження…</p>;

  return (
    <div>
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
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          fontSize: 13
        }}
      />
    </div>
  );
}
