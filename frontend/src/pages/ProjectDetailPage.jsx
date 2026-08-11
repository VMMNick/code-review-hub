import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [reviews, setReviews] = useState([]);
  const [title, setTitle] = useState('');
  const [codeSnapshot, setCodeSnapshot] = useState('');

  useEffect(() => {
    api.get(`/projects/${projectId}/reviews`).then(({ data }) => setReviews(data));
  }, [projectId]);

  async function handleCreate(e) {
    e.preventDefault();
    const { data } = await api.post(`/projects/${projectId}/reviews`, { title, codeSnapshot });
    setReviews((prev) => [data, ...prev]);
    setTitle('');
    setCodeSnapshot('');
  }

  return (
    <div>
      <h1>Рев'ю проєкту</h1>
      <form onSubmit={handleCreate}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" required />
        <textarea
          value={codeSnapshot}
          onChange={(e) => setCodeSnapshot(e.target.value)}
          placeholder="Код для рев'ю"
          rows={10}
          required
        />
        <button type="submit">Створити рев'ю</button>
      </form>
      <ul>
        {reviews.map((r) => (
          <li key={r.id}>
            <Link to={`/reviews/${r.id}`}>{r.title}</Link> — {r.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
