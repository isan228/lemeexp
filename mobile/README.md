# Let me explain — мобильное приложение (Flutter)

Отдельный клиент для [lemexplain.com](https://lemexplain.com). Сайт (`frontend/`) не меняется — приложение ходит в тот же API.

## Возможности

- Лендинг, вход, регистрация (пробный / с оплатой)
- Оплата подписки (Finik через браузер) и промокоды
- Кабинет: главная, каталог (предмет → глава → урок), HLS-плеер
- Избранное, рейтинг за неделю, профиль, чат с ментором
- Мобильный UI: нижняя навигация вместо сайдбара

Сборка APK и копирование на сайт:

```bash
# из корня репозитория
npm run mobile:apk
```

Файл появится в `frontend/public/downloads/lemexplain.apk` и после деплоя frontend будет доступен по адресу `/downloads/lemexplain.apk` (кнопка на лендинге).

## Запуск

Нужен Flutter SDK (`flutter` в PATH).

```bash
cd mobile
flutter pub get
flutter run
```

### API URL

По умолчанию: `https://api.lemexplain.com`.

Локальный бэкенд:

```bash
# Android emulator
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000

# iOS simulator / desktop
flutter run --dart-define=API_BASE_URL=http://localhost:4000

# Физическое устройство (IP вашего ПК)
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:4000
```

В `backend/.env` добавьте origin приложения в `ALLOWED_ORIGINS`, если CORS режет запросы (для нативного приложения CORS обычно не мешает).

### Демо-вход

После `npm run db:seed` в backend:

- `student@example.com` / `demo1234`

## Структура

```
mobile/lib/
  config/       # API URL, тема
  models/       # модели данных
  providers/    # AuthProvider (сессия, каталог, прогресс)
  services/     # HTTP-клиент, хранение токенов
  screens/      # экраны (landing, learning, payment…)
  widgets/      # общие UI-компоненты
```

## Сборка

```bash
flutter build apk --release
flutter build ios --release
```
