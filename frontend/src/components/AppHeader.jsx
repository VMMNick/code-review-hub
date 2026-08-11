import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #eee' }}>
      <nav>
        <Link to="/projects">Проєкти</Link>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{user.name}</span>
        <NotificationBell />
        <button type="button" onClick={handleLogout}>
          Вийти
        </button>
      </div>
    </header>
  );
}
