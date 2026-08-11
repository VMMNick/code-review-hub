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

## Технічне (позапланова ітерація, за запитом користувача)

### Пагінація для рев'ю та коментарів

- `GET /api/projects/:projectId/reviews` приймає `?page=&limit=` (1-індексація, за замовчуванням 20/сторінка, максимум 100), повертає `{ reviews, pagination: { page, limit, total, totalPages } }` замість голого масиву — фільтри (статус/автор/дата/пошук) поєднуються з пагінацією через ту саму параметризовану WHERE-клаузу, а `COUNT(*)` рахується тим самим набором умов.
- `GET /api/reviews/:reviewId/comments` пагінується **по тредах**, а не по рядках: сторінка — це N кореневих коментарів (`parent_id IS NULL`) плюс усі їхні відповіді, тож жоден тред ніколи не розривається між сторінками. Відповідь: `{ comments, pagination }`.
- Фронтенд: `ProjectDetailPage` — кнопки "← Назад" / "Далі →" зі скиданням на сторінку 1 при зміні фільтрів. `ReviewDetailPage` — кнопка "Завантажити старіші треди", що довантажує наступну сторінку і дописує її до вже завантажених коментарів (без перезапиту вже наявних).

### Логування (Pino) + моніторинг помилок (Sentry)

- `morgan` замінено на `pino` + `pino-http` (`backend/src/config/logger.js`, підключення в `app.js`). Кожен запит — один JSON-рядок логу (метод/URL/статус/час відповіді, з `req.id` для трасування конкретного запиту), той самий формат у dev і в проді — без окремого pretty-printer транформа, щоб не ловити розбіжності "працює локально, ламається в проді". `/health` виключено з автологування — його постійно опитує оркестратор контейнерів, і він лише засмічував би лог реальним трафіком.
- Рівень логування — `LOG_LEVEL` (за замовчуванням `debug` поза продакшеном, `info` у продакшені).
- `errorHandler` тепер логує через `pino`: `warn` для очікуваних 4xx (звичайний трафік, не інцидент), `error` (з повним стеком) для 5xx.
- Sentry (`@sentry/node`) — повністю опційний: без `SENTRY_DSN` (типово для локальної розробки й тестів) `initSentry()` — no-op, і сюди взагалі не входить жоден мережевий виклик до sentry.io. Якщо DSN заданий, `Sentry.setupExpressErrorHandler(app)` перехоплює помилки з обробників маршрутів до того, як їх "проковтне" `errorHandler`, а 5xx-помилки додатково відправляються через `Sentry.captureException` у самому `errorHandler`.

### Кешування частих запитів через Redis

- `backend/src/utils/cache.js` — невеликий read-through кеш поверх уже наявного Redis-клієнта (того самого, що й для refresh-токенів і Socket.io adapter). Кожен виклик відмовостійкий: якщо Redis недоступний (локальна розробка без `docker-compose up`, тимчасовий збій), читання/запис кешу логуються як `warn` і код одразу йде за даними в Postgres — збій кешу ніколи не стає збоєм API, лише трохи повільнішою відповіддю. Перевірено окремим скриптом проти `ioredis-mock` (реальний Redis у пісочниці підняти не вдалося — немає root, `apt-get install redis-server` заблоковано правами): кеш-хіт не викликає fetch вдруге, `INCR` версії справді змінює значення.
- Кешуються три "гарячі" точки: список рев'ю проєкту (`GET /projects/:id/reviews`, 30с), одиночний рядок рев'ю (використовується практично в кожному запиті через `getReviewOrThrow` — коментарі, ревізії, статус; 60с), список коментарів-тредів (`GET /reviews/:id/comments`, 15с — коротший TTL, бо коментарі й так живо синхронізуються через Socket.io, кеш впливає лише на початкове REST-завантаження/пагінацію, не на активних глядачів).
- Інвалідація через version-теговані ключі (`bumpVersion`/`getVersion`): мутація (створення/видалення рев'ю, зміна статусу, нова ревізія, новий/видалений/вирішений коментар) інкрементує лічильник версії для проєкту чи рев'ю, і всі кешовані записи з попередньою версією просто стають недосяжними та згасають за TTL — без необхідності перебирати чи `SCAN`-увати конкретні ключі для кожної комбінації фільтрів/сторінок.
- Кеш одиночного рядка рев'ю (`cache:review:{id}`) навмисно не містить `projectRole` — це поле залежить від користувача, і його кешування "перетекло" б між різними користувачами.

### API документація (Swagger/OpenAPI)

- `backend/src/docs/openapiSpec.js` — вручну підтримуваний OpenAPI 3.0.3-документ як звичайний JS-об'єкт (без окремої YAML-залежності), що покриває всі REST-ендпоінти: auth, projects/members, reviews/revisions (з пагінацією та фільтрами), comments (з пагінацією по тредах), notifications. Схеми відповідають реальним полям з контролерів (напр. `Review.projectRole` описаний як специфічний для користувача — той самий момент, що й у кеш-шарі вище).
- `GET /api/docs/openapi.json` — сира специфікація (для генерації Postman/Insomnia-колекції чи SDK). `GET /api/docs` — інтерактивна Swagger UI-сторінка (`swagger-ui-express`).
- Helmet за замовчуванням виставляє CSP, що блокує inline-`<script>`, який Swagger UI використовує для власного бутстрапу — тому CSP-заголовок знімається лише для шляху `/api/docs`, ніде більше.
- Покрито тестами (`app.test.js`): і `/api/docs/openapi.json` (валідний документ, є `paths['/auth/login']`), і `/api/docs/` (HTML-сторінка Swagger UI).

## Наскрізний аудит і виправлення недоліків

Позапланова ітерація: перечитано весь бекенд і фронтенд файл за файлом (middleware, контролери, realtime-шар, компоненти), плюс живий смоук-тест сервера. Знайдено й виправлено:

- **[Безпека] Секрети падали на небезпечний дефолт у продакшені.** `backend/src/config/env.js`: `required()` застосовував dev-заглушку (`dev-access-secret-change-me` тощо) незалежно від `NODE_ENV` — забутий `JWT_ACCESS_SECRET` у продакшн-деплої означав би підписування токенів секретом, який лежить прямо в цьому файлі в репозиторії. Тепер dev-заглушка діє лише поза продакшеном; у продакшені відсутній/порожній обов'язковий env var валить старт процесу одразу, з чіткою помилкою. `docker-compose.yml` більше не підставляє свій власний `change-me`-дефолт для JWT-секретів (`${VAR:?...}` замість `${VAR:-change-me}`) — `docker compose up` тепер відмовляється стартувати без реальних значень у `.env`. Перевірено вручну трьома сценаріями (продакшн без секрету → падає; продакшн із секретом → стартує; dev без секрету → dev-заглушка як і раніше).
- **[Баг] Кнопка "Позначити вирішеним" падала на загальних коментарях.** `ReviewDetailPage.jsx` рендерив `CommentThread` для загальних (не прив'язаних до рядка) коментарів без пропа `onToggleResolved`, а `CommentThread.jsx` викликав його безумовно при кліку — `TypeError`. Додано сам проп там, де його бракувало, і захист у `CommentThread.jsx` (кнопка рендериться лише коли є хендлер і коментар кореневий). Закрито регресійним тестом (`CommentThread.test.jsx`).
- **[Баг] "Зависла" сесія після невдалого silent-refresh.** `api/client.js`: коли refresh-токен протух/відкликаний, перехоплювач не скидав `accessToken` і ніяк не повідомляв `AuthContext` — інтерфейс продовжував показувати користувача залогіненим, а всі запити мовчки падали з 401 нескінченно. Додано `setAuthFailureHandler`, який `AuthContext` реєструє для локального логауту (без зайвого round-trip на сервер, бо невалідність refresh-токена вже підтверджена).
- **[Гігієна] Розсинхронізовані коментарі/специфікація.** Коментар у `commentRoutes.js` стверджував, що роутер монтується у двох місцях — насправді лише в одному (виправлено). OpenAPI-специфікація вказувала 200 для `PATCH /notifications/read-all`, хоча контролер повертає 204 (виправлено).
- **[Гігієна] Мертвий код.** `requireRole()` у `middleware/auth.js` і `query()` у `db/pool.js` ніде не викликалися (усі рольові перевірки й запити йдуть іншими шляхами) — видалено.

### [Критичний] Бекенд падав повністю, якщо Redis недоступний

Виявлено користувачем локально (не в рамках аудиту вище): запуск бекенда без запущеного Redis (наприклад, без `docker-compose up`) валив **увесь процес** через `MaxRetriesPerRequestError` (ioredis вичерпує ліміт ретраїв на команду й відхиляє проміс) — тобто збій Redis ламав не лише live-фічі, а взагалі весь API, порушуючи принцип "Redis впав — деградуємо, а не лежимо", застосований усюди в `cache.js`/`sessionCache.js`.

Причина в двох місцях:
- `realtime/typingStore.js` викликався напряму з асинхронних Socket.io-обробників (`socket.on('typing:start', async (...) => { await setTyping(...) })`), а Socket.io не ловить відхилені проміси своїх слухачів — необроблений reject там валив процес. Тепер кожна функція (`setTyping`/`clearTyping`/`getTypists`) сама ловить помилку, логує `warn` і деградує (порожній список замість падіння).
- `@socket.io/redis-adapter` сам видає внутрішні Redis-команди (напр. `subscribe()` одразу при підключенні адаптера, ще до першого клієнта) — це стороння бібліотека, і ми не можемо обгорнути її внутрішній проміс у try/catch. Додано глобальний `process.on('unhandledRejection', ...)` у `server.js`: логує через `logger.error` (і в Sentry, якщо увімкнено) та **не завершує процес** — усвідомлений вибір, бо Redis у цьому проєкті всюди необов'язковий для основної функціональності (auth/CRUD через Postgres працюють незалежно).

Перевірено відтворенням: піднято бекенд без Redis і протримано живим 25+ секунд (вихідний крах стався за ~11с) — `/health` продовжував відповідати `200`, процес не впав. Підтверджено користувачем локально: у логах видно ті самі два `MaxRetriesPerRequestError`, пійманих як `"Unhandled promise rejection (process kept running)"` — процес не впав.

Друга ітерація (той самий запуск виявив і це): без живого Redis ioredis ретраїть з'єднання нескінченно (~раз на 2с), і кожен ретрай логувався окремим рядком — за хвилину роботи без Redis це десятки однакових рядків `"Redis error"`/`"Redis pub client error"`/`"Redis sub client error"`, що засмічує консоль. `config/redis.js` тепер має `logRedisConnectionState(client, label)`: логує `warn` один раз, коли з'єднання падає, мовчить, поки клієнт ретраїть у фоні, і логує `info` один раз при відновленні (`'ready'`). Використовується і для `redisClient`, і для `pubClient`/`subClient` у `socketServer.js`. Перевірено: 30с без Redis → 5 рядків логу замість ~90.

### [Критичний] Корінь репозиторію мав npm workspaces, що конфліктувало з документованою установкою

Виявлено користувачем локально: `cd frontend && npm install` завершувався з попередженнями `EACCES` при очищенні тимчасових директорій, а `npm run dev` потім падав з `Cannot find module 'caniuse-lite/dist/unpacker/agents'`.

Корінь проблеми — не зламаний локальний install сам по собі, а структурна невідповідність: у корені репозиторію існував `package.json` з `"workspaces": ["backend", "frontend"]` і відповідний кореневий `package-lock.json`. Це змушує npm піднімати (hoist) залежності в кореневий `node_modules` замість `frontend/node_modules` при будь-якому `npm install` всередині `frontend/` чи `backend/` — тоді як **весь інший проєкт** (цей-таки README вище, `docker-compose.yml`, обидва `Dockerfile`, і вся перевірка тестами протягом цієї сесії) припускає, що `backend/` і `frontend/` — це два повністю незалежні проєкти з окремим `npm install` кожен. На Windows-машині користувача підняття в кореневий `node_modules` частково не вдалося (файли заблоковані, ймовірно OneDrive-синхронізацією теки "Документи" або антивірусом — звідси `EACCES: permission denied` при спробі npm прибрати тимчасові директорії після встановлення), і `browserslist` в результаті лишився без своєї залежності `caniuse-lite`.

Жоден інший файл у репозиторії не посилався на "workspaces" — кореневий `package.json` існував лише заради двох невикористовуваних скриптів (`dev:backend`/`dev:frontend`), про які README навіть не згадує. Видалено кореневі `package.json` і `package-lock.json` повністю — тепер структура репозиторію відповідає тому, як він і так документований та використовувався.

**Що потрібно зробити на своїй машині** (я не можу торкнутися файлів поза цією сесією): видалити застарілий/частково зламаний `node_modules` і в корені репозиторію (`code-review-hub\node_modules`), і в `frontend\node_modules`, після чого повторити `cd frontend && npm install && npm run dev` — тепер без кореневого workspace-конфігу npm встановить усе локально в `frontend/node_modules`, як і очікується.

Після виправлень: 24/24 бекенд-тестів, 14/14 фронтенд-тестів (додано 3 нових для регресії), живий смоук-тест сервера (health/docs/auth-guard/404) пройдено повторно.
