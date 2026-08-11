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
    <div>
      <h1>Проєкти</h1>
      <form onSubmit={handleCreate}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Назва проєкту"
          required
        />
        <button type="submit">Створити</button>
      </form>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
