# Платформа код-рев'ю

React + Node.js/Express + PostgreSQL. Каркас відповідає Тижню 1-2 плану розробки: auth (JWT + refresh tokens) та CRUD для проєктів і рев'ю.

## Структура

```
backend/    Express API, PostgreSQL (pg), JWT auth
  db/schema.sql       схема БД
  src/config/         змінні середовища
  src/db/             пул з'єднань
  src/middleware/     auth, обробка помилок
  src/controllers/    бізнес-логіка (auth, projects, reviews)
  src/routes/         REST-маршрути
frontend/   React (Vite), react-router, axios
  src/api/            axios-клієнт з auto-refresh access token
  src/context/        AuthContext
  src/pages/          Login, Register, Projects, ProjectDetail
```

## Запуск локально

1. Підняти PostgreSQL і застосувати схему:
   ```
   createdb code_review_hub
   psql code_review_hub -f backend/db/schema.sql
   ```
2. Скопіювати `backend/.env.example` у `backend/.env` і виставити секрети.
3. Встановити залежності і запустити:
   ```
   cd backend && npm install && npm run dev
   cd frontend && npm install && npm run dev
   ```
   Backend: http://localhost:4000, Frontend: http://localhost:5173 (проксі `/api` → backend).

## API (Тиждень 1-2)

- `POST /api/auth/register`, `/login`, `/refresh`, `/logout`
- `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`
- `GET/POST /api/projects/:projectId/reviews`, `GET /api/reviews/:id` (через вкладений маршрут), `PATCH /:id/status`, `DELETE /:id`

## Далі за планом

- Тиждень 3: Monaco Editor, підсвітка коду
- Тиждень 4: коментарі до рядків, треди (таблиця `comments` уже в схемі)
- Тиждень 5: Socket.io — live-коментарі, "хтось друкує"
- Тиждень 6: Redis — кеш сесій, pub/sub між WS-серверами
- Тиждень 7: ролі/права (частково закладено — `role` на users і `project_members`), rate-limiting (вже підключено express-rate-limit на auth і глобально)
- Тиждень 8: Docker Compose, Jest/RTL тести, деплой
