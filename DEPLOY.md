# Деплой на VPS (Ubuntu)

Инструкция для проекта **Платформа видеоуроков**: React (Vite) + Express API + PostgreSQL + Redis.

| Параметр | Значение |
|----------|----------|
| Репозиторий | `https://github.com/isan228/lemeexp.git` |
| Сервер | `vmi3369291` |
| Каталог на VPS | `/var/www/lemeexp` |
| PM2-процесс | `lemeexp-api` |
| Домен (сайт) | `https://lemexplain.com` |
| Домен (API) | `https://api.lemexplain.com` |
| Nginx-сайт | `/etc/nginx/sites-available/lemeexp` |

Узнать публичный IP на сервере (для DNS и SSH):

```bash
curl -4 ifconfig.me && echo
```

## Архитектура на сервере

| Компонент | Как работает |
|-----------|----------------|
| **Frontend** | Статика из `frontend/dist`, отдаёт Nginx |
| **Backend** | Node.js на `127.0.0.1:4000`, прокси через Nginx |
| **PostgreSQL** | База данных |
| **Redis** | Refresh-токены и кэш |
| **uploads/** | Загруженные видео (`backend/uploads`), не в git |

Адреса:

- **Сайт:** `https://lemexplain.com`
- **API:** `https://api.lemexplain.com`

DNS (A-записи на IP VPS):

| Имя | Тип | Значение |
|-----|-----|----------|
| `@` | A | IP VPS |
| `www` | A | IP VPS |
| `api` | A | IP VPS |

---

## 1. Подключение к серверу

```bash
ssh root@YOUR_SERVER_IP
```

Или, если в `~/.ssh/config` прописан хост:

```bash
ssh root@vmi3369291
```

Рабочий каталог проекта:

```bash
cd /var/www/lemeexp
```

---

## 2. Подготовка VPS (первый раз)

Обновите систему и установите пакеты:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw
```

### Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

### PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER drm_app WITH PASSWORD 'Enigma10';"
sudo -u postgres psql -c "CREATE DATABASE video_platform OWNER drm_app;"
```

Строка подключения:

```text
postgres://drm_app:Enigma10@localhost:5432/video_platform
```

### Redis

```bash
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
```

### PM2

```bash
npm install -g pm2
```

### Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 8080/tcp
ufw enable
```

---

## 3. Клонирование и сборка

```bash
mkdir -p /var/www/lemeexp
cd /var/www/lemeexp
git clone https://github.com/isan228/lemeexp.git .
```

### Backend

```bash
cd /var/www/lemeexp/backend
cp .env.example .env
nano .env
```

Пример `.env` для production:

```env
PORT=4000
JWT_SECRET=длинная-случайная-строка-1
JWT_REFRESH_SECRET=длинная-случайная-строка-2
DATABASE_URL=postgres://drm_app:Enigma10@localhost:5432/video_platform
REDIS_URL=redis://127.0.0.1:6379
ALLOWED_ORIGINS=https://lemexplain.com
MAX_DEVICES_PER_USER=2
HLS_KEY_SECRET=длинная-случайная-строка-3
ADMIN_EMAIL=admin@lemexplain.com
ADMIN_PASSWORD=смените-пароль-админа
```

Установка и миграции:

```bash
npm ci --omit=dev
npm run db:setup
mkdir -p uploads
chmod 750 uploads
```

Если `db:seed` падает с `relation "users" does not exist` — сначала не выполнилась миграция. Проверьте подключение и создайте таблицы:

```bash
grep DATABASE_URL .env
npm run db:migrate
sudo -u postgres psql -d video_platform -c '\dt'
npm run db:seed
```

### Frontend

URL API задаётся **на этапе сборки** (вшивается в бандл):

```bash
cd /var/www/lemeexp/frontend
echo 'VITE_API_URL=https://api.lemexplain.com' > .env.production
npm ci
npm run build
```

Папка `frontend/dist` — то, что отдаёт Nginx.

---

## 4. Запуск backend (PM2)

```bash
cd /var/www/lemeexp/backend
pm2 start src/index.js --name lemeexp-api
pm2 save
pm2 startup
```

Проверка:

```bash
curl -s http://127.0.0.1:4000/chapters | head
pm2 logs lemeexp-api
pm2 status
```

---

## 5. Nginx + HTTPS (lemexplain.com)

DNS уже должен указывать на VPS. Проверка:

```bash
dig +short lemexplain.com
dig +short api.lemexplain.com
```

### Конфиг Nginx

Создайте конфиг прямо на сервере (файлы из `deploy/` могут ещё не быть в git):

```bash
cat > /etc/nginx/sites-available/lemeexp << 'EOF'
# Frontend
server {
    listen 80;
    listen [::]:80;
    server_name lemexplain.com www.lemexplain.com;

    root /var/www/lemeexp/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}

# Backend API
server {
    listen 80;
    listen [::]:80;
    server_name api.lemexplain.com;

    client_max_body_size 512M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/lemeexp /etc/nginx/sites-enabled/lemeexp
nginx -t && systemctl reload nginx
```

Или, если в репозитории уже есть файл:

```bash
cp /var/www/lemeexp/deploy/nginx-lemexplain.conf /etc/nginx/sites-available/lemeexp
ln -sf /etc/nginx/sites-available/lemeexp /etc/nginx/sites-enabled/lemeexp
nginx -t && systemctl reload nginx
```

### Frontend и backend под домен

```bash
cd /var/www/lemeexp/frontend
echo 'VITE_API_URL=https://api.lemexplain.com' > .env.production
npm run build

cd /var/www/lemeexp/backend
nano .env
# ALLOWED_ORIGINS=https://lemexplain.com
pm2 restart lemeexp-api
```

### SSL (Let's Encrypt)

```bash
certbot --nginx -d lemexplain.com -d www.lemexplain.com -d api.lemexplain.com
```

### Проверки

```bash
ls -la /var/www/lemeexp/frontend/dist/index.html
curl -sI http://lemexplain.com/ | head -5
curl -s http://127.0.0.1:4000/health
curl -s https://api.lemexplain.com/health
```

В браузере: `https://lemexplain.com` — React-приложение.

---

## 6. Деплой по IP (запасной вариант)

Если домен временно недоступен — сайт `http://IP/`, API `http://IP:8080/`. См. `deploy/nginx-site-ip.conf.example`.

---

## 7. Обновление после изменений в GitHub

На VPS:

```bash
cd /var/www/lemeexp
git pull origin main

cd backend
npm ci --omit=dev
npm run db:migrate
pm2 restart lemeexp-api

cd ../frontend
npm ci
npm run build
```

### Push в GitHub (локально, Windows)

```powershell
npm run push
```

По умолчанию: коммит `chore: deploy ГГГГ-ММ-ДД ЧЧ:ММ` → push в GitHub.

Со своим сообщением:

```powershell
npm run push -- "fix: описание изменений"
```

Без коммита (только push):

```powershell
npm run push -- --push-only
```

### Обновление сайта на VPS

После `npm run push` — на сервере вручную `git pull` и пересборка (см. блок выше), или одной командой с Windows:

```powershell
npm run deploy
```

Один раз создайте `deploy.local.json`:

```powershell
copy deploy.config.example.json deploy.local.json
notepad deploy.local.json
```

Укажите IP VPS в поле `host`. SSH-ключ: `ssh-copy-id root@YOUR_SERVER_IP`.

---

## 8. Чеклист перед продакшеном

- [ ] Сменить `JWT_SECRET`, `JWT_REFRESH_SECRET`, `HLS_KEY_SECRET`, пароль админа и пароль БД
- [ ] `ALLOWED_ORIGINS` = только ваш frontend URL (без `*`)
- [ ] Не коммитить `.env` и `backend/uploads/` в git
- [ ] HTTPS на обоих доменах (после подключения домена)
- [ ] Резервные копии PostgreSQL и папки `uploads`

### Бэкап БД

```bash
sudo -u postgres pg_dump video_platform > /var/backups/video_platform_$(date +%F).sql
```

---

## 9. Типичные проблемы

| Симптом | Решение |
|---------|---------|
| **Welcome to nginx!** по IP | `rm /etc/nginx/sites-enabled/default`, конфиг `nginx-site-ip.conf.example`, `nginx -t && systemctl reload nginx` |
| CORS error в браузере | Совпадают ли `ALLOWED_ORIGINS` и `VITE_API_URL` при последней сборке frontend |
| 502 Bad Gateway | `pm2 status`, логи: `pm2 logs lemeexp-api` |
| **`ERR_MODULE_NOT_FOUND` @mancho.devs/authorizer** | `cd backend && git pull && npm ci --omit=dev && pm2 restart lemeexp-api` |
| **`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`** | В `.env`: `TRUST_PROXY=1`, затем `pm2 restart lemeexp-api` (уже в коде по умолчанию) |
| **`relation "users" does not exist`** при seed | Сначала `npm run db:migrate` (или `npm run db:setup`). Проверьте `DATABASE_URL` в `.env` и что БД `video_platform` существует |
| 401 / refresh не работает | Redis запущен: `systemctl status redis-server`, проверьте `REDIS_URL` |
| Видео не играет | Файл в `backend/uploads`, в БД есть `stream_path` |
| Порт занят | `ss -tlnp \| grep 4000` или смените `PORT` в `.env` |

---

## 10. Минимальные требования VPS

- 2 GB RAM (PostgreSQL + Node + Nginx)
- 20+ GB диск (видео в `uploads`)
- Ubuntu 22.04 / 24.04 LTS
