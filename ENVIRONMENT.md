# LIFE RPG — Environment Variables Specification

All environment variables must be declared in `wp3f/server/.env`. Never commit sensitive production credentials to version control.

| Variable Name | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `4000` | HTTP port for Express API backend |
| `DATABASE_URL` | **Yes** | `postgresql://postgres:postgres@localhost:5432/liferpg` | Connection string for PostgreSQL database |
| `APP_SECRET` | **Yes** | 64+ char random hex string | Key for signing JWT tokens and hashing sessions |
| `CLIENT_ORIGIN` | No | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins for browser fetch requests |
| `SMTP_HOST` | No | `smtp.gmail.com` | Mail server hostname |
| `SMTP_PORT` | No | `465` | Mail server port (465 for SSL, 587 for TLS) |
| `SMTP_SECURE` | No | `true` | Set to `true` for SSL on port 465 |
| `SMTP_USER` | No (Dev fallback) | `your_account@gmail.com` | Gmail address sending verification OTP codes |
| `SMTP_PASS` | No (Dev fallback) | `xxxx xxxx xxxx xxxx` | 16-character Google App Password |
| `MAIL_FROM` | No | `"LIFE RPG" <your_account@gmail.com>` | Display sender header for outgoing emails |

### Generating Google App Password
1. Sign in to your Google Account.
2. Ensure 2-Step Verification is active.
3. Visit **App passwords** (Security > 2-Step Verification > App passwords).
4. Create an app named "LIFE RPG".
5. Copy the 16-character string into `SMTP_PASS`.
