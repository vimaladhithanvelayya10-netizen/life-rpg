# LIFE RPG — Deployment & Operations Guide

## Production Deployment Checklist

### 1. Database Provisioning
- Deploy PostgreSQL 14+ on AWS RDS, Google Cloud SQL, Supabase, Neon, or self-hosted Docker.
- Set appropriate `max_connections` and SSL enforcement (`ssl: { rejectUnauthorized: false }` if using managed cloud databases).

### 2. Environment Variables
- Generate a cryptographically secure `APP_SECRET` (e.g. `openssl rand -hex 32`).
- Configure `DATABASE_URL` with cloud database credentials.
- Set `SMTP_USER` and `SMTP_PASS` with production mail credentials.

### 3. Build & Execution
```bash
# 1. Install dependencies
npm install --prefix wp3f
npm install --prefix wp3f/server

# 2. Build Vite production bundle
npm run --prefix wp3f build

# 3. Apply migrations & seed catalogs
npm run --prefix wp3f/server init

# 4. Start production process with PM2 or systemd
cd wp3f/server
pm2 start index.js --name liferpg-api
```

### 4. Reverse Proxy & SSL (Nginx)
```nginx
server {
    listen 80;
    server_name play.liferpg.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name play.liferpg.app;

    ssl_certificate /etc/letsencrypt/live/play.liferpg.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/play.liferpg.app/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
