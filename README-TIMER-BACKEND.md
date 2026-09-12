# LIFE RPG Quest Timer - Backend Runtime Update

Quest timing is now coordinated with the PostgreSQL backend.

- Start / Pause / Resume / Stop are server-backed.
- The backend stores the quest deadline and active time.
- The browser sends a heartbeat while the page is visible.
- Closing or hiding the page stops active-time accrual, while the server deadline continues.
- If the deadline expires while the page is closed, the backend expires the quest and awards XP/coins from verified active time on the next sync.
- Extend Time adds minutes to the server deadline/duration.
- The Home page keeps the active quest visible with a live progress bar.
