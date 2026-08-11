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
- `GET/POST /api/projects/:projectId/reviews`
- `GET /api/reviews/:id`, `PATCH /api/reviews/:id/status`, `DELETE /api/reviews/:id` (top-level, для deep-link на сторінку рев'ю)

## Тиждень 3: Monaco Editor

- Фронтенд: `@monaco-editor/react`, сторінка `ReviewDetailPage` (`/reviews/:reviewId`) — read-only редактор з підсвіткою синтаксису.
- Мова визначається евристично з розширення у `title` рев'ю (`utils.py` → python) через `src/utils/detectLanguage.js`; є ручний селектор мови, бо в схемі немає окремого поля `language`.

## Тиждень 4: коментарі та треди

- `GET/POST /api/reviews/:reviewId/comments`, `DELETE /api/reviews/:reviewId/comments/:commentId`.
- Тред — одна вкладеність через `parent_id` (комент → відповіді), без реального часу: просто перезапит списку після POST.
- `line_number` необов'язковий: коментарі без нього потрапляють у "Загальне обговорення".
- Фронтенд: клік на рядок у Monaco (`onMouseDown` + `e.target.position.lineNumber`) відкриває панель коментарів для цього рядка.

## Тиждень 5: Socket.io — live-коментарі та "хтось друкує"

- Один HTTP-сервер (`http.createServer`) для Express і Socket.io (`backend/src/server.js`), автентифікація хендшейку через JWT access token (`socket.handshake.auth.token`).
- Кімнати `review:{id}`: клієнт приєднується через `review:join`, доступ перевіряється тим самим `getReviewOrThrow`, що й REST.
- Live-коментарі: після INSERT `commentController` емітить `comment:new` у кімнату рев'ю. Дублікатів немає завдяки дедуплікації за `id` на клієнті (comment id — з БД, унікальний), а не спробам вирахувати "чий це сокет" на сервері — це прибирає race condition між REST-відповіддю і сокет-подією незалежно від порядку їх приходу.
- Індикатор "хтось друкує": `typing:start`/`typing:stop` за (reviewId, lineNumber), автоочищення через 2с бездіяльності і на `disconnect`.
- Фронтенд: `frontend/src/realtime/socket.js` — єдиний `socket.io-client`, підключення лежить у `ReviewDetailPage`; proxy `/socket.io` додано у `vite.config.js`.

## Тиждень 6: Redis — кеш сесій і pub/sub між WS-серверами

- **Кеш сесій** (`backend/src/services/sessionCache.js`): на кожен виданий refresh-token у Redis кешується `{userId, email, role, name}` з TTL = `JWT_REFRESH_TTL_DAYS`. `/auth/refresh` спершу читає з Redis (без JOIN у Postgres); при промаху йде в Postgres, як і раніше. Postgres (`refresh_tokens`) лишається джерелом істини для відкликання — кеш видаляється при ротації/logout, тож повторне використання вже спожитого токена все одно ловиться через фолбек у БД.
- **Pub/sub для Socket.io** (`backend/src/realtime/socketServer.js`): підключено `@socket.io/redis-adapter` з окремими pub/sub-з'єднаннями (`createRedisClient()` у `backend/src/config/redis.js`, дубльоване під sub). Тепер `io.to(room).emit(...)` — і `comment:new`, і `typing:update` — доходить до клієнтів незалежно від того, до якого з кількох WS-процесів вони підключені.
- **Стан "хтось друкує" переїхав з in-memory `Map` у Redis** (`backend/src/realtime/typingStore.js`, hash `typing:{reviewId}`) — без цього кожен процес бачив би лише своїх локальних тайпістів і перезаписував би загальний список чужими неповними даними. TTL хеша (10с) самовідновлюється при кожному `typing:start`, як страховка на випадок аварійного завершення процесу без події `disconnect`.
- `docker-compose.yml` — Postgres + Redis для локальної розробки (сервіси backend/frontend додаються повністю на Тижні 8).

## Далі за планом

- Тиждень 7: ролі/права (частково закладено — `role` на users і `project_members`), rate-limiting (вже підключено express-rate-limit на auth і глобально)
- Тиждень 8: Docker Compose, Jest/RTL тести, деплой
