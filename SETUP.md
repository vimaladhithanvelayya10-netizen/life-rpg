# LIFE RPG — Comprehensive Setup & Integration Guide

## Overview
This document guides you through setting up, configuring, and running the integrated production-ready LIFE RPG platform. The system merges the complete authentication/onboarding system from **RPG** (Gmail SMTP OTP, scrypt hashing, multi-step profile builder, custom avatar generation) with the full-featured dashboard from **WP/wp3** (React/Vite SPA, server-authoritative timer runtime, virtual economy, social features, and PostgreSQL persistence).

---

## Prerequisites
1. **Node.js**: v18+ (tested on Node.js v24)
2. **PostgreSQL**: v14+ (or Docker / Docker Desktop)
3. **Gmail Account** (Optional for live OTP): Gmail address and Google App Password (16 characters)

---

## 1. Database Setup

### Option A: Docker (Recommended)
From `wp3f/`:
```bash
docker compose up -d postgres
```
This provisions PostgreSQL on port `5432` with database `liferpg`, user `postgres`, and password `postgres`.

### Option B: Native PostgreSQL
Create a database named `liferpg`:
```sql
CREATE DATABASE liferpg;
```

---

## 2. Server Configuration

Navigate to `wp3f/server` and create/edit `.env`:
```ini
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg
APP_SECRET=your_super_secret_jwt_hmac_key_min_32_characters
CLIENT_ORIGIN=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173

# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_character_app_password
MAIL_FROM="LIFE RPG" <your_email@gmail.com>
```

> **Note**: If `SMTP_USER` or `SMTP_PASS` are omitted or set to placeholders, the system operates in **development mode**, generating and logging a 4-digit code in the response and console for seamless offline testing.

---

## 3. Database Initialization & Migrations

From `wp3f/server`:
```bash
npm install
npm run init
```
This command automatically:
1. Applies the comprehensive schema (`schema.sql`).
2. Runs idempotent migrations (`runMigrations`) to ensure columns for gender, birth date, streak tracking, session tracking, and user settings exist.
3. Seeds shared catalog items (achievements, skills, catalog inventory items, global rewards) **without fake user accounts or mock stats**.

---

## 4. Frontend Build & Development Server

From `wp3f/`:
```bash
npm install
npm run build
```

### Running for Development:
Terminal 1 (Backend API):
```bash
cd server
npm start
```

Terminal 2 (Frontend Dev Server):
```bash
npm run dev
```
Open `http://localhost:5173` in your browser. Unauthenticated visitors are automatically routed to `/page1.html` for login or registration.

---

## 5. Production Serving
The Express server in `wp3f/server/index.js` natively serves:
- Uploaded avatars via `/uploads`
- Authentication pages (`page1.html`, `page2.html`, `page3.html`)
- Production-compiled Vite SPA (`dist/`) with Single-Page Application HTML fallback routing.

To run the complete full-stack app on a single port:
```bash
cd server
node index.js
```
Access the complete application at `http://localhost:4000`.
