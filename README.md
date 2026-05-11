# Платформа видеоуроков (MVP)

Стартовый каркас проекта под ТЗ: защищенная платформа видеоуроков с приоритетом на быстрый доступ к последнему уроку, навигацию по главам и защиту контента.

## Что уже подготовлено

- `frontend/`: React SPA с базовой структурой экранов:
  - Главная
  - Видеоуроки (главы, подглавы, поиск)
  - Профиль
  - Техподдержка
- `backend/`: Express API с JWT + refresh токенами, rate limit и HLS-защитой:
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /chapters`
  - `GET /progress`
  - `POST /videos/:videoId/position`
  - `POST /videos/:videoId/access-token`
  - `GET /hls/:videoId/manifest.m3u8`
  - `GET /hls/:videoId/key`
- `backend/sql/schema.sql`: схема PostgreSQL под пользователей, курсы, видео, прогресс, сессии и refresh токены.

## Быстрый запуск

### 1) Backend

```bash
cd backend
npm install
copy .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Опционально создайте `frontend/.env`:

```bash
VITE_API_URL=http://localhost:4000
```

## Конфигурация backend

Переменные в `backend/.env.example`:

- `DATABASE_URL`: PostgreSQL
- `REDIS_URL`: Redis (кэш и хранение refresh токенов)
- `ALLOWED_ORIGINS`: whitelist для CORS
- `MAX_DEVICES_PER_USER`: лимит устройств на пользователя
- `HLS_KEY_SECRET`: подпись токенов для выдачи HLS ключей

## Demo flow

- Откройте frontend и нажмите `Подключиться к API`
- Используется демо-пользователь: `student@example.com / demo1234`
- После входа загрузятся главы, прогресс и сохранение позиции через backend API
- В разделе уроков кнопка `Смотреть` открывает Video.js и защищенный HLS manifest
- При `401` frontend автоматически делает `POST /auth/refresh` и повторяет запрос

## Админка (MVP)

1) В `backend/.env` задайте:

- `ADMIN_EMAIL` (по умолчанию `admin@example.com`)
- `ADMIN_PASSWORD` (по умолчанию `admin1234`)

2) На экране входа используйте блок **Админ вход** и нажмите **Войти как админ**.

3) В разделе **Админка**:

- создавайте главы/подглавы/видео
- меняйте порядок (кнопки ↑/↓ — MVP, дальше можно заменить на drag&drop)
- загружайте файл видео (mp4) для записи видео — файл будет доступен как `/uploads/...`

## Следующие шаги (по этапам из ТЗ)

1. Перенести мок-данные (`chapters`, `demoUser`, progress) в PostgreSQL и сидирование.
2. Подключить Video.js или Shaka Player в `frontend` и использовать `manifest` + `access-token`.
3. Добавить реальную генерацию сегментов HLS и хранение ключей в KMS/secret manager.
4. Добавить админку: сортировка drag & drop для глав/подглав и загрузка видео.
5. На этапе 2 интегрировать DRM (Widevine/FairPlay).
