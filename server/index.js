import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from './db.js';
import { runMigrations } from './db/init.mjs';

import authRoutes from './routes/auth.js';
import questRoutes from './routes/quests.js';
import inventoryRoutes from './routes/inventory.js';
import socialRoutes from './routes/social.js';
import stateRoutes from './routes/state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Static files (uploads, public auth pages, assets, and dist production build)
const publicDir = path.resolve(__dirname, '..', 'public');
const distDir = path.resolve(__dirname, '..', 'dist');

app.use('/uploads', express.static(path.join(publicDir, 'uploads')));
app.use(express.static(publicDir));
app.use(express.static(distDir));

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'postgresql', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// Mount modular API routers
app.use('/api/auth', authRoutes);
app.use('/api/quests', questRoutes);
app.use('/api', inventoryRoutes);
app.use('/api/social', socialRoutes);
app.use('/api', stateRoutes);

// SPA fallback for HTML navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api')) {
    const indexPath = path.join(distDir, 'index.html');
    return res.sendFile(indexPath, (err) => {
      if (err) next();
    });
  }
  next();
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Startup sequence
async function startServer() {
  try {
    const client = await pool.connect();
    try {
      console.log('Verifying and applying database migrations...');
      await runMigrations(client);
      console.log('✓ Database migrations verified.');
    } finally {
      client.release();
    }

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`LIFE RPG Backend API listening on port ${port}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received: closing HTTP server gracefully...`);
      server.close(() => {
        console.log('HTTP server closed.');
        pool.end().catch(() => {}).finally(() => {
          process.exit(0);
        });
      });
      setTimeout(() => {
        console.warn('Forced shutdown after timeout.');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

export default app;
