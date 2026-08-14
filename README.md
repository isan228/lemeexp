# Let me explain — платформа видеоуроков

React SPA + Express API + PostgreSQL. Production: [lemexplain.com](https://lemexplain.com), API: [api.lemexplain.com](https://api.lemexplain.com).

## Мобильное приложение

Flutter-клиент в каталоге [`mobile/`](./mobile) — тот же API, мобильный UI (нижняя навигация). Сайт не затрагивается. См. [mobile/README.md](./mobile/README.md).

Сборка APK и копирование на сайт (`frontend/public/downloads/lemexplain.apk`):

```bash
npm run mobile:apk
```

На лендинге кнопка **Скачать Android** → `/downloads/lemexplain.apk` (файл лежит в git и попадает в `frontend/dist` при `npm run build`).

## Быстрый запуск

### Backend

```bash
cd backend
npm install
copy .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Опционально `frontend/.env`:

```bash
VITE_API_URL=http://localhost:4000
```

## Маршруты приложения

| Путь | Назначение |
|------|------------|
| `/` | Лендинг |
| `/login` | Вход |
| `/register` | Регистрация (тариф → анкета → оплата) |
| `/payment` | Оплата через Finik |
| `/learning/home` | Главная кабинета |
| `/learning/lessons` | Каталог предметов |
| `/learning/profile` | Профиль |
| `/learning/support` | Чат с поддержкой |
| `/admin` | Админ-панель |

Внутренние ссылки задаются в `frontend/src/config/site.js` (`routes`, `site.supportEmail`).

## Видео и защита

- Загрузка в админке: **MP4 (H.264 + AAC)**.
- После загрузки — фоновая конвертация в **HLS с AES-128** (`ffmpeg` на сервере).
- Прямая раздача `/media/:videoId` отключена; воспроизведение только через защищённый HLS manifest + key по JWT.

## Demo flow

1. Откройте frontend (`http://localhost:5173`).
2. Войдите: `student@example.com` / `demo1234` (после `npm run db:seed`).
3. Кабинет → **Уроки** → предмет → глава → **Смотреть**.
4. При `401` frontend автоматически делает `POST /auth/refresh` и повторяет запрос.

## Админка

1. В `backend/.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (по умолчанию `admin@example.com` / `admin1234`).
2. Вход на `/login` или `/admin` с учётной записью admin (`subscription_type = admin` в БД).
3. Загрузка MP4 → автоматическая упаковка HLS; статус виден в разделе «Курсы и уроки».

## Деплой

См. [DEPLOY.md](./DEPLOY.md).
