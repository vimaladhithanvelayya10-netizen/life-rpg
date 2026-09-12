import crypto from 'node:crypto';
import { query } from '../db.js';

const appSecret = process.env.JWT_SECRET || 'life-rpg-production-secret-key-2026';

export const hashPassword = (value, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`;

export const verifyPassword = (value, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const incoming = crypto.scryptSync(value, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(incoming, 'hex'));
};

export const createToken = (user) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    jti: crypto.randomUUID(),
    sub: user.id,
    email: user.email,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', appSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

export const verifyToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', appSecret).update(`${header}.${payload}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
};

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  try {
    // Check if this specific session token has been revoked
    const sessionRes = await query(`
      SELECT revoked_at FROM auth_sessions
      WHERE session_token = $1 AND revoked_at IS NOT NULL
      LIMIT 1
    `, [token]);

    if (sessionRes.rowCount && sessionRes.rows[0].revoked_at) {
      return res.status(401).json({ error: 'Session has been logged out. Please log in again.' });
    }

    const userRes = await query(`
      SELECT u.id, u.username, u.display_name, u.email, u.status
      FROM users u
      WHERE u.id = $1::uuid AND u.status = 'ACTIVE'
    `, [payload.sub]);

    if (!userRes.rowCount) {
      return res.status(401).json({ error: 'User account not found or suspended.' });
    }

    req.userId = userRes.rows[0].id;
    req.user = userRes.rows[0];
    next();
  } catch (err) {
    console.error('requireAuth database error:', err);
    return res.status(500).json({ error: 'Internal authentication error.' });
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload || !payload.sub) return next();

  try {
    const userRes = await query(`
      SELECT u.id, u.username, u.display_name, u.email, u.status
      FROM users u
      WHERE u.id = $1::uuid AND u.status = 'ACTIVE'
    `, [payload.sub]);

    if (userRes.rowCount) {
      req.userId = userRes.rows[0].id;
      req.user = userRes.rows[0];
    }
  } catch {}
  next();
};
