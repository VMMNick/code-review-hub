import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';

const STATUS_LABELS = {
  open: 'відкрито',
  approved: 'схвалено',
  changes_requested: 'потрібні зміни'
};

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [reviews, setReviews] = useState([]);
  const [members, setMembers] = useState([]);
  const [title, setTitle] = useState('');
  const [codeSnapshot, setCodeSnapshot] = useState('');

  const [filters, setFilters] = useState({ status: '', authorId: '', dateFrom: '', dateTo: '', q: '' });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    api.get(`/projects/${projectId}/members`).then(({ data }) => setMembers(data));
  }, [projectId]);

  // Debounce the free-text search so we don't hit the API on every
  // keystroke; the other filters (dropdowns/dates) apply immediately.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: searchInput }));
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get(`/projects/${projectId}/reviews`, { params }).then(({ data }) => setReviews(data));
  }, [projectId, filters]);

  function updateFilter(field) {
    return (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));
  }

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

      <fieldset>
        <legend>Фільтри</legend>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Пошук за заголовком…"
        />
        <select value={filters.status} onChange={updateFilter('status')}>
          <option value="">Будь-який статус</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={filters.authorId} onChange={updateFilter('authorId')}>
          <option value="">Будь-який автор</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label>
          Від{' '}
          <input type="date" value={filters.dateFrom} onChange={updateFilter('dateFrom')} />
        </label>
        <label>
          До{' '}
          <input type="date" value={filters.dateTo} onChange={updateFilter('dateTo')} />
        </label>
      </fieldset>

      <ul>
        {reviews.map((r) => (
          <li key={r.id}>
            <Link to={`/reviews/${r.id}`}>{r.title}</Link> — {STATUS_LABELS[r.status] ?? r.status}
          </li>
        ))}
        {reviews.length === 0 && <li>Нічого не знайдено</li>}
      </ul>
    </div>
  );
}
