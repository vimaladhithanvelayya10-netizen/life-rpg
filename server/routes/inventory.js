import express from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/inventory
router.get('/inventory', async (req, res) => {
  try {
    let items = (await query(`
      SELECT i.id, i.name, i.category as type, i.rarity, i.description as desc,
             COALESCE(ui.quantity, 0) as qty, COALESCE(ui.equipped, false) as equipped,
             i.effect, i.duration, ui.source, ui.expires_at as expires, i.code
      FROM user_inventory ui
      JOIN inventory_items i ON i.id = ui.item_id
      WHERE ui.user_id = $1 AND ui.quantity > 0
      ORDER BY i.name
    `, [req.userId])).rows;

    // If user has 0 items (e.g. existing user or initial registration without starter pack), grant starter items safely
    if (items.length === 0) {
      const starterItems = (await query(`
        SELECT id, code FROM inventory_items
        WHERE code IN ('xp-boost', 'focus-potion', 'streak-shield')
      `)).rows;

      for (const st of starterItems) {
        await query(`
          INSERT INTO user_inventory (user_id, item_id, quantity, source)
          VALUES ($1::uuid, $2::uuid, 1, 'STARTER_PACK')
          ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = GREATEST(user_inventory.quantity, 1)
        `, [req.userId, st.id]);
      }

      items = (await query(`
        SELECT i.id, i.name, i.category as type, i.rarity, i.description as desc,
               COALESCE(ui.quantity, 0) as qty, COALESCE(ui.equipped, false) as equipped,
               i.effect, i.duration, ui.source, ui.expires_at as expires, i.code
        FROM user_inventory ui
        JOIN inventory_items i ON i.id = ui.item_id
        WHERE ui.user_id = $1 AND ui.quantity > 0
        ORDER BY i.name
      `, [req.userId])).rows;
    }

    res.json({ inventory: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id (Inspect item)
router.get('/inventory/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    const invRes = await query(`
      SELECT i.id, i.name, i.category as type, i.rarity, i.description as desc,
             COALESCE(ui.quantity, 0) as qty, COALESCE(ui.equipped, false) as equipped,
             i.effect, i.duration, ui.source, ui.expires_at as expires, i.code
      FROM user_inventory ui
      JOIN inventory_items i ON i.id = ui.item_id
      WHERE (ui.item_id = $1::uuid OR i.id = $1::uuid) AND ui.user_id = $2::uuid
    `, [itemId, req.userId]);

    if (!invRes.rowCount) {
      return res.status(404).json({ error: 'Item not found in inventory' });
    }

    res.json({ item: invRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/use
router.post('/inventory/:id/use', async (req, res) => {
  try {
    const itemId = req.params.id;
    const result = await tx(async (client) => {
      // Find inventory entry (can match by item_id or inventory_items.id)
      const invRes = await client.query(`
        SELECT ui.*, i.name, i.code, i.effect, i.category
        FROM user_inventory ui
        JOIN inventory_items i ON i.id = ui.item_id
        WHERE (ui.item_id = $1::uuid OR i.id = $1::uuid) AND ui.user_id = $2::uuid
        FOR UPDATE
      `, [itemId, req.userId]);

      if (!invRes.rowCount || invRes.rows[0].quantity <= 0) {
        throw Object.assign(new Error('Item not in your inventory or quantity is 0.'), { status: 400 });
      }

      const row = invRes.rows[0];
      const newQty = row.quantity - 1;

      if (newQty > 0) {
        await client.query(`
          UPDATE user_inventory SET quantity = $1::int, updated_at = now()
          WHERE user_id = $2::uuid AND item_id = $3::uuid
        `, [newQty, req.userId, row.item_id]);
      } else {
        await client.query(`
          UPDATE user_inventory SET quantity = 0, equipped = false, updated_at = now()
          WHERE user_id = $1::uuid AND item_id = $2::uuid
        `, [req.userId, row.item_id]);
      }

      // Log transaction
      await client.query(`
        INSERT INTO inventory_transactions(user_id, item_id, delta, reason)
        VALUES ($1::uuid, $2::uuid, -1, 'USED_BY_PLAYER')
      `, [req.userId, row.item_id]);

      // Record activity
      await client.query(`
        INSERT INTO activity_events(user_id, kind, text, value, visibility)
        VALUES ($1::uuid, 'Item', $2, 'Used', 'PRIVATE')
      `, [req.userId, `Used ${row.name}`]);

      return {
        item: { id: row.item_id, name: row.name, qty: newQty },
        message: `Used ${row.name}. ${row.effect || ''}`
      };
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/discard
router.post('/inventory/:id/discard', async (req, res) => {
  try {
    const itemId = req.params.id;
    const count = Math.max(1, Math.min(999, Number(req.body?.count || 1)));

    const result = await tx(async (client) => {
      const invRes = await client.query(`
        SELECT ui.*, i.name
        FROM user_inventory ui
        JOIN inventory_items i ON i.id = ui.item_id
        WHERE (ui.item_id = $1::uuid OR i.id = $1::uuid) AND ui.user_id = $2::uuid
        FOR UPDATE
      `, [itemId, req.userId]);

      if (!invRes.rowCount || invRes.rows[0].quantity <= 0) {
        throw Object.assign(new Error('Item not in your inventory.'), { status: 400 });
      }

      const row = invRes.rows[0];
      const discardQty = Math.min(count, row.quantity);
      const newQty = row.quantity - discardQty;

      if (newQty > 0) {
        await client.query(`
          UPDATE user_inventory SET quantity = $1::int, updated_at = now()
          WHERE user_id = $2::uuid AND item_id = $3::uuid
        `, [newQty, req.userId, row.item_id]);
      } else {
        await client.query(`
          UPDATE user_inventory SET quantity = 0, equipped = false, updated_at = now()
          WHERE user_id = $1::uuid AND item_id = $2::uuid
        `, [req.userId, row.item_id]);
      }

      // Log transaction
      await client.query(`
        INSERT INTO inventory_transactions(user_id, item_id, delta, reason)
        VALUES ($1::uuid, $2::uuid, $3::int, 'DISCARDED_BY_PLAYER')
      `, [req.userId, row.item_id, -discardQty]);

      // Record activity
      await client.query(`
        INSERT INTO activity_events(user_id, kind, text, value, visibility)
        VALUES ($1::uuid, 'Item', $2, 'Discarded', 'PRIVATE')
      `, [req.userId, `Discarded ${discardQty}x ${row.name}`]);

      return {
        item: { id: row.item_id, name: row.name, qty: newQty },
        discarded: discardQty,
        message: `Discarded ${discardQty}x ${row.name}.`
      };
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/equip
router.post('/inventory/:id/equip', async (req, res) => {
  try {
    const itemId = req.params.id;
    const invRes = await query(`
      UPDATE user_inventory
      SET equipped = NOT equipped, updated_at = now()
      WHERE (item_id = $1::uuid OR item_id IN (SELECT id FROM inventory_items WHERE id = $1::uuid))
        AND user_id = $2::uuid AND quantity > 0
      RETURNING equipped, item_id
    `, [itemId, req.userId]);

    if (!invRes.rowCount) {
      return res.status(404).json({ error: 'Item not found in inventory' });
    }

    res.json({ equipped: invRes.rows[0].equipped, itemId: invRes.rows[0].item_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shop
router.get('/shop', async (req, res) => {
  try {
    const rewards = (await query(`
      SELECT id, name, cost, category, description as desc, owner_id
      FROM rewards
      WHERE is_active = true AND (owner_id = $1 OR owner_id IS NULL)
      ORDER BY cost
    `, [req.userId])).rows;

    res.json({ rewards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop (create custom reward)
router.post('/shop', async (req, res) => {
  try {
    const { name, cost, category, description } = req.body || {};
    if (!name || !cost) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const row = (await query(`
      INSERT INTO rewards (owner_id, name, cost, category, description, is_active)
      VALUES ($1::uuid, $2, $3::int, $4, $5, true)
      RETURNING id, name, cost, category, description as desc
    `, [req.userId, String(name).trim(), Math.max(1, Number(cost)), category || 'Custom rewards', description || 'Custom reward'])).rows[0];

    res.status(201).json({ reward: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/:id/purchase
router.post('/shop/:id/purchase', async (req, res) => {
  try {
    const rewardId = req.params.id;
    const result = await tx(async (client) => {
      // 1. Get reward
      const rRes = await client.query(`
        SELECT * FROM rewards
        WHERE id = $1::uuid AND is_active = true AND (owner_id = $2::uuid OR owner_id IS NULL)
      `, [rewardId, req.userId]);

      if (!rRes.rowCount) throw Object.assign(new Error('Reward not found or unavailable'), { status: 404 });
      const reward = rRes.rows[0];

      // 2. Lock user profile and check coins
      const prof = await client.query(`
        SELECT coins FROM user_profiles WHERE user_id = $1::uuid FOR UPDATE
      `, [req.userId]);

      const currentCoins = Number(prof.rows[0]?.coins || 0);
      if (currentCoins < reward.cost) {
        throw Object.assign(new Error(`Not enough coins. Need ${reward.cost - currentCoins} more coins.`), { status: 400 });
      }

      const newCoins = currentCoins - reward.cost;

      // 3. Deduct coins
      await client.query(`
        UPDATE user_profiles SET coins = $1, updated_at = now() WHERE user_id = $2::uuid
      `, [newCoins, req.userId]);

      // 4. Record coin transaction
      await client.query(`
        INSERT INTO coin_transactions (user_id, source_type, source_id, amount, balance_after, metadata)
        VALUES ($1::uuid, 'SHOP_PURCHASE', $2::uuid, $3::int, $4::bigint, $5::jsonb)
      `, [req.userId, reward.id, -reward.cost, newCoins, JSON.stringify({ rewardName: reward.name })]);

      // 5. Record redemption
      await client.query(`
        INSERT INTO reward_redemptions (reward_id, user_id, cost)
        VALUES ($1::uuid, $2::uuid, $3::int)
      `, [reward.id, req.userId, reward.cost]);

      // 6. If matching item in inventory_items by name/code, add to inventory
      const matchingItem = await client.query(`
        SELECT id FROM inventory_items
        WHERE LOWER(name) = LOWER($1) OR code = LOWER(REPLACE($1, ' ', '-'))
        LIMIT 1
      `, [reward.name]);

      if (matchingItem.rowCount) {
        const invItemId = matchingItem.rows[0].id;
        await client.query(`
          INSERT INTO user_inventory(user_id, item_id, quantity, source)
          VALUES ($1::uuid, $2::uuid, 1, 'SHOP_PURCHASE')
          ON CONFLICT(user_id, item_id) DO UPDATE
          SET quantity = user_inventory.quantity + 1, updated_at = now()
        `, [req.userId, invItemId]);

        await client.query(`
          INSERT INTO inventory_transactions(user_id, item_id, delta, reason)
          VALUES ($1::uuid, $2::uuid, 1, 'SHOP_PURCHASE')
        `, [req.userId, invItemId]);
      }

      // 7. Activity event
      await client.query(`
        INSERT INTO activity_events(user_id, kind, text, value, visibility)
        VALUES ($1::uuid, 'Coins', $2, $3, 'PRIVATE')
      `, [req.userId, `Redeemed ${reward.name}`, `-${reward.cost} coins`]);

      return {
        message: `Successfully purchased ${reward.name}!`,
        coinsRemaining: newCoins,
        reward: { id: reward.id, name: reward.name, cost: reward.cost }
      };
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Alias: POST /api/rewards/:id/redeem
router.post('/rewards/:id/redeem', async (req, res) => {
  req.url = `/shop/${req.params.id}/purchase`;
  router.handle(req, res);
});

export default router;
