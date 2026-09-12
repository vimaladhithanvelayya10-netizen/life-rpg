# LIFE RPG — Quest Timer Update

This build implements the requested quest flow:

- Available quest shows only **Start**.
- Start begins a persistent timer.
- While active, the quest exposes **Pause / Resume / Stop**.
- The progress bar is red at low progress, yellow in the middle, and green near completion.
- Reaching the full duration automatically finalizes the quest.
- Stopping early awards XP, coins, and stat reward **proportional to elapsed time**.
- Quest XP/coin/stat rewards are added once only and are recorded in activity/history.
- Timer state survives refreshes through the existing PostgreSQL-backed state snapshot bridge.
- AI Coach memory uses larger typography with clear `Label :` formatting.

Setup:

```powershell
npm install
npm run server:install
Copy-Item .\server\.env.example .\server\.env
npm run dev
```

For PostgreSQL backend initialization, use the existing project instructions:

```powershell
docker compose up -d postgres
npm run server:init
npm run server:dev
```
