import { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { api } from '../api/client.js';

// GitHub-style diff between any two revisions of a review's code, backed by
// Monaco's built-in DiffEditor — no separate diffing library needed on our
// side. Revision metadata (list) is fetched cheaply without code_snapshot;
// full code for the two selected sides is fetched on demand.
export default function RevisionDiffView({ reviewId, revisions, language }) {
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [leftCode, setLeftCode] = useState('');
  const [rightCode, setRightCode] = useState('');

  // Default to comparing the two most recent revisions once the list loads.
  useEffect(() => {
    if (revisions.length === 0) return;
    const last = revisions[revisions.length - 1];
    const previous = revisions.length > 1 ? revisions[revisions.length - 2] : last;
    setLeftId((current) => current || previous.id);
    setRightId((current) => current || last.id);
  }, [revisions]);

  useEffect(() => {
    if (!leftId) return;
    api.get(`/reviews/${reviewId}/revisions/${leftId}`).then(({ data }) => setLeftCode(data.code_snapshot));
  }, [reviewId, leftId]);

  useEffect(() => {
    if (!rightId) return;
    api.get(`/reviews/${reviewId}/revisions/${rightId}`).then(({ data }) => setRightCode(data.code_snapshot));
  }, [reviewId, rightId]);

  if (revisions.length === 0) return <p>Ще немає ревізій для порівняння.</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <label>
          Було:{' '}
          <select value={leftId} onChange={(e) => setLeftId(e.target.value)}>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.revision_number} — {r.author_name} ({new Date(r.created_at).toLocaleString('uk-UA')})
              </option>
            ))}
          </select>
        </label>
        <label>
          Стало:{' '}
          <select value={rightId} onChange={(e) => setRightId(e.target.value)}>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.revision_number} — {r.author_name} ({new Date(r.created_at).toLocaleString('uk-UA')})
              </option>
            ))}
          </select>
        </label>
      </div>
      <DiffEditor
        height="65vh"
        language={language}
        original={leftCode}
        modified={rightCode}
        theme="vs-dark"
        options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 13 }}
      />
    </div>
  );
}
