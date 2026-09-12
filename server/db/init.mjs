import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverDir, '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(`DATABASE_URL is missing. Expected ${path.join(serverDir, '.env')}`);
}

const runSqlFile = async (client, label, filename) => {
  const sql = await fs.readFile(path.join(__dirname, filename), 'utf8');
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label} failed`);
    throw error;
  }
};

export async function runMigrations(client) {
  // 1. users
  await client.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS status user_status DEFAULT 'ACTIVE',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
  `);

  // 2. auth_otps
  await client.query(`
    ALTER TABLE auth_otps
      ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10),
      ADD COLUMN IF NOT EXISTS otp_hash TEXT,
      ADD COLUMN IF NOT EXISTS onboarding_token TEXT,
      ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS purpose VARCHAR(40) DEFAULT 'EMAIL_VERIFICATION',
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_auth_otps_email ON auth_otps(email, created_at DESC)`);

  // 3. auth_sessions
  await client.query(`
    ALTER TABLE auth_sessions
      ALTER COLUMN refresh_token_hash DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS session_token TEXT,
      ADD COLUMN IF NOT EXISTS ip_address TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token)`);

  // 4. user_profiles
  await client.query(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS title VARCHAR(100) DEFAULT 'Focused Adventurer',
      ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS xp BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS coins BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS friend_code VARCHAR(32),
      ADD COLUMN IF NOT EXISTS profile_visibility visibility_level DEFAULT 'PUBLIC',
      ADD COLUMN IF NOT EXISTS activity_visibility visibility_level DEFAULT 'FRIENDS',
      ADD COLUMN IF NOT EXISTS leaderboard_visibility visibility_level DEFAULT 'FRIENDS',
      ADD COLUMN IF NOT EXISTS coach_avatar VARCHAR(16) DEFAULT 'female',
      ADD COLUMN IF NOT EXISTS coach_personality VARCHAR(40) DEFAULT 'Sage',
      ADD COLUMN IF NOT EXISTS coach_memory JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS birth_date DATE,
      ADD COLUMN IF NOT EXISTS birth_year INTEGER,
      ADD COLUMN IF NOT EXISTS birth_month INTEGER,
      ADD COLUMN IF NOT EXISTS birth_day INTEGER,
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'male',
      ADD COLUMN IF NOT EXISTS contact_number VARCHAR(30),
      ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
      ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_active_date DATE,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
  `);

  // 5. user_settings
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme VARCHAR(20) NOT NULL DEFAULT 'dark',
      sounds BOOLEAN NOT NULL DEFAULT TRUE,
      animations BOOLEAN NOT NULL DEFAULT TRUE,
      time_format VARCHAR(10) NOT NULL DEFAULT '12h',
      week_start VARCHAR(20) NOT NULL DEFAULT 'Monday',
      difficulty VARCHAR(30) NOT NULL DEFAULT 'Adaptive',
      xp_animation BOOLEAN NOT NULL DEFAULT TRUE,
      quest_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      streak_protection VARCHAR(30) NOT NULL DEFAULT 'Ask first',
      profile_visible BOOLEAN NOT NULL DEFAULT TRUE,
      leaderboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // 6. user_stats
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      intelligence INTEGER NOT NULL DEFAULT 10,
      strength INTEGER NOT NULL DEFAULT 10,
      vitality INTEGER NOT NULL DEFAULT 10,
      discipline INTEGER NOT NULL DEFAULT 10,
      agility INTEGER NOT NULL DEFAULT 10,
      charisma INTEGER NOT NULL DEFAULT 10,
      wealth INTEGER NOT NULL DEFAULT 10,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // 7. quest_runtime
  await client.query(`
    CREATE TABLE IF NOT EXISTS quest_runtime (
      quest_id UUID PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (state IN ('RUNNING','PAUSED','COMPLETED','EXPIRED','STOPPED')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deadline_at TIMESTAMPTZ,
      active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      active_since TIMESTAMPTZ,
      paused_remaining_seconds INTEGER NOT NULL DEFAULT 0 CHECK (paused_remaining_seconds >= 0),
      last_heartbeat_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      extended_seconds INTEGER NOT NULL DEFAULT 0 CHECK (extended_seconds >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE quest_runtime
      ADD COLUMN IF NOT EXISTS user_id UUID,
      ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'RUNNING',
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS active_seconds INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS active_since TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reward_granted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS extended_seconds INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_quest_runtime_user_state ON quest_runtime(user_id,state)`);

  // 8. Remove demo user '00000000-0000-0000-0000-000000000001' and fake seed data
  await client.query(`DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001'`);

  // 9. Ensure reward_redemptions has ON DELETE CASCADE on user_id
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'reward_redemptions_user_id_fkey'
      ) THEN
        ALTER TABLE reward_redemptions DROP CONSTRAINT reward_redemptions_user_id_fkey;
        ALTER TABLE reward_redemptions ADD CONSTRAINT reward_redemptions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

const isDirectRun = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    console.log('✓ Connected to PostgreSQL');
    await client.query('BEGIN');
    await runSqlFile(client, 'Schema', 'schema.sql');
    await runMigrations(client);
    await runSqlFile(client, 'Seed catalog data', 'seed.sql');
    await client.query('COMMIT');
    console.log('✓ LIFE RPG PostgreSQL schema + migrations + catalog initialized successfully.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('\nDatabase initialization failed. No partial changes were committed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
