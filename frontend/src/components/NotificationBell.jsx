import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { getSocket } from '../realtime/socket.js';

const TYPE_LABELS = {
  reply: 'відповів(-ла) на ваш коментар',
  mention: 'згадав(-ла) вас у коментарі'
};

// Lives outside any single page (mounted in AppHeader) because notifications
// can arrive while browsing the projects list, not just while a specific
// review is open — it relies on the app-wide socket connection from
// AuthContext, plus every socket auto-joining its own user:{id} room server-side.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/notifications').then(({ data }) => setNotifications(data));

    const socket = getSocket();
    function handleNew(notification) {
      setNotifications((prev) => [notification, ...prev]);
    }
    socket.on('notification:new', handleNew);
    return () => socket.off('notification:new', handleNew);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleOpen() {
    setOpen((v) => !v);
  }

  async function handleClick(notification) {
    if (!notification.read_at) {
      const { data } = await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? data : n)));
    }
    setOpen(false);
    if (notification.review_id) navigate(`/reviews/${notification.review_id}`);
  }

  async function handleMarkAllRead() {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={handleOpen} aria-label="Сповіщення">
        🔔{unreadCount > 0 && <sup>{unreadCount}</sup>}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            width: 320,
            maxHeight: 400,
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #eee' }}>
            <strong>Сповіщення</strong>
            <button type="button" onClick={handleMarkAllRead}>
              Позначити всі прочитаними
            </button>
          </div>
          {notifications.length === 0 && <p style={{ padding: 8 }}>Немає сповіщень.</p>}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 8,
                border: 'none',
                borderBottom: '1px solid #f0f0f0',
                background: n.read_at ? 'white' : '#eef6ff',
                cursor: 'pointer'
              }}
            >
              <strong>{n.actor_name ?? 'Хтось'}</strong> {TYPE_LABELS[n.type] ?? n.type}
              {n.review_title && <> у «{n.review_title}»</>}
              <div style={{ color: '#888', fontSize: 12 }}>
                {new Date(n.created_at).toLocaleString('uk-UA')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
