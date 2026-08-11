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

## Тиждень 7: ролі й права доступу, rate-limiting

- `assertProjectAccess` тепер повертає ефективну роль користувача в проєкті (`role`): власник проєкту завжди діє як `admin`, інакше — `project_members.role`. Прокинуто далі як `review.projectRole` у `getReviewOrThrow`, щоб не робити зайвий запит.
- Зміна статусу рев'ю (approve/changes_requested) — лише `reviewer` або `admin` проєкту; автор не може самостійно схвалити власне рев'ю.
- Видалення рев'ю/коментаря — автор або `admin` проєкту (раніше перевірявся лише глобальний `users.role`, що не мало сенсу для командної роботи в межах конкретного проєкту).
- Керування учасниками: `GET/POST /api/projects/:id/members`, `PATCH/DELETE /api/projects/:id/members/:userId` — лише `admin` проєкту; власника проєкту не можна видалити чи понизити.
- `backend/src/middleware/rateLimiters.js` — `writeLimiter` (30 запитів/хв, ключ — `user.id`, а не IP, бо кілька колег можуть сидіти за одним офісним IP) на створення проєктів/рев'ю/коментарів і на керування учасниками — окремо від тісного лімітера на `/auth/*` і вільного глобального в `app.js`.

## Тиждень 8: Docker Compose, тести, деплой

- **Docker Compose**: `docker-compose.yml` тепер піднімає весь стек — `postgres`, `redis`, `backend` (Express + Socket.io) і `frontend` (nginx зі статичною збіркою React, проксіює `/api` і `/socket.io` на `backend`). `docker compose up --build` → фронт на `:8080`, бек на `:4000`. `backend/Dockerfile` і `frontend/Dockerfile` (multi-stage: build → nginx) + `.dockerignore` у обох.
- **Бекенд-тести** (`backend/tests/`, Jest + supertest): юніт-тести для `utils/tokens.js` (sign/verify JWT, хешування refresh-токенів) і HTTP-тести для `/health`, 404, валідації `/auth/register`, 401 на захищених маршрутах без токена. Тести навмисно не чіпають Postgres/Redis, тож проходять без `docker compose up` — DB-інтеграційні тести можна додати окремо в CI, де ці сервіси вже підняті.
  - Під час написання тестів знайдено і виправлено реальний баг: `errorHandler` повертав `500` на помилки валідації Zod замість `400`, бо `ZodError` не має `.status`. Тепер `ZodError` обробляється окремо.
- **Фронтенд-тести** (Vitest + React Testing Library + jsdom): `detectLanguage.test.js` (чиста функція) і `LoginPage.test.jsx` (рендер полів, введення тексту, `required`-атрибути). Конфіг — у `vite.config.js` (`test.environment: 'jsdom'`), сетап — `src/test/setup.js` (`@testing-library/jest-dom`).
- Обидва набори тестів запущені й пройшли: 11/11 бекенд, 7/7 фронтенд.
- **Деплой**: образи збираються з `backend/Dockerfile` і `frontend/Dockerfile`; секрети (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`) підставляються через змінні середовища в `docker-compose.yml`, за замовчуванням — dev-заглушки, для прод-середовища їх треба перевизначити (env файл або секрети оркестратора).

## Безпека (позапланова ітерація, за запитом користувача)

- **Валідація на кожному ендпоінті**: доповнено те, чого бракувало — `/auth/refresh` і `/auth/logout` раніше брали `refreshToken` з `req.body` без Zod, тож нестрічкове значення падало б у `crypto.createHash().update()` необробленим винятком. Тепер обидва проходять `refreshSchema`/`logoutSchema`.
- **Валідація UUID у параметрах маршруту** (`backend/src/middleware/validateParams.js`, підключено через `router.param(...)`): `:id`, `:projectId`, `:reviewId`, `:commentId`, `:userId` перевіряються до звернення в Postgres — чистий `400` замість generic `500` ("invalid input syntax for type uuid") на будь-якому невалідному ID у URL.
- **Захист від XSS у коментарях** (`backend/src/utils/sanitize.js`, `sanitize-html`, запиновано на `2.12.1` — новіші версії тягнуть ESM-only `htmlparser2`, який Jest не може `require()`): `content` коментаря, `title` рев'ю, `name` проєкту й користувача проганяються через `sanitizePlainText` перед записом у БД — усі HTML/script-теги вирізаються, а безпечні символи (`<`, `>` у порівняннях на кшталт `x < 5`) декодуються назад із entity-форми, щоб не показувались буквально як `&lt;`. React і так екранує все при рендері (ніде немає `dangerouslySetInnerHTML`), тож це — другий рубіж на випадок майбутнього Markdown-рендеру коментарів, який, найімовірніше, використовуватиме `dangerouslySetInnerHTML`. **Свідомо не застосовано до `review.code_snapshot`** — це код, що показується в Monaco як є, і вирізання тегів зламало б будь-який HTML/JSX-файл під рев'ю.
- **Ліміти розміру вхідних даних**: `codeSnapshot` обмежено 500 000 символів на рівні Zod-схеми (окремо від глобального `express.json({ limit: '2mb' })` у `app.js` — дає чітку помилку валідації замість `413`); `content` коментаря вже був обмежений 10 000 символів.
- **CSRF**: свідомо не додавали CSRF-middleware — автентифікація тут через JWT у заголовку `Authorization`, зчитаний з `localStorage`, а не через cookie-сесію. Браузер не прикріпить цей заголовок автоматично до міжсайтового запиту, тож класична CSRF-атака структурно неможлива. Заразом прибрано зайвий `credentials: true` з `cors()` в `app.js` і з Socket.io CORS-конфігу — ніде не використовуються cookie.
- Нові тести (`backend/tests/sanitize.test.js`, `validateParams.test.js`) + оновлені auth-тести: **18/18 бекенд-тестів пройшли**.

## Функціонал (позапланова ітерація, за запитом користувача)

### Resolved/unresolved для коментарів

- `comments.resolved_at`/`resolved_by` у схемі (+ `backend/db/migrations/001_comments_resolved.sql` для БД, створених до цієї зміни — `psql -f` по черзі, або наново `schema.sql` на чистій БД).
- Стан вирішеності належить лише кореневому коментарю треду (`parent_id IS NULL`) — відповіді власного стану не мають; спроба позначити відповідь вирішеною повертає `400`.
- `PATCH /api/reviews/:reviewId/comments/:commentId/resolved` `{ resolved: boolean }`, доступно будь-якому учаснику проєкту (той самий поріг, що й на створення коментаря — вирішує зазвичай не той, хто писав коментар, а хто виправив код).
- Live-синхронізація через Socket.io (`comment:resolved`), той самий підхід, що й `comment:new` у Тижні 5.
- У `ReviewDetailPage` — чекбокс "Приховати вирішені" і візуальне маркування (✓, приглушений фон) у `CommentThread`.

### Пошук і фільтрація рев'ю

- `GET /api/projects/:projectId/reviews` приймає опційні query-параметри `status`, `authorId`, `dateFrom`, `dateTo`, `q` (пошук по `title`, `ILIKE`). WHERE-клауза будується динамічно, але завжди параметризовано (`$1, $2, …`) — без ризику SQL-injection навіть з довільним набором фільтрів.
- Фронтенд (`ProjectDetailPage`): текстовий пошук з debounce 300мс, дропдауни статусу й автора (список учасників — з уже наявного `GET /projects/:id/members`), фільтр за датою створення.

### Markdown у коментарях

- `react-markdown` + `remark-gfm` (таблиці, закреслення, чекбокси) рендерять `comment.content` у `CommentMarkdown.jsx`. Навмисно **без** `rehype-raw` — react-markdown за замовчуванням не використовує `dangerouslySetInnerHTML`, тож "сирий" HTML у джерелі не стає живою розміткою (перевірено тестом: `<img onerror=…>` не породжує `<img>` у DOM). Це другий рубіж поверх бекендової `sanitizePlainText` (Тиждень "Безпека"), яка й так вирізає HTML-теги ще до запису в БД.
- Посилання відкриваються в новій вкладці з `rel="noopener noreferrer"`.
- Тести: `CommentMarkdown.test.jsx` — форматування, посилання, GFM-закреслення, і явна перевірка, що сирий HTML не виконується.

### Diff-view для версій коду

- Нова таблиця `review_revisions` (`backend/db/migrations/002_review_revisions.sql` для існуючих БД, з бекфілом ревізії №1 з поточного `code_snapshot`). `reviews.code_snapshot` і далі завжди дзеркалить останню ревізію — існуючий код, що читає рев'ю, не зламався.
- Створення рев'ю тепер пише в `reviews` і `review_revisions` в одній транзакції (`BEGIN`/`COMMIT` через виділений `client` з пулу) — рев'ю ніколи не існує без хоча б однієї ревізії.
- `GET /api/reviews/:id/revisions` — легкий список (без `code_snapshot`, щоб не тягнути потенційно сотні КБ на кожну ревізію заради селектора версій), `GET /api/reviews/:id/revisions/:revisionId` — повний код однієї ревізії, `POST /api/reviews/:id/revisions` — запушити нову версію (лише автор рев'ю або `admin` проєкту), з live-сповіщенням `review:revision` через Socket.io.
- Фронтенд: `RevisionDiffView.jsx` на Monaco `DiffEditor` (той самий пакет `@monaco-editor/react`, без окремої diff-бібліотеки) — вибір "було"/"стало" з дропдаунів, side-by-side порівняння. Перемикач "Показати diff версій" у `ReviewDetailPage`.

### Нотифікації (згадки/відповіді)

- Нова таблиця `notifications` (`type`: `reply` | `mention`, `user_id`, `actor_id`, `review_id`, `comment_id`, `read_at`) + ENUM `notification_type` у схемі, `backend/db/migrations/003_notifications.sql` для існуючих БД.
- `backend/src/services/notifications.js`: `notifyReply` — сповіщає автора коментаря, на який відповіли (пропускається, якщо відповідає сам собі); `notifyMentions` — парсить `@handle` у тексті коментаря (`/@([a-zA-Z0-9._-]+)/g`), зіставляє з `email`-локал-частиною учасників проєкту (`u.email.split('@')[0]`), сповіщає всіх знайдених. Обидві викликаються з `createComment` у `try/catch` — збій сповіщення (е.г. Redis недоступний) не валить сам коментар.
- `GET /api/notifications` (останні 50, з іменем автора дії та назвою рев'ю через JOIN), `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.
- Live-доставка: кожен сокет після підключення автоприєднується до кімнати `user:{id}` (`userRoom()` у `ioRegistry.js`, виклик у `socketServer.js`); нове сповіщення пушиться подією `notification:new` в цю кімнату.
- Життєвий цикл Socket.io-з'єднання переїхав з `ReviewDetailPage` у `AuthContext` (`connectSocket()` у `login`/`register`, `disconnectSocket()` у `logout`) — сповіщення мають працювати, поки користувач залогінений, а не лише на сторінці конкретного рев'ю. `ReviewDetailPage` тепер бере вже живий сокет через `getSocket()` і не керує його підключенням/відключенням.
- Фронтенд: `NotificationBell.jsx` (дропдаун, бейдж непрочитаних, клік → позначити прочитаним і перейти на рев'ю, "позначити всі прочитаними") та `AppHeader.jsx` (постійний хедер з навігацією, іменем користувача, дзвіночком і виходом), підключені в `App.jsx`.
