import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await register(form.email, form.password, form.name);
      navigate('/projects');
    } catch {
      setError('Не вдалося зареєструватися. Перевірте дані.');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <h1>Реєстрація</h1>
          {error && <p role="alert">{error}</p>}
          <label>
            Ім'я
            <input value={form.name} onChange={update('name')} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} required />
          </label>
          <label>
            Пароль
            <input type="password" value={form.password} onChange={update('password')} minLength={8} required />
          </label>
          <button type="submit">Зареєструватися</button>
        </form>
        <p className="auth-switch">
          Вже маєте акаунт? <Link to="/login">Увійти</Link>
        </p>
      </div>
    </div>
  );
}
