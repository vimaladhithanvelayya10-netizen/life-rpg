import express from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeQuestRow, reconcileQuestRuntimes } from './quests.js';

const router = express.Router();
router.use(requireAuth);

export async function buildUserState(userId) {
  await reconcileQuestRuntimes(userId);

  // 1. User Profile & Stats & Settings
  const profileRes = await query(`
    SELECT u.username, u.display_name as name, u.email,
           p.title, p.level, p.xp, p.coins, p.friend_code,
           p.profile_visibility, p.activity_visibility, p.leaderboard_visibility,
           p.coach_avatar, p.coach_personality, p.coach_memory,
           p.gender, p.profile_image_url, p.streak, p.longest_streak,
           s.intelligence, s.strength, s.vitality, s.discipline, s.agility, s.charisma, s.wealth,
           st.theme, st.sounds, st.animations, st.time_format, st.week_start, st.difficulty,
           st.xp_animation, st.quest_reminders, st.streak_protection,
           st.profile_visible, st.leaderboard_visible
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    JOIN user_stats s ON s.user_id = u.id
    LEFT JOIN user_settings st ON st.user_id = u.id
    WHERE u.id = $1::uuid
  `, [userId]);

  if (!profileRes.rowCount) throw Object.assign(new Error('User profile not found'), { status: 404 });
  const p = profileRes.rows[0];

  // 2. User Quests (ONLY this user's real quests)
  const quests = (await query(`
    SELECT q.id, q.title, q.description, q.category, q.difficulty, q.duration_minutes as duration,
           q.deadline, q.start_date as "startDate", q.recurrence, q.priority,
           q.xp_reward as xp, q.coin_reward as coins, q.stat, q.stat_reward as "statReward",
           q.tags, q.subtasks, q.target_type as "targetType", q.target, q.progress, q.reminder,
           to_char(q.scheduled_time, 'HH24:MI') as time, q.location, q.is_private as private,
           q.status, q.elapsed_seconds as elapsed, q.archived,
           r.state as "runtimeState", EXTRACT(EPOCH FROM r.active_since)*1000 as "activeSince",
           r.deadline_at as "deadlineAt", r.active_seconds as "serverActiveSeconds",
           r.extended_seconds as "extendedSeconds", r.paused_remaining_seconds as "pausedRemainingSeconds",
           r.last_heartbeat_at as "lastHeartbeatAt", COALESCE(r.reward_granted, false) as "rewardGranted"
    FROM quests q
    LEFT JOIN quest_runtime r ON r.quest_id = q.id
    WHERE q.user_id = $1::uuid
    ORDER BY (q.status = 'IN_PROGRESS') DESC, q.created_at DESC
  `, [userId])).rows.map(serializeQuestRow);

  // 3. User Goals & Milestones
  const goals = (await query(`
    SELECT g.id, g.name, g.progress, g.deadline, g.status,
           COALESCE(json_agg(json_build_object('name', m.name, 'done', m.done) ORDER BY m.id)
                    FILTER (WHERE m.id IS NOT NULL), '[]') as milestones
    FROM goals g
    LEFT JOIN milestones m ON m.goal_id = g.id
    WHERE g.user_id = $1::uuid
    GROUP BY g.id
    ORDER BY g.created_at
  `, [userId])).rows;

  // 4. User Habits
  const habits = (await query(`
    SELECT id, name, frequency, target, unit, streak, done_today as "doneToday", paused
    FROM habits
    WHERE user_id = $1::uuid
    ORDER BY id
  `, [userId])).rows;

  // 5. User Inventory (ONLY items user owns, with quantity > 0)
  let inventory = (await query(`
    SELECT i.id, i.name, i.category as type, i.rarity, i.description as desc,
           ui.quantity as qty, COALESCE(ui.equipped, false) as equipped,
           i.effect, i.duration, ui.source, ui.expires_at as expires, i.code
    FROM user_inventory ui
    JOIN inventory_items i ON i.id = ui.item_id
    WHERE ui.user_id = $1::uuid AND ui.quantity > 0
    ORDER BY i.name
  `, [userId])).rows;

  if (inventory.length === 0) {
    const starterItems = (await query(`
      SELECT id, code FROM inventory_items
      WHERE code IN ('xp-boost', 'focus-potion', 'streak-shield')
    `)).rows;

    for (const st of starterItems) {
      await query(`
        INSERT INTO user_inventory (user_id, item_id, quantity, source)
        VALUES ($1::uuid, $2::uuid, 1, 'STARTER_PACK')
        ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = GREATEST(user_inventory.quantity, 1)
      `, [userId, st.id]);
    }

    inventory = (await query(`
      SELECT i.id, i.name, i.category as type, i.rarity, i.description as desc,
             ui.quantity as qty, COALESCE(ui.equipped, false) as equipped,
             i.effect, i.duration, ui.source, ui.expires_at as expires, i.code
      FROM user_inventory ui
      JOIN inventory_items i ON i.id = ui.item_id
      WHERE ui.user_id = $1::uuid AND ui.quantity > 0
      ORDER BY i.name
    `, [userId])).rows;
  }

  // 6. Rewards (Catalog where owner_id IS NULL + User custom rewards)
  const rewards = (await query(`
    SELECT id, name, cost, category, description as desc, owner_id
    FROM rewards
    WHERE is_active = true AND (owner_id = $1::uuid OR owner_id IS NULL)
    ORDER BY cost
  `, [userId])).rows;

  // 7. Achievements (Catalog + User unlocked state)
  const achievements = (await query(`
    SELECT a.id, a.code, a.name, a.description as desc, a.reward,
           COALESCE(ua.user_id IS NOT NULL, false) as unlocked
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1::uuid
    ORDER BY a.name
  `, [userId])).rows;

  // 8. Skills (Catalog + User level and unlocked state)
  const skills = (await query(`
    SELECT s.id, s.code, s.name,
           COALESCE(us.level, CASE WHEN s.code = 'knowledge' THEN 1 ELSE 0 END) as level,
           COALESCE(us.unlocked, CASE WHEN s.code = 'knowledge' THEN true ELSE false END) as unlocked,
           s.parents
    FROM skills s
    LEFT JOIN user_skills us ON us.skill_id = s.id AND us.user_id = $1::uuid
    ORDER BY s.name
  `, [userId])).rows;

  // 9. Activity Events (ONLY this user's real activities)
  const activity = (await query(`
    SELECT id, kind, text, value, created_at, reference_id as "questId"
    FROM activity_events
    WHERE user_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT 60
  `, [userId])).rows.map(a => ({
    ...a,
    time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dateKey: new Date(a.created_at).toISOString().slice(0, 10),
    occurredAt: a.created_at
  }));

  // 10. Notifications (ONLY this user's real notifications)
  const notifications = (await query(`
    SELECT id, type, message as text, is_read as unread, created_at
    FROM notifications
    WHERE user_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT 30
  `, [userId])).rows.map(n => ({ ...n, unread: !n.unread }));

  // 11. Friends (Active friendships)
  const friends = (await query(`
    SELECT u.id, u.display_name as name, p.xp, p.level, p.streak
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_id = $1::uuid THEN f.friend_id ELSE f.user_id END
    JOIN user_profiles p ON p.user_id = u.id
    WHERE (f.user_id = $1::uuid OR f.friend_id = $1::uuid) AND f.status = 'ACTIVE'
    ORDER BY p.xp DESC
  `, [userId])).rows;

  // 12. Challenges
  const challenges = (await query(`
    SELECT c.id, c.title as name,
           EXTRACT(DAY FROM (c.end_date - c.start_date))::int as days,
           COALESCE(cm.score, 0)::int as done,
           c.reward::jsonb as reward
    FROM challenges c
    LEFT JOIN challenge_members cm ON cm.challenge_id = c.id AND cm.user_id = $1::uuid
    WHERE c.status IN ('ACTIVE', 'PENDING')
    ORDER BY c.created_at DESC
  `, [userId])).rows.map(c => ({
    ...c,
    reward: typeof c.reward === 'object' ? JSON.stringify(c.reward) : c.reward
  }));

  return {
    profile: {
      id: userId,
      name: p.name,
      username: p.username,
      email: p.email,
      title: p.title,
      level: Number(p.level),
      xp: Number(p.xp),
      coins: Number(p.coins),
      friendCode: p.friend_code,
      gender: p.gender || 'male',
      coachAvatar: p.coach_avatar || 'female',
      profilePhoto: p.profile_image_url || '',
      streak: Number(p.streak || 0),
      longestStreak: Number(p.longest_streak || 0),
    },
    stats: {
      Intelligence: p.intelligence,
      Strength: p.strength,
      Vitality: p.vitality,
      Discipline: p.discipline,
      Agility: p.agility,
      Charisma: p.charisma,
      Wealth: p.wealth,
    },
    quests,
    goals,
    habits,
    inventory,
    rewards,
    achievements,
    skills,
    activity,
    notifications,
    journal: [],
    challenges,
    friends,
    coach: {
      avatar: p.coach_avatar || 'female',
      personality: p.coach_personality || 'Sage',
      expression: 'Thinking',
      memory: p.coach_memory || {}
    },
    settings: {
      theme: p.theme || 'dark',
      sounds: p.sounds !== false,
      animations: p.animations !== false,
      timeFormat: p.time_format || '12h',
      weekStart: p.week_start || 'Monday',
      difficulty: p.difficulty || 'Adaptive',
      xpAnimation: p.xp_animation !== false,
      questReminders: p.quest_reminders !== false,
      streakProtection: p.streak_protection || 'Ask first',
      profileVisible: p.profile_visible !== false,
      leaderboardVisible: p.leaderboard_visible !== false,
    }
  };
}

// GET /api/bootstrap
router.get('/bootstrap', async (req, res) => {
  try {
    const data = await buildUserState(req.userId);
    res.json({ data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/profile
router.get('/profile', async (req, res) => {
  try {
    const state = await buildUserState(req.userId);
    res.json({ profile: state.profile, stats: state.stats });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PATCH /api/profile
router.patch('/profile', async (req, res) => {
  try {
    const { name, title, coachAvatar } = req.body || {};
    if (name) {
      await query(`UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2`, [name.trim(), req.userId]);
    }
    if (title || coachAvatar) {
      await query(`
        UPDATE user_profiles
        SET title = COALESCE($1, title), coach_avatar = COALESCE($2, coach_avatar), updated_at = now()
        WHERE user_id = $3
      `, [title || null, coachAvatar || null, req.userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile
router.put('/profile', async (req, res) => {
  const { name, title } = req.body;
  if (name) await query(`UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2`, [name.trim(), req.userId]);
  if (title) await query(`UPDATE user_profiles SET title = $1, updated_at = now() WHERE user_id = $2`, [title, req.userId]);
  res.json({ ok: true });
});

// PATCH /api/coach
router.patch('/coach', async (req, res) => {
  try {
    const fields = []; const vals = []; let i = 1;
    if (req.body.avatar) { fields.push(`coach_avatar = $${i++}`); vals.push(req.body.avatar); }
    if (req.body.personality) { fields.push(`coach_personality = $${i++}`); vals.push(req.body.personality); }
    if (req.body.memory) { fields.push(`coach_memory = $${i++}`); vals.push(req.body.memory); }

    if (fields.length) {
      await query(`UPDATE user_profiles SET ${fields.join(',')}, updated_at = now() WHERE user_id = $${i}`, [...vals, req.userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings
router.get('/settings', async (req, res) => {
  try {
    const row = (await query(`SELECT * FROM user_settings WHERE user_id = $1`, [req.userId])).rows[0];
    res.json({ settings: row || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings
router.patch('/settings', async (req, res) => {
  try {
    const s = req.body || {};
    await query(`
      INSERT INTO user_settings (
        user_id, theme, sounds, animations, time_format, week_start,
        difficulty, xp_animation, quest_reminders, streak_protection,
        profile_visible, leaderboard_visible, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        theme = COALESCE(EXCLUDED.theme, user_settings.theme),
        sounds = COALESCE(EXCLUDED.sounds, user_settings.sounds),
        animations = COALESCE(EXCLUDED.animations, user_settings.animations),
        time_format = COALESCE(EXCLUDED.time_format, user_settings.time_format),
        week_start = COALESCE(EXCLUDED.week_start, user_settings.week_start),
        difficulty = COALESCE(EXCLUDED.difficulty, user_settings.difficulty),
        xp_animation = COALESCE(EXCLUDED.xp_animation, user_settings.xp_animation),
        quest_reminders = COALESCE(EXCLUDED.quest_reminders, user_settings.quest_reminders),
        streak_protection = COALESCE(EXCLUDED.streak_protection, user_settings.streak_protection),
        profile_visible = COALESCE(EXCLUDED.profile_visible, user_settings.profile_visible),
        leaderboard_visible = COALESCE(EXCLUDED.leaderboard_visible, user_settings.leaderboard_visible),
        updated_at = now()
    `, [
      req.userId, s.theme ?? 'dark', s.sounds ?? true, s.animations ?? true,
      s.timeFormat ?? s.time_format ?? '12h', s.weekStart ?? s.week_start ?? 'Monday',
      s.difficulty ?? 'Adaptive', s.xpAnimation ?? s.xp_animation ?? true,
      s.questReminders ?? s.quest_reminders ?? true, s.streakProtection ?? s.streak_protection ?? 'Ask first',
      s.profileVisible ?? s.profile_visible ?? true, s.leaderboardVisible ?? s.leaderboard_visible ?? true
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = (await query(`SELECT * FROM user_stats WHERE user_id = $1`, [req.userId])).rows[0];
    const xpHistory = (await query(`
      SELECT created_at, amount, balance_after, source_type, metadata
      FROM xp_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 30
    `, [req.userId])).rows;

    res.json({ stats, xpHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history
router.get('/history', async (req, res) => {
  try {
    const activities = (await query(`
      SELECT id, kind, text, value, created_at, reference_id as "questId"
      FROM activity_events
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 100
    `, [req.userId])).rows.map(a => ({
      ...a,
      time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateKey: new Date(a.created_at).toISOString().slice(0, 10),
      occurredAt: a.created_at
    }));

    const completions = (await query(`
      SELECT c.*, q.title, q.description, q.category, q.difficulty, q.duration_minutes,
             q.stat, q.tags, q.subtasks
      FROM quest_completions c
      JOIN quests q ON q.id = c.quest_id
      WHERE c.user_id = $1
      ORDER BY c.completed_at DESC LIMIT 50
    `, [req.userId])).rows;

    res.json({ activities, completions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
