import express from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

function questStatusEnum(label) {
  const map = {
    Pending: 'PENDING', Available: 'AVAILABLE', InProgress: 'IN_PROGRESS',
    'In Progress': 'IN_PROGRESS', Paused: 'PAUSED', Completed: 'COMPLETED',
    Failed: 'FAILED', Skipped: 'SKIPPED', Expired: 'EXPIRED',
    Abandoned: 'ABANDONED', Archived: 'ARCHIVED'
  };
  return map[label] || label;
}

function questLabel(status) {
  const map = {
    PENDING: 'Pending', AVAILABLE: 'Available', IN_PROGRESS: 'In Progress',
    PAUSED: 'Paused', COMPLETED: 'Completed', FAILED: 'Failed',
    SKIPPED: 'Skipped', EXPIRED: 'Expired', ABANDONED: 'Abandoned', ARCHIVED: 'Archived'
  };
  return map[status] || status;
}

export function serializeQuestRow(q) {
  return {
    ...q,
    status: questLabel(q.status),
    tags: q.tags || [],
    subtasks: q.subtasks || [],
    elapsed: Number(q.serverActiveSeconds ?? q.elapsed ?? 0),
    startedAt: q.runtimeState === 'RUNNING' && q.activeSince ? new Date(q.activeSince).getTime() : null,
    deadlineAt: q.deadlineAt ? new Date(q.deadlineAt).toISOString() : null,
    rewardGranted: Boolean(q.rewardGranted),
    completionRatio: Number(q.progress || 0) / 100
  };
}

function normalizeQuestInput(body = {}, existing = {}) {
  const title = String(body.title ?? existing.title ?? '').trim();
  if (!title) throw Object.assign(new Error('Quest name is required'), { status: 400 });
  const duration = Math.max(1, Math.round(Number(body.duration ?? existing.duration_minutes ?? 30)) || 30);
  const xp = Math.max(0, Math.round(Number(body.xp ?? existing.xp_reward ?? 0)) || 0);
  const coins = Math.max(0, Math.round(Number(body.coins ?? existing.coin_reward ?? Math.round(xp * 0.5))) || 0);
  const statReward = Math.max(0, Math.round(Number(body.statReward ?? existing.stat_reward ?? 0)) || 0);
  const target = Number(body.target ?? existing.target ?? duration) || 0;
  const asArray = (value) => Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : String(value ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const time = body.time === undefined ? (existing.scheduled_time || null) : (body.time || null);

  return {
    title,
    description: String(body.description ?? existing.description ?? ''),
    category: String(body.category ?? existing.category ?? 'Personal'),
    difficulty: String(body.difficulty ?? existing.difficulty ?? 'Normal'),
    duration,
    deadline: body.deadline === undefined ? (existing.deadline ?? 'Today') : String(body.deadline ?? ''),
    startDate: body.startDate === undefined ? (existing.start_date ?? null) : (body.startDate || null),
    recurrence: String(body.recurrence ?? existing.recurrence ?? 'One-time'),
    priority: String(body.priority ?? existing.priority ?? 'Medium'),
    xp, coins,
    stat: body.stat === undefined ? (existing.stat ?? 'Intelligence') : (body.stat || 'Intelligence'),
    statReward,
    tags: asArray(body.tags ?? existing.tags),
    subtasks: asArray(body.subtasks ?? existing.subtasks),
    targetType: body.targetType === undefined ? (existing.target_type ?? 'Time') : (body.targetType || null),
    target,
    reminder: body.reminder === undefined ? (existing.reminder ?? 'None') : (body.reminder || null),
    time,
    location: body.location === undefined ? (existing.location ?? null) : (body.location || null),
    private: body.private === undefined ? Boolean(existing.is_private) : Boolean(body.private)
  };
}

export function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.max(0, Number(xp) || 0) / 1000) + 1);
}

export async function runtimeActiveSeconds(client, runtime) {
  let active = Number(runtime.active_seconds) || 0;
  if (runtime.state === 'RUNNING' && runtime.last_heartbeat_at) {
    const r = await client.query(`
      SELECT LEAST(15, GREATEST(0, EXTRACT(EPOCH FROM (now() - $1::timestamptz))))::int AS seconds
    `, [runtime.last_heartbeat_at]);
    active += Number(r.rows[0]?.seconds || 0);
  }
  return active;
}

export async function checkAndUnlockAchievements(client, userId) {
  const profileRes = await client.query(`SELECT level, xp, streak FROM user_profiles WHERE user_id = $1`, [userId]);
  const p = profileRes.rows[0];
  const countRes = await client.query(`
    SELECT count(*)::int as count 
    FROM quest_completions 
    WHERE user_id = $1 AND (verification->>'status' = 'COMPLETED')
  `, [userId]);
  const questCount = countRes.rows[0]?.count || 0;

  const toUnlock = [];
  if (questCount >= 1) toUnlock.push('first-step');
  if (questCount >= 10) toUnlock.push('consistent');
  if (p && p.streak >= 30) toUnlock.push('iron-will');
  if (p && p.level >= 100) toUnlock.push('legendary');

  for (const code of toUnlock) {
    const ach = await client.query(`SELECT id, name FROM achievements WHERE code = $1`, [code]);
    if (ach.rowCount) {
      const ins = await client.query(`
        INSERT INTO user_achievements(user_id, achievement_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [userId, ach.rows[0].id]);

      if (ins.rowCount) {
        await client.query(`
          INSERT INTO activity_events (user_id, kind, text, value, visibility)
          VALUES ($1, 'Achievement', $2, 'Unlocked', 'FRIENDS')
        `, [userId, `Unlocked achievement: ${ach.rows[0].name}`]);
        await client.query(`
          INSERT INTO notifications (user_id, type, message)
          VALUES ($1, 'ACHIEVEMENT', $2)
        `, [userId, `🏆 Achievement Unlocked: ${ach.rows[0].name}`]);
      }
    }
  }
}

export async function finalizeQuestRuntime(client, { userId, questId, status = 'COMPLETED' }) {
  // Lock quest and runtime row
  const qRes = await client.query(`
    SELECT q.*, q.duration_minutes * 60 AS total_seconds
    FROM quests q
    WHERE q.id = $1::uuid AND q.user_id = $2::uuid
    FOR UPDATE
  `, [questId, userId]);
  if (!qRes.rowCount) throw Object.assign(new Error('Quest not found'), { status: 404 });
  const q = qRes.rows[0];

  const rRes = await client.query(`
    SELECT * FROM quest_runtime WHERE quest_id = $1::uuid FOR UPDATE
  `, [questId]);
  const row = rRes.rows[0];

  if (!row) {
    if (['COMPLETED', 'EXPIRED'].includes(q.status)) {
      return { questId, status: questLabel(q.status), activeSeconds: Number(q.elapsed_seconds || 0), xp: 0, coins: 0, alreadyFinalized: true };
    }
    throw Object.assign(new Error('Quest timer has not been started'), { status: 409 });
  }

  if (['COMPLETED', 'EXPIRED', 'STOPPED'].includes(row.state) && row.reward_granted) {
    return { questId, status: questLabel(q.status), activeSeconds: Number(row.active_seconds || 0), xp: 0, coins: 0, alreadyFinalized: true };
  }

  const totalSeconds = Math.max(1, Number(q.total_seconds || 1));
  const activeSeconds = Math.min(totalSeconds, await runtimeActiveSeconds(client, row));
  const ratio = Math.max(0, Math.min(1, activeSeconds / totalSeconds));
  
  // STRICT 100% COMPLETION RULE:
  // A quest is ONLY marked 'COMPLETED' if activeSeconds reaches 100% of totalSeconds!
  // If stopped early or deadline passes with < 100% active presence (e.g. 98%, 99%),
  // it is EXPIRED / STOPPED, NEVER COMPLETED!
  const isFullCompletion = activeSeconds >= totalSeconds;
  const finalStatus = isFullCompletion ? 'COMPLETED' : 'EXPIRED';

  // Proportional reward based strictly on ACTIVE presence
  const xp = isFullCompletion ? Number(q.xp_reward || 0) : Math.max(0, Math.round(Number(q.xp_reward || 0) * ratio));
  const coins = isFullCompletion ? Number(q.coin_reward || 0) : Math.max(0, Math.round(Number(q.coin_reward || 0) * ratio));
  const statReward = isFullCompletion ? Number(q.stat_reward || 0) : Math.max(0, Math.round(Number(q.stat_reward || 0) * ratio));
  const nowIso = new Date().toISOString();

  await client.query(`
    UPDATE quests
    SET status = $1::quest_status, elapsed_seconds = $2::int, progress = $3::numeric, updated_at = now()
    WHERE id = $4::uuid
  `, [finalStatus, activeSeconds, ratio * 100, questId]);

  await client.query(`
    UPDATE quest_runtime
    SET state = $1::varchar, active_seconds = $2::int, active_since = NULL,
        last_heartbeat_at = NULL, completed_at = now(), reward_granted = true, updated_at = now()
    WHERE quest_id = $3::uuid
  `, [finalStatus, activeSeconds, questId]);

  // Update User Profile with earned XP and coins
  const prof = await client.query(`
    SELECT xp, coins, streak, last_active_date FROM user_profiles WHERE user_id = $1::uuid FOR UPDATE
  `, [userId]);
  if (!prof.rowCount) throw Object.assign(new Error('User profile not found'), { status: 404 });

  const currentXp = Number(prof.rows[0]?.xp || 0) + xp;
  const currentCoins = Number(prof.rows[0]?.coins || 0) + coins;
  const currentLevel = levelFromXp(currentXp);

  // Update streak if today is first active completion (only on 100% completion or meaningful progress)
  const todayStr = new Date().toISOString().slice(0, 10);
  let currentStreak = prof.rows[0]?.streak || 0;
  let longestStreak = prof.rows[0]?.longest_streak || 0;
  const lastActive = prof.rows[0]?.last_active_date ? new Date(prof.rows[0].last_active_date).toISOString().slice(0, 10) : null;

  if (isFullCompletion && lastActive !== todayStr) {
    currentStreak += 1;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  await client.query(`
    UPDATE user_profiles
    SET xp = $1::bigint, coins = $2::bigint, level = $3::int,
        streak = $4::int, longest_streak = GREATEST(longest_streak, $4::int),
        last_active_date = CASE WHEN $6::boolean THEN CURRENT_DATE ELSE last_active_date END, updated_at = now()
    WHERE user_id = $5::uuid
  `, [currentXp, currentCoins, currentLevel, currentStreak, userId, isFullCompletion]);

  // Record transactions
  if (xp > 0) {
    await client.query(`
      INSERT INTO xp_transactions(user_id, source_type, source_id, amount, balance_after, metadata)
      VALUES ($1::uuid, 'QUEST', $2::uuid, $3::int, $4::bigint, $5::jsonb)
    `, [userId, questId, xp, currentXp, JSON.stringify({ ratio, activeSeconds, status: finalStatus, isFullCompletion })]);
  }

  if (coins > 0) {
    await client.query(`
      INSERT INTO coin_transactions(user_id, source_type, source_id, amount, balance_after, metadata)
      VALUES ($1::uuid, 'QUEST', $2::uuid, $3::int, $4::bigint, $5::jsonb)
    `, [userId, questId, coins, currentCoins, JSON.stringify({ ratio, activeSeconds, status: finalStatus, isFullCompletion })]);
  }

  if (statReward > 0 && q.stat) {
    const col = String(q.stat).toLowerCase();
    const allowed = ['intelligence', 'strength', 'vitality', 'discipline', 'agility', 'charisma', 'wealth'];
    if (allowed.includes(col)) {
      await client.query(`
        UPDATE user_stats SET ${col} = LEAST(999, ${col} + $1::int), updated_at = now() WHERE user_id = $2::uuid
      `, [statReward, userId]);
    }
  }

  await client.query(`
    INSERT INTO quest_completions(quest_id, user_id, completed_at, elapsed_seconds, xp_awarded, coins_awarded, verification)
    VALUES ($1::uuid, $2::uuid, now(), $3::int, $4::int, $5::int, $6::jsonb)
  `, [questId, userId, activeSeconds, xp, coins, JSON.stringify({ ratio, activeSeconds, status: finalStatus, isFullCompletion, serverValidated: true })]);

  await client.query(`
    INSERT INTO activity_events(user_id, kind, text, value, visibility, reference_id)
    VALUES ($1::uuid, 'Quest', $2, $3, 'FRIENDS', $4::uuid)
  `, [userId, `${finalStatus === 'EXPIRED' ? 'Expired' : 'Completed'} ${q.title}`, `+${xp} XP • +${coins} coins • ${Math.round(ratio * 100)}% active time`, questId]);

  // Check achievements automatically (only full completions qualify for quest completion badges)
  if (isFullCompletion) {
    await checkAndUnlockAchievements(client, userId);
  }

  return {
    questId,
    status: finalStatus === 'EXPIRED' ? 'Expired' : 'Completed',
    activeSeconds,
    xp,
    coins,
    ratio,
    completedAt: nowIso,
    level: currentLevel
  };
}

export async function reconcileQuestRuntimes(userId) {
  await tx(async (client) => {
    const rows = await client.query(`
      SELECT q.id, r.*
      FROM quests q
      JOIN quest_runtime r ON r.quest_id = q.id
      WHERE q.user_id = $1::uuid AND r.state = 'RUNNING' AND r.deadline_at IS NOT NULL AND r.deadline_at <= now()
      FOR UPDATE
    `, [userId]);

    for (const row of rows.rows) {
      await finalizeQuestRuntime(client, { userId, questId: row.id, status: 'EXPIRED' });
    }
  });
}

async function questRuntimeAction(userId, questId, action, payload = {}) {
  return tx(async (client) => {
    const qRes = await client.query(`
      SELECT * FROM quests WHERE id = $1::uuid AND user_id = $2::uuid FOR UPDATE
    `, [questId, userId]);
    if (!qRes.rowCount) throw Object.assign(new Error('Quest not found'), { status: 404 });
    const q = qRes.rows[0];

    const runtimeRes = await client.query(`
      SELECT * FROM quest_runtime WHERE quest_id = $1::uuid FOR UPDATE
    `, [questId]);
    const runtime = runtimeRes.rows[0];

    if (['COMPLETED', 'EXPIRED', 'STOPPED', 'ARCHIVED', 'SKIPPED'].includes(q.status)) {
      throw Object.assign(new Error('Quest is not active'), { status: 409 });
    }

    // A player can have only ONE active running quest at a time.
    if (action === 'start' && (!runtime || runtime.state !== 'RUNNING') && !['PAUSED'].includes(q.status)) {
      const running = await client.query(`
        SELECT q.id, q.title
        FROM quests q
        JOIN quest_runtime r ON r.quest_id = q.id
        WHERE q.user_id = $1::uuid AND r.state = 'RUNNING' AND q.id <> $2::uuid
        LIMIT 1
      `, [userId, questId]);
      if (running.rowCount) {
        throw Object.assign(new Error(`Quest “${running.rows[0].title}” is already running.`), { status: 409 });
      }
    }

    // Once server deadline passed, expire quest
    if (runtime?.state === 'RUNNING' && runtime.deadline_at && new Date(runtime.deadline_at).getTime() <= Date.now()) {
      if (action !== 'heartbeat') return finalizeQuestRuntime(client, { userId, questId, status: 'EXPIRED' });
    }

    if (action === 'start') {
      if (runtime?.state === 'RUNNING') return { status: 'In Progress' };
      if (runtime?.state === 'PAUSED') action = 'resume';
      else {
        await client.query(`
          INSERT INTO quest_runtime (
            quest_id, user_id, state, started_at, deadline_at, active_seconds,
            active_since, last_heartbeat_at, paused_remaining_seconds
          ) VALUES (
            $1::uuid, $2::uuid, 'RUNNING', now(), now() + make_interval(secs => $3::int),
            $4::int, now(), now(), $3::int
          )
          ON CONFLICT(quest_id) DO UPDATE SET
            state = 'RUNNING', started_at = now(), deadline_at = now() + make_interval(secs => $3::int),
            active_seconds = EXCLUDED.active_seconds, active_since = now(), last_heartbeat_at = now(),
            paused_remaining_seconds = EXCLUDED.paused_remaining_seconds, completed_at = NULL,
            reward_granted = false, updated_at = now()
        `, [questId, userId, Math.max(1, q.duration_minutes * 60), Number(q.elapsed_seconds || 0)]);

        await client.query(`UPDATE quests SET status = 'IN_PROGRESS'::quest_status, updated_at = now() WHERE id = $1::uuid`, [questId]);
        const fresh = await client.query('SELECT deadline_at FROM quest_runtime WHERE quest_id = $1::uuid', [questId]);
        return { status: 'In Progress', deadlineAt: fresh.rows[0]?.deadline_at, elapsed: Number(q.elapsed_seconds || 0) };
      }
    }

    if (action === 'pause') {
      if (!runtime || runtime.state !== 'RUNNING') throw Object.assign(new Error('Quest is not running'), { status: 409 });
      const active = await runtimeActiveSeconds(client, runtime);
      const remaining = Math.max(0, Math.round((new Date(runtime.deadline_at).getTime() - Date.now()) / 1000));

      await client.query(`
        UPDATE quest_runtime
        SET state = 'PAUSED', active_seconds = $1::int, active_since = NULL,
            last_heartbeat_at = NULL, deadline_at = NULL, paused_remaining_seconds = $2::int, updated_at = now()
        WHERE quest_id = $3::uuid
      `, [active, remaining, questId]);

      await client.query(`
        UPDATE quests
        SET status = 'PAUSED'::quest_status, elapsed_seconds = $1::int,
            progress = LEAST(100, ($1::numeric / (duration_minutes * 60)) * 100), updated_at = now()
        WHERE id = $2::uuid
      `, [active, questId]);

      return { status: 'Paused', elapsed: active, remainingSeconds: remaining };
    }

    if (action === 'resume') {
      if (!runtime || runtime.state !== 'PAUSED') throw Object.assign(new Error('Quest is not paused'), { status: 409 });
      const remaining = Math.max(1, Number(runtime.paused_remaining_seconds || q.duration_minutes * 60));

      await client.query(`
        UPDATE quest_runtime
        SET state = 'RUNNING', deadline_at = now() + make_interval(secs => $1::int),
            active_since = now(), last_heartbeat_at = now(), updated_at = now()
        WHERE quest_id = $2::uuid
      `, [remaining, questId]);

      await client.query(`UPDATE quests SET status = 'IN_PROGRESS'::quest_status, updated_at = now() WHERE id = $1::uuid`, [questId]);
      const fresh = await client.query('SELECT deadline_at FROM quest_runtime WHERE quest_id = $1::uuid', [questId]);
      return { status: 'In Progress', deadlineAt: fresh.rows[0]?.deadline_at };
    }

    if (action === 'heartbeat') {
      if (!runtime || runtime.state !== 'RUNNING') return { status: questLabel(q.status) };

      const activeNow = Math.min(Number(q.duration_minutes || 0) * 60, await runtimeActiveSeconds(client, runtime));
      if (activeNow >= Math.max(1, Number(q.duration_minutes || 0) * 60)) {
        return finalizeQuestRuntime(client, { userId, questId, status: 'COMPLETED' });
      }
      if (runtime.deadline_at && new Date(runtime.deadline_at).getTime() <= Date.now()) {
        return finalizeQuestRuntime(client, { userId, questId, status: 'EXPIRED' });
      }

      await client.query(`
        UPDATE quest_runtime
        SET active_seconds = $1::int, last_heartbeat_at = now(), updated_at = now()
        WHERE quest_id = $2::uuid
      `, [Math.min(activeNow, q.duration_minutes * 60), questId]);

      await client.query(`
        UPDATE quests
        SET elapsed_seconds = $1::int, progress = LEAST(100, ($1::numeric / (duration_minutes * 60)) * 100), updated_at = now()
        WHERE id = $2::uuid
      `, [Math.min(activeNow, q.duration_minutes * 60), questId]);

      return { status: 'In Progress', elapsed: Math.min(activeNow, q.duration_minutes * 60), deadlineAt: runtime.deadline_at };
    }

    if (action === 'extend') {
      const minutes = Math.max(1, Math.min(120, Number(payload.minutes) || 15));
      const seconds = minutes * 60;
      if (!runtime) throw Object.assign(new Error('Quest has not started'), { status: 409 });

      if (runtime.state === 'RUNNING') {
        await client.query(`
          UPDATE quest_runtime
          SET deadline_at = COALESCE(deadline_at, now()) + make_interval(secs => $1::int),
              extended_seconds = extended_seconds + $1::int, updated_at = now()
          WHERE quest_id = $2::uuid
        `, [seconds, questId]);
      } else if (runtime.state === 'PAUSED') {
        await client.query(`
          UPDATE quest_runtime
          SET paused_remaining_seconds = paused_remaining_seconds + $1::int,
              extended_seconds = extended_seconds + $1::int, updated_at = now()
          WHERE quest_id = $2::uuid
        `, [seconds, questId]);
      } else {
        throw Object.assign(new Error('Quest is no longer active'), { status: 409 });
      }

      await client.query(`
        UPDATE quests
        SET duration_minutes = duration_minutes + $1::int, updated_at = now()
        WHERE id = $2::uuid
      `, [minutes, questId]);

      const fresh = await client.query(`SELECT deadline_at FROM quest_runtime WHERE quest_id = $1::uuid`, [questId]);
      return { status: runtime.state === 'RUNNING' ? 'In Progress' : 'Paused', extendedMinutes: minutes, deadlineAt: fresh.rows[0]?.deadline_at };
    }

    if (action === 'stop') {
      const active = runtime ? await runtimeActiveSeconds(client, runtime) : 0;
      const total = Math.max(1, Number(q.duration_minutes || 1) * 60);
      const isFull = active >= total;
      return finalizeQuestRuntime(client, { userId, questId, status: isFull ? 'COMPLETED' : 'EXPIRED' });
    }

    throw Object.assign(new Error('Unknown runtime action'), { status: 400 });
  });
}

// GET /api/quests
router.get('/', async (req, res) => {
  try {
    await reconcileQuestRuntimes(req.userId);
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
      WHERE q.user_id = $1
      ORDER BY (q.status = 'IN_PROGRESS') DESC, q.created_at DESC
    `, [req.userId])).rows.map(serializeQuestRow);

    return res.json({ quests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/quests
router.post('/', async (req, res) => {
  try {
    const q = normalizeQuestInput(req.body || {});
    const row = (await query(`
      INSERT INTO quests(
        user_id, title, description, category, difficulty, duration_minutes, deadline,
        start_date, recurrence, priority, xp_reward, coin_reward, stat, stat_reward,
        tags, subtasks, target_type, target, reminder, scheduled_time, location, is_private,
        status, progress, elapsed_seconds, archived
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13, $14,
        $15::text[], $16::text[], $17, $18, $19, $20::time, $21, $22,
        'AVAILABLE'::quest_status, 0, 0, false
      )
      RETURNING id, title, description, category, difficulty, duration_minutes as duration,
                deadline, start_date as "startDate", recurrence, priority, xp_reward as xp,
                coin_reward as coins, stat, stat_reward as "statReward", tags, subtasks,
                target_type as "targetType", target, progress, reminder,
                scheduled_time as time, location, is_private as private, status,
                elapsed_seconds as elapsed, archived
    `, [
      req.userId, q.title, q.description, q.category, q.difficulty, q.duration, q.deadline,
      q.startDate, q.recurrence, q.priority, q.xp, q.coins, q.stat, q.statReward,
      q.tags, q.subtasks, q.targetType, q.target, q.reminder, q.time, q.location, q.private
    ])).rows[0];

    await query(`
      INSERT INTO activity_events(user_id, kind, text, value, visibility, reference_id)
      VALUES ($1::uuid, 'Quest', $2, $3, 'PRIVATE', $4::uuid)
    `, [req.userId, `Added a new quest: ${q.title}`, `+${q.xp} XP • +${q.coins} coins`, row.id]);

    return res.status(201).json({ quest: serializeQuestRow(row) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/quests/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = (await query(`
      SELECT * FROM quests WHERE id = $1::uuid AND user_id = $2::uuid
    `, [req.params.id, req.userId])).rows[0];

    if (!existing) return res.status(404).json({ error: 'Quest not found' });
    if (['IN_PROGRESS', 'PAUSED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Pause or stop the quest before editing it' });
    }

    const q = normalizeQuestInput(req.body || {}, existing);
    const row = (await query(`
      UPDATE quests
      SET title = $1, description = $2, category = $3, difficulty = $4, duration_minutes = $5,
          deadline = $6, start_date = $7::date, recurrence = $8, priority = $9, xp_reward = $10,
          coin_reward = $11, stat = $12, stat_reward = $13, tags = $14::text[], subtasks = $15::text[],
          target_type = $16, target = $17, reminder = $18, scheduled_time = $19::time,
          location = $20, is_private = $21, updated_at = now()
      WHERE id = $22::uuid AND user_id = $23::uuid
      RETURNING id, title, description, category, difficulty, duration_minutes as duration,
                deadline, start_date as "startDate", recurrence, priority, xp_reward as xp,
                coin_reward as coins, stat, stat_reward as "statReward", tags, subtasks,
                target_type as "targetType", target, progress, reminder,
                scheduled_time as time, location, is_private as private, status,
                elapsed_seconds as elapsed, archived
    `, [
      q.title, q.description, q.category, q.difficulty, q.duration, q.deadline,
      q.startDate, q.recurrence, q.priority, q.xp, q.coins, q.stat, q.statReward,
      q.tags, q.subtasks, q.targetType, q.target, q.reminder, q.time, q.location,
      q.private, req.params.id, req.userId
    ])).rows[0];

    return res.json({ quest: serializeQuestRow(row) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/quests/:id
router.delete('/:id', async (req, res) => {
  try {
    const del = await query(`DELETE FROM quests WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`, [req.params.id, req.userId]);
    if (!del.rowCount) return res.status(404).json({ error: 'Quest not found' });
    return res.json({ ok: true, id: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Runtime Actions
router.post('/:id/start', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'start'); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/pause', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'pause'); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/resume', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'resume'); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/heartbeat', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'heartbeat'); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/extend', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'extend', req.body || {}); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/stop', async (req, res) => {
  try { const out = await questRuntimeAction(req.userId, req.params.id, 'stop'); res.json(out); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/skip', async (req, res) => {
  try {
    const r = await tx(async (c) => {
      const q = (await c.query(`SELECT * FROM quests WHERE id = $1::uuid AND user_id = $2::uuid FOR UPDATE`, [req.params.id, req.userId])).rows[0];
      if (!q) throw Object.assign(new Error('Quest not found'), { status: 404 });
      if (['IN_PROGRESS', 'PAUSED'].includes(q.status)) throw Object.assign(new Error('Stop or pause before skipping'), { status: 409 });

      const row = (await c.query(`UPDATE quests SET status = 'SKIPPED'::quest_status, updated_at = now() WHERE id = $1::uuid RETURNING title`, [req.params.id])).rows[0];
      await c.query(`INSERT INTO activity_events(user_id, kind, text, value, visibility, reference_id) VALUES($1::uuid, 'Quest', $2, 'Skipped', 'PRIVATE', $3::uuid)`, [req.userId, `Skipped ${row.title}`, req.params.id]);
      return { status: 'Skipped' };
    });
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const row = (await query(`
      UPDATE quests
      SET archived = true, status = 'ARCHIVED'::quest_status, updated_at = now()
      WHERE id = $1::uuid AND user_id = $2::uuid AND status NOT IN ('IN_PROGRESS', 'PAUSED')
      RETURNING id, status
    `, [req.params.id, req.userId])).rows[0];
    if (!row) return res.status(409).json({ error: 'Quest not found or still active' });
    res.json({ status: 'Archived' });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const row = (await query(`
      INSERT INTO quests(
        user_id, title, description, category, difficulty, duration_minutes, deadline,
        start_date, recurrence, priority, xp_reward, coin_reward, stat, stat_reward,
        tags, subtasks, target_type, target, reminder, scheduled_time, location, is_private,
        status, progress, elapsed_seconds, archived
      )
      SELECT user_id, title || ' (Copy)', description, category, difficulty, duration_minutes,
             deadline, start_date, recurrence, priority, xp_reward, coin_reward, stat, stat_reward,
             tags, subtasks, target_type, target, reminder, scheduled_time, location, is_private,
             'AVAILABLE'::quest_status, 0, 0, false
      FROM quests WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id, title
    `, [req.params.id, req.userId])).rows[0];
    if (!row) return res.status(404).json({ error: 'Quest not found' });
    res.status(201).json(row);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

export default router;
