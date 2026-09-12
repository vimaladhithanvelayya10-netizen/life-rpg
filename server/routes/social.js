import express from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

async function feedFor(userId) {
  return (await query(`
    SELECT p.id, p.user_id, u.display_name as name, p.type, p.content, p.visibility,
           p.created_at, COUNT(r.id)::int as reactions, COUNT(c.id)::int as comments
    FROM social_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN reactions r ON r.post_id = p.id
    LEFT JOIN comments c ON c.post_id = p.id
    WHERE p.visibility = 'PUBLIC'
       OR p.user_id = $1
       OR EXISTS (
         SELECT 1 FROM friendships f
         WHERE f.status = 'ACTIVE'
           AND ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.friend_id = $1 AND f.user_id = p.user_id))
       )
    GROUP BY p.id, u.display_name
    ORDER BY p.created_at DESC
    LIMIT 50
  `, [userId])).rows;
}

// GET /api/social/home
router.get('/home', async (req, res) => {
  try {
    const userId = req.userId;

    const friends = (await query(`
      SELECT u.id, u.display_name as name, p.level, p.xp, p.title, p.friend_code, p.streak
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
      JOIN user_profiles p ON p.user_id = u.id
      WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'ACTIVE'
      ORDER BY p.xp DESC
    `, [userId])).rows;

    const requests = (await query(`
      SELECT fr.id, fr.status, fr.created_at, fr.sender_id, fr.receiver_id,
             CASE WHEN fr.receiver_id = $1 THEN true ELSE false END AS is_incoming,
             u.id as user_id, u.display_name as name, p.level, p.xp
      FROM friend_requests fr
      JOIN users u ON u.id = CASE WHEN fr.sender_id = $1 THEN fr.receiver_id ELSE fr.sender_id END
      JOIN user_profiles p ON p.user_id = u.id
      WHERE (fr.sender_id = $1 OR fr.receiver_id = $1) AND fr.status = 'PENDING'
      ORDER BY fr.created_at DESC
    `, [userId])).rows;

    const feed = await feedFor(userId);

    // Global Leaderboard — Real database values strictly from users and user_profiles
    const leaderboard = (await query(`
      SELECT u.id, u.display_name as name, p.level, p.xp, p.streak, p.title
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN user_settings st ON st.user_id = u.id
      WHERE (st.leaderboard_visible IS NULL OR st.leaderboard_visible = TRUE)
        AND p.leaderboard_visibility <> 'PRIVATE'
        AND u.status = 'ACTIVE'
      ORDER BY p.xp DESC
      LIMIT 50
    `)).rows;

    const challenges = (await query(`
      SELECT c.id, c.title, c.description, c.type, c.start_date, c.end_date, c.status,
             c.reward, COUNT(cm.user_id)::int as participants, COALESCE(MAX(cm.score), 0)::int as top_score
      FROM challenges c
      LEFT JOIN challenge_members cm ON cm.challenge_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 30
    `)).rows;

    const notifications = (await query(`
      SELECT id, type, message, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId])).rows;

    res.json({ friends, requests, feed, leaderboard, challenges, notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = (await query(`
      SELECT u.id, u.display_name as name, p.level, p.xp, p.streak, p.title
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN user_settings st ON st.user_id = u.id
      WHERE (st.leaderboard_visible IS NULL OR st.leaderboard_visible = TRUE)
        AND p.leaderboard_visibility <> 'PRIVATE'
        AND u.status = 'ACTIVE'
      ORDER BY p.xp DESC
      LIMIT 100
    `)).rows;

    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/search
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ people: [], challenges: [], groups: [] });
    const like = `%${q}%`;

    const people = (await query(`
      SELECT u.id, u.username, u.display_name as name, p.level, p.xp, p.friend_code, p.title
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id <> $1 AND u.status = 'ACTIVE'
        AND (u.username ILIKE $2 OR u.display_name ILIKE $2 OR p.friend_code ILIKE $2)
      ORDER BY p.xp DESC
      LIMIT 20
    `, [req.userId, like])).rows;

    const challenges = (await query(`
      SELECT id, title, description, type, status
      FROM challenges
      WHERE title ILIKE $1 OR description ILIKE $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [like])).rows;

    const groups = (await query(`
      SELECT id, name, description, level, xp
      FROM groups_guilds
      WHERE name ILIKE $1 OR description ILIKE $1
      LIMIT 10
    `, [like])).rows;

    res.json({ people, challenges, groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/friends/request
router.post('/friends/request', async (req, res) => {
  const receiverId = req.body.receiverId;
  if (!receiverId || receiverId === req.userId) {
    return res.status(400).json({ error: 'Invalid receiver' });
  }

  try {
    const result = await tx(async (c) => {
      const blocked = await c.query(`
        SELECT 1 FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
      `, [req.userId, receiverId]);
      if (blocked.rowCount) throw Object.assign(new Error('Cannot send friend request: User is blocked'), { status: 409 });

      const existing = await c.query(`
        SELECT id, status FROM friend_requests
        WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
        ORDER BY created_at DESC LIMIT 1
      `, [req.userId, receiverId]);
      if (existing.rowCount && existing.rows[0].status === 'PENDING') {
        throw Object.assign(new Error('Friend request is already pending'), { status: 409 });
      }

      const friendship = await c.query(`
        SELECT 1 FROM friendships
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
      `, [req.userId, receiverId]);
      if (friendship.rowCount) throw Object.assign(new Error('Already friends'), { status: 409 });

      const inserted = await c.query(`
        INSERT INTO friend_requests(sender_id, receiver_id, status)
        VALUES ($1, $2, 'PENDING') RETURNING *
      `, [req.userId, receiverId]);

      await c.query(`
        INSERT INTO notifications(user_id, type, actor_id, reference_id, message)
        VALUES ($1, 'FRIEND_REQUEST', $2, $3, $4)
      `, [receiverId, req.userId, inserted.rows[0].id, 'New friend request received']);

      return inserted.rows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/social/friends/respond
router.post('/friends/respond', async (req, res) => {
  const { requestId, action } = req.body || {};
  if (!['accept', 'decline', 'cancel'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Expected accept, decline, or cancel.' });
  }

  try {
    const out = await tx(async (c) => {
      const r = await c.query(`SELECT * FROM friend_requests WHERE id = $1 FOR UPDATE`, [requestId]);
      if (!r.rowCount) throw Object.assign(new Error('Request not found'), { status: 404 });
      const row = r.rows[0];

      if (action === 'cancel' && row.sender_id !== req.userId) {
        throw Object.assign(new Error('Only the sender can cancel a request'), { status: 403 });
      }
      if (action !== 'cancel' && row.receiver_id !== req.userId) {
        throw Object.assign(new Error('Only the recipient can respond to this request'), { status: 403 });
      }

      const status = action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : 'CANCELLED';
      await c.query(`UPDATE friend_requests SET status = $1, responded_at = now() WHERE id = $2`, [status, requestId]);

      if (status === 'ACCEPTED') {
        await c.query(`
          INSERT INTO friendships(user_id, friend_id)
          VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [row.sender_id, row.receiver_id]);

        await c.query(`
          INSERT INTO notifications(user_id, type, actor_id, reference_id, message)
          VALUES ($1, 'SYSTEM', $2, $3, $4)
        `, [row.sender_id, req.userId, requestId, 'Your friend request was accepted']);

        await c.query(`
          INSERT INTO social_posts(user_id, type, content, visibility, reference_id)
          VALUES ($1, 'FRIENDSHIP', $2, 'FRIENDS', $3)
        `, [req.userId, 'Made a new friend in LIFE RPG', requestId]);
      }

      return { status };
    });

    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/social/block
router.post('/block', async (req, res) => {
  const target = req.body.userId;
  if (!target || target === req.userId) return res.status(400).json({ error: 'Invalid user' });

  await tx(async (c) => {
    await c.query(`INSERT INTO blocks(blocker_id, blocked_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [req.userId, target]);
    await c.query(`
      UPDATE friend_requests SET status = 'CANCELLED', responded_at = now()
      WHERE status = 'PENDING' AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
    `, [req.userId, target]);
    await c.query(`
      DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
    `, [req.userId, target]);
  });

  res.json({ ok: true });
});

// POST /api/social/report
router.post('/report', async (req, res) => {
  const { reportedUserId, reason, description, evidence } = req.body || {};
  const r = await query(`
    INSERT INTO reports(reporter_id, reported_user_id, reason, description, evidence)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at
  `, [req.userId, reportedUserId || null, reason, description || '', evidence || {}]);
  res.status(201).json(r.rows[0]);
});

// POST /api/social/react
router.post('/react', async (req, res) => {
  const { postId, reactionType } = req.body || {};
  await query(`
    INSERT INTO reactions(user_id, post_id, reaction_type)
    VALUES ($1, $2, $3)
    ON CONFLICT(user_id, post_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type
  `, [req.userId, postId, reactionType]);
  res.json({ ok: true });
});

// POST /api/social/comment
router.post('/comment', async (req, res) => {
  const { postId, content, parentId } = req.body || {};
  if (!content?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const r = await query(`
    INSERT INTO comments(post_id, user_id, content, parent_id)
    VALUES ($1, $2, $3, $4) RETURNING id, content, created_at
  `, [postId, req.userId, content.trim(), parentId || null]);
  res.status(201).json(r.rows[0]);
});

// POST /api/social/nudge
router.post('/nudge', async (req, res) => {
  const { receiverId, message = '🔥 Keep going!' } = req.body || {};
  const allowed = await query(`
    SELECT 1 FROM friendships
    WHERE status = 'ACTIVE' AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
  `, [req.userId, receiverId]);

  if (!allowed.rowCount) return res.status(403).json({ error: 'You can only nudge friends' });

  await query(`
    INSERT INTO nudges(sender_id, receiver_id, message) VALUES($1, $2, $3)
  `, [req.userId, receiverId, message]);

  await query(`
    INSERT INTO notifications(user_id, type, actor_id, message)
    VALUES ($1, 'NUDGE', $2, $3)
  `, [receiverId, req.userId, message]);

  res.json({ ok: true });
});

// POST /api/social/challenges
router.post('/challenges', async (req, res) => {
  const { title, description, type = 'CUSTOM', days = 7, reward = {} } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const r = await tx(async (c) => {
    const ch = await c.query(`
      INSERT INTO challenges(creator_id, title, description, type, start_date, end_date, reward, status)
      VALUES ($1, $2, $3, $4, now(), now() + make_interval(days => $5::int), $6, 'ACTIVE')
      RETURNING *
    `, [req.userId, title.trim(), description || '', type, Math.max(1, Number(days)), reward]);

    await c.query(`
      INSERT INTO challenge_members(challenge_id, user_id, status)
      VALUES ($1, $2, 'ACCEPTED')
    `, [ch.rows[0].id, req.userId]);

    return ch.rows[0];
  });

  res.status(201).json(r);
});

// POST /api/social/challenges/:id/join
router.post('/challenges/:id/join', async (req, res) => {
  const id = req.params.id;
  await query(`
    INSERT INTO challenge_members(challenge_id, user_id, status)
    VALUES ($1, $2, 'ACCEPTED') ON CONFLICT DO NOTHING
  `, [id, req.userId]);
  res.json({ ok: true });
});

// POST /api/social/shared-goals
router.post('/shared-goals', async (req, res) => {
  const { title, target, unit = 'units', reward = {} } = req.body || {};
  const r = await tx(async (c) => {
    const g = await c.query(`
      INSERT INTO shared_goals(creator_id, title, target, unit, reward)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [req.userId, title, target, unit, reward]);

    await c.query(`
      INSERT INTO shared_goal_members(shared_goal_id, user_id)
      VALUES ($1, $2)
    `, [g.rows[0].id, req.userId]);

    return g.rows[0];
  });
  res.status(201).json(r);
});

// GET /api/social/guilds
router.get('/guilds', async (_req, res) => {
  const r = await query(`
    SELECT id, name, description, visibility, level, xp
    FROM groups_guilds ORDER BY xp DESC LIMIT 50
  `);
  res.json(r.rows);
});

// POST /api/social/guilds
router.post('/guilds', async (req, res) => {
  const { name, description, visibility = 'PUBLIC' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const r = await tx(async (c) => {
    const g = await c.query(`
      INSERT INTO groups_guilds(owner_id, name, description, visibility)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.userId, name.trim(), description || '', visibility]);

    await c.query(`
      INSERT INTO group_members(group_id, user_id, role)
      VALUES ($1, $2, 'OWNER')
    `, [g.rows[0].id, req.userId]);

    return g.rows[0];
  });
  res.status(201).json(r);
});

// GET /api/social/messages/:friendId
router.get('/messages/:friendId', async (req, res) => {
  const r = await query(`
    SELECT id, sender_id, receiver_id, content, created_at, read_at
    FROM direct_messages
    WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
    ORDER BY created_at DESC LIMIT 100
  `, [req.userId, req.params.friendId]);
  res.json(r.rows.reverse());
});

// POST /api/social/messages
router.post('/messages', async (req, res) => {
  const { receiverId, content } = req.body || {};
  const allowed = await query(`
    SELECT 1 FROM friendships
    WHERE status = 'ACTIVE' AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
  `, [req.userId, receiverId]);

  if (!allowed.rowCount) return res.status(403).json({ error: 'Messaging requires active friendship' });

  const r = await query(`
    INSERT INTO direct_messages(sender_id, receiver_id, content)
    VALUES ($1, $2, $3) RETURNING *
  `, [req.userId, receiverId, content]);

  await query(`
    INSERT INTO notifications(user_id, type, actor_id, reference_id, message)
    VALUES ($1, 'MESSAGE', $2, $3, $4)
  `, [receiverId, req.userId, r.rows[0].id, 'New message received']);

  res.status(201).json(r.rows[0]);
});

export default router;
