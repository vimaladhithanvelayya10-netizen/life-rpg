# LIFE RPG — Architecture & System Design

## 1. System Overview
LIFE RPG is an integrated gamified productivity platform with a modular Express.js backend, a responsive React/Vite Single-Page Application, a relational PostgreSQL database as the single source of truth, and a multi-step authentication portal.

```
+-------------------------------------------------------------+
|                     Client Presentation                     |
|                                                             |
|  +---------------------------+   +-----------------------+  |
|  | Auth Portal (HTML/JS/CSS) |   | React 18 / Vite SPA   |  |
|  | - page1.html (Login)      |   | - Dashboard & Stats   |  |
|  | - page2.html (OTP Flow)   |   | - Quest Timer Engine  |  |
|  | - page3.html (Profile)    |   | - Shop & Inventory    |  |
|  | - script.js               |   | - Social & Leagues    |  |
|  +---------------------------+   +-----------------------+  |
+------------------------------+------------------------------+
                               |
                               | HTTP / JSON REST APIs (JWT Bearer)
                               v
+-------------------------------------------------------------+
|                     Express.js Backend                      |
|                                                             |
|  [routes/auth.js]     --> OTP, scrypt hash, sessions        |
|  [routes/quests.js]   --> Timer runtime, XP / coins         |
|  [routes/inventory.js]--> Shop purchases, equip/use logic   |
|  [routes/social.js]   --> Friends, challenges, feed         |
|  [routes/state.js]    --> Bootstrap state, cloud settings   |
+-------------------------------------------------------------+
                               |
                               | Connection Pool (node-postgres / pg)
                               v
+-------------------------------------------------------------+
|                     PostgreSQL Database                     |
|                                                             |
|  - users, user_profiles, user_stats, user_settings          |
|  - auth_otps, auth_sessions                                 |
|  - quests, quest_runtime, quest_completions                 |
|  - xp_transactions, coin_transactions                      |
|  - inventory_items, user_inventory, rewards                 |
|  - friendships, challenges, guild_members, activity_events  |
+-------------------------------------------------------------+
```

## 2. Server-Authoritative Timer & Anti-Cheat Engine
- When a quest starts (`POST /api/quests/:id/start`), the server writes to `quest_runtime` with `active_since = now()` and sets `deadline_at`.
- Active time calculation is strictly decoupled from wall-clock time:
  - While the client tab is visible, it transmits periodic heartbeats (`POST /api/quests/:id/heartbeat`).
  - Active seconds only increment based on verified elapsed heartbeat intervals (max 15s per heartbeat).
  - Pausing freezes remaining time in `paused_remaining_seconds`.
  - Stopping or expiration computes proportional rewards:
    $$\text{ratio} = \min\left(1.0, \frac{\text{active\_seconds}}{\text{total\_duration\_seconds}}\right)$$
    $$\text{awarded\_xp} = \text{round}(\text{base\_xp} \times \text{ratio})$$
    $$\text{awarded\_coins} = \text{round}(\text{base\_coins} \times \text{ratio})$$

## 3. Financial & Character Integrity
- All coin deductions and additions utilize PostgreSQL row-level locks (`FOR UPDATE`) inside serializable transactions (`tx()`).
- Inventory deductions and additions insert audit records into `inventory_transactions`.
- All XP increments check level milestones and unlock achievements automatically.
