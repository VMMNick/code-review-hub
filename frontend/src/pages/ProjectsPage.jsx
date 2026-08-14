import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    api.get('/projects').then(({ data }) => setProjects(data));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    const { data } = await api.post('/projects', { name });
    setProjects((prev) => [data, ...prev]);
    setName('');
  }

  return (
    <div className="stack">
      <h1>Проєкти</h1>

      <form className="card row wrap" onSubmit={handleCreate} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <label style={{ flex: 1, minWidth: 200 }}>
          Назва проєкту
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Наприклад, «Backend API»" required />
        </label>
        <button type="submit">Створити</button>
      </form>

      <ul className="entity-list">
        {projects.map((p) => (
          <li key={p.id} className="entity-row">
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
          </li>
        ))}
        {projects.length === 0 && <li className="empty-state">Ще немає жодного проєкту — створіть перший вище.</li>}
      </ul>
    </div>
  );
}
