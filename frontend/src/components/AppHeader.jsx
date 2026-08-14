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
    <header className="app-header">
      <Link to="/projects" className="brand">
        Code Review Hub
      </Link>
      <div className="row">
        <span className="user-chip">{user.name}</span>
        <NotificationBell />
        <button type="button" className="btn-ghost btn-sm" onClick={handleLogout}>
          Вийти
        </button>
      </div>
    </header>
  );
}
