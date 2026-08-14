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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

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

  // Filters reset back to page 1 — a stale page number from a previous,
  // larger result set could otherwise land past the end of a narrower one.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 20 };
    api.get(`/projects/${projectId}/reviews`, { params }).then(({ data }) => {
      setReviews(data.reviews);
      setPagination(data.pagination);
    });
  }, [projectId, filters, page]);

  function updateFilter(field) {
    return (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const { data } = await api.post(`/projects/${projectId}/reviews`, { title, codeSnapshot });
    if (page === 1) setReviews((prev) => [data, ...prev]);
    setTitle('');
    setCodeSnapshot('');
  }

  return (
    <div className="stack">
      <h1>Рев'ю проєкту</h1>

      <form className="card stack" onSubmit={handleCreate}>
        <h2>Нове рев'ю</h2>
        <label>
          Заголовок
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" required />
        </label>
        <label>
          Код для рев'ю
          <textarea
            value={codeSnapshot}
            onChange={(e) => setCodeSnapshot(e.target.value)}
            placeholder="Вставте код…"
            rows={10}
            required
          />
        </label>
        <button type="submit" style={{ alignSelf: 'flex-start' }}>
          Створити рев'ю
        </button>
      </form>

      <fieldset>
        <legend>Фільтри</legend>
        <label>
          Пошук
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="За заголовком…"
          />
        </label>
        <label>
          Статус
          <select value={filters.status} onChange={updateFilter('status')}>
            <option value="">Будь-який статус</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Автор
          <select value={filters.authorId} onChange={updateFilter('authorId')}>
            <option value="">Будь-який автор</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Від
          <input type="date" value={filters.dateFrom} onChange={updateFilter('dateFrom')} />
        </label>
        <label>
          До
          <input type="date" value={filters.dateTo} onChange={updateFilter('dateTo')} />
        </label>
      </fieldset>

      <ul className="entity-list">
        {reviews.map((r) => (
          <li key={r.id} className="entity-row">
            <Link to={`/reviews/${r.id}`}>{r.title}</Link>
            <span className={`badge badge-${r.status}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
          </li>
        ))}
        {reviews.length === 0 && <li className="empty-state">Нічого не знайдено за цими фільтрами.</li>}
      </ul>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Назад
          </button>
          <span>
            Сторінка {pagination.page} з {pagination.totalPages} ({pagination.total} рев'ю)
          </span>
          <button type="button" className="btn-sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}
