# LIFE RPG — PostgreSQL Backend + Full UI

This release upgrades LIFE RPG from a localStorage-only prototype to a **PostgreSQL-backed full-stack foundation** while preserving the existing React/Vite UI.

## Database choice

**PostgreSQL is the primary persistent database.** The schema covers the current RPG systems and the social multiplayer layer:

- authentication/session data and email OTP records
- users, profiles, privacy, coach preferences
- quests, completions, goals, milestones, habits
- XP and coin transaction history
- inventory ownership and inventory transactions
- rewards and redemptions
- achievements and skills
- friends, friend requests, friendships and blocks
- social activity, reactions and comments
- challenges, duels-ready challenge types and challenge members
- guilds/groups and group challenges
- shared goals and friend streaks
- nudges and direct messages
- social notifications
- reports, audit logs and anti-cheat events
- focus sessions, journal entries and league memberships
- PostgreSQL-backed frontend state snapshots for safe migration of the existing UI

## 1. Start PostgreSQL

The easiest Windows setup is Docker Desktop:

```bash
cd <project-folder>
docker compose up -d postgres
```

Or use a local PostgreSQL installation and create a database named `liferpg`.

## 2. Configure the server

Copy:

```text
server/.env.example
```

to:

```text
server/.env
```

Default development connection:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg
```

Change the password/URL when using your own PostgreSQL installation.

## 3. Install dependencies

Frontend:

```bash
npm install
```

Backend:

```bash
npm run server:install
```

## 4. Initialize PostgreSQL

```bash
npm run server:init
```

This creates the full schema and seeds the development player, RPG items, achievements, rewards, challenges and a guild.

## 5. Run the backend

```bash
npm run server:dev
```

The API runs at:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/api/health
```

## 6. Run the frontend

In a second terminal:

```bash
npm run dev
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

The frontend bootstraps from PostgreSQL through `/api/bootstrap` and the Social section uses dedicated PostgreSQL-backed APIs.

## Social system included

The Social page now contains working database-backed flows for:

- Social Home
- Friend search by username, display name, user ID and friend code
- Friend requests with duplicate-request protection
- Accept / decline / cancel
- Friends list
- Activity feed
- RPG reactions
- Comments
- Nudges
- Challenges and joining challenges
- Friend/global leaderboard data
- Social notifications
- Block and report APIs
- Privacy visibility controls
- Guild creation and guild database structures
- Shared goal database structures and API
- Direct-message database structures and APIs
- Friend-streak database structures

The server validates permissions for social actions and writes important operations transactionally.

## Anti-cheat foundation

The backend includes dedicated `xp_transactions`, `coin_transactions`, `quest_completions`, `inventory_transactions`, `audit_logs` and `anti_cheat_events` tables. Important economy/state changes are intended to happen server-side and inside PostgreSQL transactions.

## Development authentication

For this UI integration, the frontend uses a development `x-user-id` header pointing at the seeded player. This is **not production authentication**. The PostgreSQL schema already includes `auth_otps`, `auth_sessions`, password storage on `users`, and profile/contact fields so the existing Gmail OTP/profile flow can be moved onto the same PostgreSQL database next.

## PostgreSQL is the source of truth

The existing local UI cache is retained only as a safe boot fallback. Once the backend is available, the frontend hydrates from PostgreSQL and synchronizes changes to the backend snapshot endpoint, while Social actions use dedicated relational APIs.


## PostgreSQL local setup

1. Install frontend dependencies:
   `npm install`
2. Install backend dependencies:
   `npm run server:install`
3. Create the backend environment file:
   `Copy-Item .\server\.env.example .\server\.env`
4. Start PostgreSQL:
   `docker compose up -d postgres`
5. Verify PostgreSQL:
   `docker compose exec postgres pg_isready -U postgres`
6. Initialize schema and demo data:
   `npm run server:init`
7. Start API:
   `npm run server:dev`
8. Start frontend in a second terminal:
   `npm run dev`

The backend initializer loads `server/.env` explicitly, is transaction-safe, prints the failing phase if SQL fails, and uses idempotent PostgreSQL DDL where practical. PostgreSQL is the only persistent application database.
