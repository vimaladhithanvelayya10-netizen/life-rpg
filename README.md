# LIFE RPG

LIFE RPG is a full-stack gamified productivity web application that turns everyday goals and tasks into an RPG-style progression system.

Instead of treating productivity as a simple checklist, LIFE RPG represents real-world activities as quests. Completing quests can contribute to XP, coins, character statistics, skills, achievements, inventory, history, streaks, and other progression systems.

The application is designed as a persistent, authenticated, PostgreSQL-backed system rather than a purely client-side/localStorage prototype.

---

## 1. Project Overview

### Core idea

LIFE RPG combines:

- Productivity and task management
- RPG-style character progression
- XP and level progression
- Coins and rewards
- Quest timers
- Skills and statistics
- Inventory and shop systems
- History and activity tracking
- Social functionality
- Calendar-based organization
- Persistent user settings
- Authentication and email verification

### User journey

```text
Create Account
      ↓
Email Verification / OTP
      ↓
Profile Setup
      ↓
Login
      ↓
LIFE RPG Dashboard
      ↓
Create Quest
      ↓
Start / Pause / Resume / Stop Quest
      ↓
Complete Quest
      ↓
Earn XP + Coins
      ↓
Update Progress / Stats / History
      ↓
Use Inventory / Shop / Social / Calendar / Settings
```

---

# 2. Main Features

## Authentication

The application includes a real authentication flow rather than a mock login.

Features include:

- Account creation
- Email verification using OTP
- Password-based login
- Username/email login
- Session creation
- Logout
- Authenticated `/me` user retrieval
- Account deletion
- Protected backend APIs

Passwords are hashed on the backend and authentication state is maintained through backend sessions/tokens.

---

## Email OTP Verification

During account creation, the user enters an email address and requests a verification code.

Flow:

```text
Enter Email
    ↓
Send OTP
    ↓
Receive OTP by Email
    ↓
Enter 4-digit Code
    ↓
Verify Code
    ↓
Receive Onboarding Token
    ↓
Complete Profile
    ↓
Create Account
```

OTP behavior includes:

- 4-digit verification code
- 10-minute OTP validity
- Maximum OTP attempts
- 30-second resend cooldown
- OTP consumption after account creation
- Backend validation
- Resend-based email delivery

### Email provider

The production email integration uses the Resend HTTPS API.

Required backend environment variables:

```text
RESEND_API_KEY=
RESEND_FROM=
```

Optional:

```text
RESEND_REPLY_TO=
```

For production use, `RESEND_FROM` should use a sender address on a domain verified in Resend.

---

# 3. LIFE RPG Dashboard

The dashboard is the main user workspace.

The current design includes:

- LIFE RPG branding
- Navigation sidebar
- Top navigation
- Search
- Character/avatar section
- Current level
- XP progress
- Coins
- Daily quest area
- RPG statistics
- Current phase/time information
- Quick navigation to major RPG modules

The existing visual language is intentionally preserved when backend functionality is connected.

---

# 4. Quest System

Quests are the primary productivity mechanism.

A user can create a real-world activity as an RPG quest.

Typical quest information can include:

- Quest title
- Category
- Duration
- Priority
- Reward/progression
- Quest state
- Timing information

Quest runtime supports the productivity flow around an active quest.

The intended runtime actions include:

```text
Start
Pause
Resume
Stop
Extend
Heartbeat / Runtime Tracking
Completion
```

The backend is responsible for validating quest state and calculating rewards rather than trusting reward values supplied by the frontend.

---

# 5. XP and Level Progression

Completing productive activities contributes to RPG progression.

The system is designed around:

- XP
- Levels
- XP transactions
- Level progression
- Reward calculations
- Progress display

The Home dashboard exposes the user's current level and XP progress.

---

# 6. Coins and Rewards

Coins are the application's in-game currency.

Users can earn coins through supported productivity/reward actions and spend them through the shop.

The system is designed to keep reward calculations server-side so that clients cannot simply submit arbitrary XP or coin values.

---

# 7. RPG Statistics

LIFE RPG tracks seven primary attributes:

1. Intelligence
2. Strength
3. Vitality
4. Discipline
5. Agility
6. Charisma
7. Wealth

These statistics represent broader personal development rather than only task completion.

The dashboard provides a quick view of the current values and the Stats section gives the user a more focused view of progression.

---

# 8. Skills

Skills provide a more detailed level of personal development.

The system can represent individual abilities separately from the seven broad RPG statistics.

This makes it possible to view progression at both:

- Broad attribute level
- Specific skill level

---

# 9. Achievements

The application is designed to support achievement-based progression.

Achievements can be associated with milestones such as:

- Quest completion
- XP progression
- Level progression
- Streaks
- Other RPG milestones

Achievement rewards are intended to be processed by the backend rather than trusted from client-supplied values.

---

# 10. Streaks

LIFE RPG includes progression concepts based on consistency.

Streak-related data can include:

- Current streak
- Longest streak
- Activity consistency

Streak information can be surfaced through the user's profile/dashboard and historical activity.

---

# 11. Inventory

The Inventory section stores the user's earned or acquired items.

Inventory-related functionality includes concepts such as:

- Owned items
- Item quantities
- Using items
- Equipping items
- Unequipping items
- Inventory transactions
- Starter items/rewards

The backend controls inventory ownership and quantity validation.

---

# 12. Shop

The Shop provides a way to spend in-game coins.

Shop functionality includes:

- Viewing available items/rewards
- Purchasing items
- Deducting coins
- Granting purchased rewards
- Recording reward/inventory transactions

Purchases are intended to be validated and persisted in PostgreSQL.

---

# 13. History and Activity

The History area provides a record of user activity and progression.

Examples include:

- Completed quests
- Account activity
- XP-related activity
- Rewards
- Other RPG events

This allows the user to look back at their progress instead of only seeing their current state.

---

# 14. Social Features

The project includes a social layer designed around user-to-user interaction.

The planned/implemented social areas include:

- Friends
- Friend requests
- Accepting/declining requests
- Blocking/reporting
- Leaderboards
- Challenges
- Notifications
- Social activity

The social system is backed by the same authenticated PostgreSQL user model.

---

# 15. Calendar

The Calendar connects the RPG system with time-based planning.

It can be used to organize quests and activities around dates.

Conceptually:

```text
Today
  ↓
Current / daily quest activity

Past
  ↓
Historical activity

Future
  ↓
Scheduled planning
```

---

# 16. Settings

Settings allow users to personalize their LIFE RPG experience.

Supported configuration areas include:

- Theme
- Sounds
- Animations / motion
- Time format
- Week start
- Difficulty preference
- Quest reminders
- Streak protection
- Profile visibility
- Leaderboard visibility
- Other privacy/preferences where supported

Settings are designed to persist through the backend/database where appropriate, allowing them to remain available across sessions and devices.

---

# 17. Profile

The account/profile system can store RPG identity and profile information such as:

- Display name
- Username
- Email
- Date of birth
- Age
- Gender
- Contact information
- Profile image
- RPG title
- Friend code
- Coach/avatar preferences
- Streak information

---

# 18. Database

## PostgreSQL

PostgreSQL is the permanent source of truth for gameplay and account data.

The system is designed around persistent relational data for:

### Authentication

- Users
- Sessions
- Authentication state
- Password hashes
- Email verification
- Login/session information

### Profile

- Personal profile
- Username
- Email
- RPG title
- Profile image
- Friend code

### RPG

- XP
- Levels
- Coins
- Statistics
- Skills
- Achievements
- Inventory
- Rewards
- Streaks
- History
- Activity

### Quests

- Quests
- Quest state
- Quest runtime
- Timing
- Start/pause/resume/stop
- Completion
- Reward transactions
- Quest history

### Social

- Friend requests
- Friendships
- Blocks
- Reports
- Challenges
- Notifications
- Leaderboards
- Other social data

---

# 19. Database Transactions

Important gameplay operations are intended to use PostgreSQL transactions so that related changes succeed or fail together.

Examples include:

- Quest completion
- XP changes
- Coin changes
- Inventory updates
- Shop purchases
- Achievement rewards
- Level-up processing
- Social operations where required

This helps prevent partial writes such as awarding XP without recording the corresponding quest result.

---

# 20. Security Design

The backend is responsible for security-sensitive operations.

Important principles include:

- Passwords are hashed
- Protected routes require authentication
- User ownership is validated
- OTPs expire
- OTP attempts are limited
- OTP resending is rate-limited
- Client-supplied XP should not be blindly trusted
- Client-supplied coins should not be blindly trusted
- Client-supplied inventory quantities should not be blindly trusted
- Reward calculations belong on the backend
- PostgreSQL is the source of truth
- Database secrets are stored in environment variables
- API keys are never placed in frontend source code

Never place real secrets, API keys, database passwords, or email credentials in Git.

---

# 21. Technology Stack

## Frontend

- React
- React DOM
- Vite
- Framer Motion
- Lucide React
- HTML/CSS/JavaScript where applicable

### Current frontend package versions

```text
react                19.1.1
react-dom            19.1.1
framer-motion        12.23.12
lucide-react         0.468.0
vite                 7.1.5
@vitejs/plugin-react 4.7.0
```

---

## Backend

- Node.js
- Express
- PostgreSQL client (`pg`)
- CORS
- dotenv
- Resend HTTPS API for email delivery

### Current backend package versions

```text
express     5.1.0
pg          8.16.3
cors        2.8.5
dotenv      16.4.7
nodemailer  10.0.9
```

`nodemailer` remains installed in the backend dependency set, but the current OTP delivery implementation uses the Resend HTTPS API rather than direct SMTP delivery.

---

## Database

```text
PostgreSQL 17
```

---

## Local Infrastructure

```text
Docker
Docker Compose
```

Docker is used for local PostgreSQL development.

---

# 22. Project Architecture

The application follows this architecture:

```text
                    INTERNET
                       │
                       ▼
              VERCEL FRONTEND
                 React + Vite
                       │
                     HTTPS
                       │
                       ▼
              RAILWAY BACKEND
               Node.js + Express
                       │
                       ▼
             RAILWAY POSTGRESQL
```

For local development:

```text
Browser
   │
   ▼
Vite / React
localhost:5173
   │
   │ API requests
   ▼
Node / Express
localhost:8080
   │
   ▼
PostgreSQL 17
Docker
localhost:5432
```

PostgreSQL remains the source of truth.

The browser should not be treated as the permanent database.

---

# 23. Project Structure

The main project structure is:

```text
Dashboard/
│
├── public/
│   ├── page1.html
│   ├── page2.html
│   ├── page3.html
│   ├── script.js
│   ├── assets/
│   └── uploads/
│
├── server/
│   ├── routes/
│   │   └── auth.js
│   ├── db/
│   │   └── init.mjs
│   ├── middleware/
│   │   └── auth.js
│   ├── index.js
│   ├── package.json
│   └── ...
│
├── src/
│   ├── api.js
│   ├── components/
│   ├── pages/
│   └── ...
│
├── docker-compose.yml
├── index.html
├── package.json
├── vite.config.js
├── .env
├── README.md
├── ARCHITECTURE.md
├── DEPLOYMENT.md
├── ENVIRONMENT.md
└── SETUP.md
```

The exact component/file list can evolve as the application develops.

---

# 24. Root NPM Scripts

The root `package.json` contains scripts for both frontend and backend workflows.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "server:install": "npm --prefix server install",
    "server:init": "npm --prefix server run init",
    "server:dev": "npm --prefix server run dev",
    "server:start": "npm --prefix server run start"
  }
}
```

---

# 25. Backend NPM Scripts

The backend uses:

```json
{
  "scripts": {
    "dev": "node --watch index.js",
    "start": "node index.js",
    "init": "node db/init.mjs"
  }
}
```

Meaning:

```text
npm run dev
```

Runs the Vite frontend.

```text
npm run build
```

Creates the production frontend build.

```text
npm run preview
```

Previews the built frontend.

```text
npm run server:install
```

Installs backend packages.

```text
npm run server:init
```

Initializes the database schema.

```text
npm run server:dev
```

Starts the Node/Express backend in development mode.

```text
npm run server:start
```

Starts the backend normally.

---

# 26. Local Development Requirements

Install:

1. Node.js
2. npm
3. Docker Desktop
4. Git

PostgreSQL is provided through Docker for local development.

---

# 27. Local Setup

## Step 1 — Open PowerShell

Open PowerShell and go to the project:

```powershell
cd "E:\life rpg\Dashboard"
```

---

## Step 2 — Install frontend packages

```powershell
npm install
```

---

## Step 3 — Install backend packages

```powershell
npm run server:install
```

---

# 28. Start Local PostgreSQL

Make sure Docker Desktop is running.

From the project root:

```powershell
docker compose up -d
```

Check the containers:

```powershell
docker compose ps
```

The PostgreSQL container should be running.

---

# 29. Configure Environment Variables

LIFE RPG uses separate environment variables for the frontend and backend.

Environment files are used so that configuration and secrets are kept outside the source code.

## 29.1 Frontend `.env`

Create this file in the project root:

```text
E:\life rpg\Dashboard\.env
```

Example:

```env
VITE_API_URL=http://localhost:8080
```

For production on Vercel, the equivalent value should be configured in the Vercel project environment variables:

```env
VITE_API_URL=https://practical-miracle-production-003d.up.railway.app
```

### Why `VITE_API_URL` is needed

The React/Vite frontend uses this value as the base URL for backend API requests.

Local:

```text
Browser
   ↓
Vite frontend
   ↓
http://localhost:8080
   ↓
Node/Express backend
```

Production:

```text
Vercel frontend
   ↓
https://practical-miracle-production-003d.up.railway.app
   ↓
Railway Node/Express backend
```

Only variables intended for the browser should use the `VITE_` prefix.

NEVER put secrets such as database passwords, JWT secrets, OTP secrets, or Resend API keys into `VITE_*` variables.

---

## 29.2 Backend environment file

Create the backend environment file here:

```text
E:\life rpg\Dashboard\server\.env
```

Example:

```env
PORT=8080

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg

CLIENT_ORIGIN=http://localhost:5173

JWT_SECRET=replace-with-a-long-random-secret
OTP_SECRET=replace-with-a-long-random-secret

RESEND_API_KEY=
RESEND_FROM=LIFE RPG <your-verified-sender@example.com>
RESEND_REPLY_TO=
```

### Variable explanation

`PORT`

The port on which the Express backend runs.

Example:

```env
PORT=8080
```

`DATABASE_URL`

The PostgreSQL connection string used by the backend.

Example for the local Docker PostgreSQL database:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg
```

Use the actual username, password, database name, host, and port defined by the local Docker configuration if they differ.

`CLIENT_ORIGIN`

The frontend origin that is allowed to communicate with the backend.

Local example:

```env
CLIENT_ORIGIN=http://localhost:5173
```

For production, set it to the deployed Vercel frontend origin.

`JWT_SECRET`

A long random secret used by the backend for authentication tokens.

Example:

```env
JWT_SECRET=replace-with-a-long-random-secret
```

Do not use a real production secret in the README.

`OTP_SECRET`

A private backend secret associated with OTP/authentication operations.

Example:

```env
OTP_SECRET=replace-with-a-long-random-secret
```

`RESEND_API_KEY`

The private API key issued by Resend.

Example:

```env
RESEND_API_KEY=re_your_real_key
```

Never commit the real value to GitHub.

`RESEND_FROM`

The sender address used for verification emails.

Production example:

```env
RESEND_FROM=LIFE RPG <no-reply@yourverifieddomain.com>
```

The domain used by this sender should be verified in Resend.

`RESEND_REPLY_TO`

Optional reply-to address.

Example:

```env
RESEND_REPLY_TO=support@yourverifieddomain.com
```

---

## 29.3 Local `.env` setup

After creating the files:

### Frontend

Create:

```text
E:\life rpg\Dashboard\.env
```

Add:

```env
VITE_API_URL=http://localhost:8080
```

### Backend

Create:

```text
E:\life rpg\Dashboard\server\.env
```

Add the backend variables:

```env
PORT=8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=your-local-secret
OTP_SECRET=your-local-otp-secret

RESEND_API_KEY=your-resend-api-key
RESEND_FROM=LIFE RPG <your-verified-sender@example.com>
RESEND_REPLY_TO=
```

Save both files before starting the application.

---

## 29.4 Production environment setup

Production does not require copying the local `.env` files to the hosting platforms.

Instead, configure the variables in the hosting dashboards.

### Vercel — Frontend

In the Vercel project:

```text
Project
→ Settings
→ Environment Variables
```

Add:

```env
VITE_API_URL=https://practical-miracle-production-003d.up.railway.app
```

Enable it for the required environments, normally Production and Preview.

Do not add:

```text
DATABASE_URL
JWT_SECRET
OTP_SECRET
RESEND_API_KEY
SMTP_PASS
```

to the frontend.

---

### Railway — Backend

In the Railway backend service:

```text
Service
→ Variables
```

Configure:

```env
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLIENT_ORIGIN=https://your-vercel-domain
NODE_ENV=production

JWT_SECRET=your-production-secret
OTP_SECRET=your-production-otp-secret

RESEND_API_KEY=your-production-resend-api-key
RESEND_FROM=LIFE RPG <no-reply@yourverifieddomain.com>
RESEND_REPLY_TO=
```

The exact production `CLIENT_ORIGIN` should match the deployed Vercel frontend URL.

Railway PostgreSQL should supply the production `DATABASE_URL`; do not hard-code the production database password into source files.

---

## 29.5 `.env` security rules

Never commit these files or their contents to GitHub:

```text
.env
server/.env
.env.local
.env.production.local
```

A safe repository should contain placeholders only, for example:

```text
.env.example
server/.env.example
```

Example `.env.example`:

```env
VITE_API_URL=http://localhost:8080
```

Example `server/.env.example`:

```env
PORT=8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liferpg
CLIENT_ORIGIN=http://localhost:5173

JWT_SECRET=replace-me
OTP_SECRET=replace-me

RESEND_API_KEY=
RESEND_FROM=LIFE RPG <your-verified-sender@example.com>
RESEND_REPLY_TO=
```

Never put a real API key, database password, JWT secret, OTP secret, email password, or other private credential into an example file.

---

## 29.6 Verify that Git is ignoring environment files

From the project root:

```powershell
git check-ignore .env
git check-ignore server/.env
```

The files should be reported as ignored.

You can also inspect:

```text
.gitignore
```

and make sure it includes environment files such as:

```text
.env
server/.env
.env.local
.env.*.local
```

---

## 29.7 After changing environment variables

Frontend environment variables are read when Vite builds/starts the frontend. Restart the development server after changing `.env`.

For example:

```powershell
npm run dev
```

Stop the current process with:

```text
Ctrl + C
```

then start it again.

For production, redeploy the Vercel project after changing frontend environment variables.

Railway variables are applied to the backend service after deployment/restart as handled by Railway.

---

## Frontend `.env`

Example:

```env
VITE_API_URL=http://localhost:8080
```

The exact frontend API URL should match the local backend port.

---

## Backend environment

The backend needs values for:

```env
PORT=8080
DATABASE_URL=your_local_postgresql_connection_string
CLIENT_ORIGIN=http://localhost:5173

JWT_SECRET=replace_with_a_long_random_secret
OTP_SECRET=replace_with_a_long_random_secret

RESEND_API_KEY=your_resend_api_key
RESEND_FROM=LIFE RPG <your-verified-sender@example.com>
RESEND_REPLY_TO=
```

Never commit real secret values.

Never put backend secrets in `VITE_*` variables.

---

# 30. Initialize the Database

After PostgreSQL is running and the backend environment is configured:

```powershell
npm run server:init
```

This runs:

```text
server/db/init.mjs
```

and initializes the database required by the application.

---

# 31. Run the Backend

Open PowerShell in the project directory:

```powershell
npm run server:dev
```

The backend should start on the configured local port, currently intended to be:

```text
http://localhost:8080
```

---

# 32. Run the Frontend

Open a second PowerShell window:

```powershell
cd "E:\life rpg\Dashboard"
npm run dev
```

Vite will display the local frontend address, normally:

```text
http://localhost:5173
```

Open that URL in a browser.

---

# 33. Local Development – Two-Terminal Workflow

### Terminal 1 — Backend

```powershell
cd "E:\life rpg\Dashboard"
npm run server:dev
```

### Terminal 2 — Frontend

```powershell
cd "E:\life rpg\Dashboard"
npm run dev
```

### Docker

Docker Desktop must remain running for the PostgreSQL container.

---

# 34. Build Verification

Before deployment, run:

```powershell
npm run build
```

A successful Vite build should complete without compilation errors.

The production frontend output is generated into:

```text
dist/
```

---

# 35. Backend Installation Verification

```powershell
npm run server:install
```

This installs the backend packages defined in:

```text
server/package.json
```

---

# 36. Useful Local Commands

### Start PostgreSQL

```powershell
docker compose up -d
```

### Stop PostgreSQL

```powershell
docker compose down
```

### Check PostgreSQL container

```powershell
docker compose ps
```

### Install frontend dependencies

```powershell
npm install
```

### Install backend dependencies

```powershell
npm run server:install
```

### Initialize database

```powershell
npm run server:init
```

### Run frontend

```powershell
npm run dev
```

### Run backend

```powershell
npm run server:dev
```

### Production frontend build

```powershell
npm run build
```

### Preview production frontend build

```powershell
npm run preview
```

---

# 37. Production Deployment

The intended production architecture uses:

## Frontend

**Vercel**

Vercel hosts the React/Vite frontend.

Current project deployment:

```text
https://life-rpg-enara1.vercel.app
```

---

## Backend

**Railway**

Railway hosts the Node.js + Express backend.

Current backend deployment:

```text
https://practical-miracle-production-003d.up.railway.app
```

---

## Database

**Railway PostgreSQL**

The production database is hosted by Railway.

The PostgreSQL database should not be publicly exposed.

Architecture:

```text
Vercel
  │
  │ HTTPS API requests
  ▼
Railway Node/Express
  │
  ▼
Railway PostgreSQL
```

---

# 38. Vercel Configuration

The frontend requires:

```env
VITE_API_URL=https://practical-miracle-production-003d.up.railway.app
```

This variable belongs to the Vercel frontend environment.

It must not contain:

- PostgreSQL credentials
- JWT secrets
- OTP secrets
- Resend API keys
- SMTP passwords

Only public frontend configuration should be exposed through `VITE_*`.

---

# 39. Railway Configuration

The Railway backend requires environment variables such as:

```env
DATABASE_URL=
JWT_SECRET=
OTP_SECRET=
CLIENT_ORIGIN=
NODE_ENV=

RESEND_API_KEY=
RESEND_FROM=
RESEND_REPLY_TO=
```

Values must be configured in Railway rather than committed to Git.

The production `CLIENT_ORIGIN` should correspond to the deployed frontend origin.

---

# 40. Resend Production Email Setup

For production email verification:

1. Create/configure a Resend account.
2. Generate the API key.
3. Verify a domain in Resend.
4. Create a sender address on that verified domain.
5. Set `RESEND_FROM` to that sender.
6. Store `RESEND_API_KEY` only in Railway.

The backend should send:

```text
to: [the email entered by the user]
```

and should never permanently redirect all users to one fixed test email.

Resend test mode may restrict recipients until a domain is verified.

---

# 41. Git and GitHub

The source code is maintained in Git.

Current GitHub repository:

```text
https://github.com/vimaladhithanvelayya10-netizen/life-rpg
```

Typical workflow:

```powershell
git status
git add .
git commit -m "Describe the change"
git push
```

Before committing, review:

```powershell
git status
```

Never commit:

```text
.env
server/.env
API keys
database passwords
JWT secrets
OTP secrets
email passwords
```

---

# 42. API Overview

The backend follows REST-style API routes.

### Authentication

```text
POST /api/auth/send-otp
POST /api/auth/verify-otp
POST /api/auth/create-account
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
DELETE /api/auth/account
```

### Profile

```text
GET   /api/profile
PATCH /api/profile
```

### Quests

```text
GET    /api/quests
POST   /api/quests
PATCH  /api/quests/:id
DELETE /api/quests/:id

POST /api/quests/:id/start
POST /api/quests/:id/pause
POST /api/quests/:id/resume
POST /api/quests/:id/stop
POST /api/quests/:id/extend
POST /api/quests/:id/heartbeat
```

### History

```text
GET /api/history
GET /api/history/:id
```

### Stats

```text
GET /api/stats
```

### Inventory

```text
GET  /api/inventory
POST /api/inventory/:id/use
POST /api/inventory/:id/equip
POST /api/inventory/:id/unequip
```

### Shop

```text
GET  /api/shop
POST /api/shop/:id/purchase
```

### Social

```text
GET  /api/social/friends
POST /api/social/friends/request
POST /api/social/friends/:id/accept
POST /api/social/friends/:id/decline
POST /api/social/friends/:id/cancel
POST /api/social/block
POST /api/social/report
GET  /api/social/leaderboard
```

Endpoint names may evolve with the implementation, but the architecture is organized around these functional areas.

---

# 43. Important Data Flow

A major design principle is that gameplay is persisted through the backend.

Example:

```text
User completes Quest
        ↓
Backend validates completion
        ↓
PostgreSQL transaction
        ↓
XP transaction
        ↓
Coin transaction
        ↓
Stats update
        ↓
Level calculation
        ↓
Achievement check
        ↓
Streak update
        ↓
History / Activity
        ↓
Dashboard reflects new state
```

This means the same user can log in from another browser/device and continue with the persisted account state.

---

# 44. Cross-Device Goal

Because PostgreSQL is the source of truth, the intended experience is:

```text
Browser A
   ↓
Login
   ↓
Create quest / earn XP
   ↓
PostgreSQL

Browser B
   ↓
Login with same account
   ↓
Retrieve same PostgreSQL data
```

User progression should not depend on one browser's localStorage.

---

# 45. Development vs Production

## Development

```text
React + Vite
        ↓
Node + Express
        ↓
PostgreSQL 17
        ↓
Docker
```

## Production

```text
Vercel
  ↓
Node + Express on Railway
  ↓
PostgreSQL on Railway
```

Email:

```text
Node/Express
   ↓
Resend HTTPS API
   ↓
User's email address
```

---

# 46. Design Philosophy

LIFE RPG is designed around the idea:

> Turn everyday improvement into an adventure.

The product combines:

```text
PRODUCTIVITY
     +
GAMIFICATION
     +
PERSONAL DEVELOPMENT
     +
PERSISTENT PROGRESSION
     =
LIFE RPG
```

The current visual design is intentionally preserved while backend functionality is connected.

The design language includes:

- Dark RPG-inspired interface
- LIFE RPG branding
- Mountain background
- Character/avatar identity
- Sidebar navigation
- Progress bars
- Cards and panels
- RPG statistics
- Reward-oriented visual hierarchy
- Motion/animation support

---

# 47. Prototype Demonstration Flow

A short product demonstration can follow this sequence:

```text
Login
 ↓
Home Dashboard
 ↓
Add Quest
 ↓
Start Quest
 ↓
Complete Quest
 ↓
XP / Coins / Progress
 ↓
Stats
 ↓
Skills
 ↓
Inventory
 ↓
Shop
 ↓
History
 ↓
Social
 ↓
Calendar
 ↓
Settings
 ↓
Logout
```

This demonstrates the core LIFE RPG concept in a single user journey.

---

# 48. Testing Checklist

Before considering a release, test:

## Authentication

- Create account
- Receive OTP
- Verify OTP
- Complete profile
- Login
- Login again
- Logout
- Delete account

## Quest

- Create quest
- Start quest
- Pause quest
- Resume quest
- Stop quest
- Extend quest where supported
- Verify timer
- Verify completion
- Prevent duplicate rewards

## Progression

- XP updates
- Coin updates
- Stats updates
- Level updates
- Achievement updates
- Streak updates
- History updates
- Inventory updates

## Shop

- View shop
- Purchase item
- Deduct coins
- Grant item
- Record transaction

## Social

- Send friend request
- Accept request
- Leaderboard
- Challenge functionality where enabled
- Notifications

## Calendar

- Today
- Past activity
- Future scheduling behavior

## Settings

- Change setting
- Refresh
- Confirm persistence

## Cross-device

- Login from another browser/profile
- Verify the same persistent data

## Security

- Protected endpoint without authentication
- Access another user's data
- Attempt to manipulate XP
- Attempt to manipulate coins
- Attempt to use another user's inventory
- Attempt duplicate reward actions

---

# 49. Environment and Secrets

Never commit real values for:

```text
DATABASE_URL
JWT_SECRET
OTP_SECRET
RESEND_API_KEY
SMTP credentials
Database passwords
Other private tokens
```

Use environment variables instead.

A safe repository contains examples/placeholders only.

---

# 50. Common Troubleshooting

## Frontend cannot reach backend

Check:

```env
VITE_API_URL=
```

and confirm it points to the correct backend.

For local development:

```text
http://localhost:8080
```

For production:

```text
https://practical-miracle-production-003d.up.railway.app
```

---

## OTP is not received

Check:

1. `RESEND_API_KEY`
2. `RESEND_FROM`
3. Resend domain verification
4. Railway backend logs
5. Recipient email
6. Resend account restrictions

---

## Database connection fails

Check:

```text
DATABASE_URL
```

Confirm Docker is running locally:

```powershell
docker compose ps
```

---

## Frontend build fails

Run:

```powershell
npm install
npm run build
```

and inspect the first compilation error rather than only the final error message.

---

# 51. Deployment Platforms

LIFE RPG currently uses the following platform strategy:

| Purpose | Platform |
|---|---|
| Source control | GitHub |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Production database | Railway PostgreSQL |
| Local database | PostgreSQL 17 + Docker |
| Email delivery | Resend |
| Frontend framework | React + Vite |
| Backend framework | Node.js + Express |

---

# 52. Summary

LIFE RPG is a full-stack productivity RPG built around a simple concept:

> **Everyday tasks become quests, completing quests creates progression, and progression makes personal development visible and motivating.**

The system combines a polished RPG interface with:

- Real authentication
- Email OTP verification
- Persistent PostgreSQL data
- Quest management
- Timed productivity sessions
- XP
- Coins
- Levels
- RPG statistics
- Skills
- Achievements
- Inventory
- Shop
- History
- Streaks
- Social functionality
- Calendar
- Settings
- Cross-device persistence

### Technology

```text
React
Vite
Node.js
Express
PostgreSQL 17
Docker
Framer Motion
Lucide React
Resend
GitHub
Vercel
Railway
```

### Local

```text
Docker PostgreSQL
        ↓
Node / Express
        ↓
React / Vite
```

### Production

```text
Vercel
   ↓
Railway Node/Express
   ↓
Railway PostgreSQL
```

LIFE RPG's overall goal is to make productivity feel less like a checklist and more like a journey: **complete real-world quests, earn rewards, build skills, and level up your life.**
