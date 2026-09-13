import { promises as dnsPromises } from "node:dns";

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { query, tx } from "../db.js";
import {
  hashPassword,
  verifyPassword,
  createToken,
  requireAuth,
} from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const publicDir = path.resolve(serverDir, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");

const router = express.Router();

const otpTtlMs = 10 * 60 * 1000; // 10 minutes
const otpResendMs = 30 * 1000; // 30 seconds
const maxOtpAttempts = 5;

let mailTransporter = null;
let mailConfigError = null;

const getMailTransporter = async () => {
  if (mailTransporter || mailConfigError) return mailTransporter;

  const user = String(
    process.env.SMTP_USER || process.env.GMAIL_USER || "",
  ).trim();

  const pass = String(
    process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "",
  ).replace(/\s+/g, "");

  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();

  const port = Number(process.env.SMTP_PORT || 465);

  const secure =
    String(process.env.SMTP_SECURE ?? port === 465).toLowerCase() === "true";

  if (!user || !pass) {
    mailConfigError =
      "SMTP credentials not configured. Using development OTP fallback.";
    return null;
  }

  try {
    // Resolve only IPv4 addresses so Railway does not attempt
    // to connect to Gmail over unreachable IPv6.
    const ipv4Addresses = await dnsPromises.resolve4(host);
    const ipv4Host = ipv4Addresses[0];

    if (!ipv4Host) {
      throw new Error(`No IPv4 address found for SMTP host ${host}`);
    }

    mailTransporter = nodemailer.createTransport({
      host: ipv4Host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        servername: host,
        minVersion: "TLSv1.2",
      },
    });

    return mailTransporter;
  } catch (err) {
    mailConfigError = err.message;
    console.error("SMTP transporter setup failed:", err.message);
    return null;
  }
};

const sendOtpEmail = async (email, otp) => {
  const transporter = await getMailTransporter();
  if (!transporter) return false;

  const user = String(
    process.env.SMTP_USER || process.env.GMAIL_USER || "",
  ).trim();

  const from = String(process.env.MAIL_FROM || `LIFE RPG <${user}>`).trim();

  const html = `
    <div style="margin:0;background:#0b1018;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#ffffff">
      <div style="max-width:560px;margin:0 auto;background:#121a26;border:1px solid #2a3648;border-radius:20px;padding:32px">
        <div style="font-size:12px;font-weight:800;letter-spacing:3px;color:#ffd777;text-transform:uppercase">LIFE RPG</div>
        <h1 style="font-size:30px;line-height:1.2;margin:16px 0 8px;color:#ffffff">Verify your email.</h1>
        <p style="font-size:15px;line-height:1.6;color:#cbd4e3;margin:0 0 22px">Use the verification code below to continue creating your LIFE RPG account.</p>

        <div style="background:#1b2534;border:1px solid #344258;border-radius:16px;padding:20px;text-align:center">
          <div style="font-size:12px;letter-spacing:2px;color:#9eacc2;text-transform:uppercase;margin-bottom:8px">Your code</div>
          <div style="font-size:42px;letter-spacing:12px;font-weight:900;color:#ffd777;padding-left:12px">${otp}</div>
        </div>

        <p style="font-size:13px;line-height:1.6;color:#9eacc2;margin:20px 0 0">
          This code expires in 10 minutes. If you did not request this email, you can ignore it.
        </p>
      </div>
    </div>`;

  await transporter.sendMail({
    from,
    to: email,
    replyTo: user,
    subject: `${otp} — Your LIFE RPG verification code`,
    text: `Your LIFE RPG verification code is ${otp}. It expires in 10 minutes.`,
    html,
  });

  return true;
};
// POST /api/auth/send-otp
router.post("/send-otp", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    // Check if email already registered
    const existing = await query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [email],
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in.",
      });
    }

    // Check resend cooldown
    const recent = await query(
      `
      SELECT created_at FROM auth_otps
      WHERE LOWER(email) = $1
      ORDER BY created_at DESC LIMIT 1
    `,
      [email],
    );

    if (recent.rowCount > 0) {
      const lastSent = new Date(recent.rows[0].created_at).getTime();
      const elapsed = Date.now() - lastSent;
      if (elapsed < otpResendMs) {
        const wait = Math.ceil((otpResendMs - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${wait} seconds before requesting another code.`,
        });
      }
    }

    const otp = String(crypto.randomInt(1000, 10000));
    const expiresAt = new Date(Date.now() + otpTtlMs);

    await query(
      `
      INSERT INTO auth_otps (email, otp_code, otp_hash, purpose, expires_at, attempts, verified)
      VALUES ($1, $2, $3, 'EMAIL_VERIFICATION', $4, 0, false)
    `,
      [email, otp, otp, expiresAt],
    );

    let sent = false;
    try {
      sent = await sendOtpEmail(email, otp);
    } catch (mailErr) {
      console.error("Failed to send SMTP email:", mailErr.message);
    }

    if (!sent) {
      return res.status(502).json({
        error:
          "Unable to send verification email. Please check your address or try again later.",
      });
    }

    return res
      .status(200)
      .json({ message: "Verification code sent to your email." });
  } catch (err) {
    console.error("Error in send-otp:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate verification code." });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required." });
    }

    const recordRes = await query(
      `
      SELECT * FROM auth_otps
      WHERE LOWER(email) = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `,
      [email],
    );

    if (!recordRes.rowCount) {
      return res
        .status(400)
        .json({ error: "No verification code was requested for this email." });
    }

    const record = recordRes.rows[0];

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res
        .status(400)
        .json({ error: "That code has expired. Request a new code." });
    }

    if (record.attempts >= maxOtpAttempts) {
      return res
        .status(429)
        .json({ error: "Too many incorrect attempts. Request a new code." });
    }

    if (!/^\d{4}$/.test(otp) || otp !== record.otp_code) {
      await query(
        `UPDATE auth_otps SET attempts = attempts + 1 WHERE id = $1`,
        [record.id],
      );
      const remaining = Math.max(0, maxOtpAttempts - (record.attempts + 1));
      return res.status(400).json({
        error: `Invalid verification code. ${remaining} attempts remaining.`,
      });
    }

    const onboardingToken = crypto.randomBytes(32).toString("hex");
    await query(
      `
      UPDATE auth_otps
      SET verified = true, onboarding_token = $1
      WHERE id = $2
    `,
      [onboardingToken, record.id],
    );

    return res.status(200).json({
      message: "Email verified.",
      onboardingToken,
    });
  } catch (err) {
    console.error("Error in verify-otp:", err);
    return res.status(500).json({ error: "Failed to verify code." });
  }
});

// Helper for generating unique username: 4 letters of name + DD + MM (+ optional numerical suffix)
async function generateUniqueUsername(client, cleanName, birthDay, birthMonth) {
  const normalizedLetters = cleanName.toLowerCase().replace(/[^a-z]/g, "");
  const prefix = normalizedLetters.slice(0, 4).padEnd(4, "x");
  const dd = String(birthDay).padStart(2, "0");
  const mm = String(birthMonth).padStart(2, "0");
  const baseUsername = `${prefix}${dd}${mm}`;

  let candidate = baseUsername;
  let suffix = 2;

  while (true) {
    const res = await client.query(
      `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`,
      [candidate],
    );
    if (res.rowCount === 0) return candidate;
    candidate = `${baseUsername}${suffix}`;
    suffix += 1;
  }
}

// Generate unique friend code: LRPG-XXXX-XXXX
async function generateUniqueFriendCode(client) {
  while (true) {
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const code = `LRPG-${part1}-${part2}`;
    const res = await client.query(
      `SELECT 1 FROM user_profiles WHERE friend_code = $1`,
      [code],
    );
    if (res.rowCount === 0) return code;
  }
}

// POST /api/auth/create-account
router.post("/create-account", async (req, res) => {
  try {
    const {
      email,
      onboardingToken,
      name,
      age,
      birthYear,
      birthDay,
      birthMonth,
      birthDate,
      contact,
      gender,
      password,
      profilePhoto,
    } = req.body || {};

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const passwordValue = String(password || "");
    const cleanName = String(name || "").trim();
    const cleanGender = String(gender || "")
      .trim()
      .toLowerCase();
    const cleanContact = String(contact || "").trim();
    const numAge = Number(age);
    const numBirthYear = Number(birthYear);
    const numBirthDay = Number(birthDay);
    const numBirthMonth = Number(birthMonth);

    // Validate inputs
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      throw new Error("Enter a valid email address.");
    if (!onboardingToken)
      throw new Error("Verify your email before creating an account.");
    if (cleanName.length < 2) throw new Error("Enter your full name.");
    if (!Number.isInteger(numAge) || numAge < 13 || numAge > 120)
      throw new Error("Enter a valid age (13-120).");
    if (
      !Number.isInteger(numBirthYear) ||
      numBirthYear < 1900 ||
      numBirthYear > new Date().getFullYear()
    )
      throw new Error("Enter a valid birth year.");
    if (
      !Number.isInteger(numBirthDay) ||
      numBirthDay < 1 ||
      numBirthDay > 31 ||
      !Number.isInteger(numBirthMonth) ||
      numBirthMonth < 1 ||
      numBirthMonth > 12
    ) {
      throw new Error("Enter a valid birth day and month.");
    }
    if (!["male", "female"].includes(cleanGender))
      throw new Error("Select whether your character is male or female.");
    if (passwordValue.length < 8)
      throw new Error("Password must be at least 8 characters.");

    // Verify onboarding token in PostgreSQL
    const tokenRecord = await query(
      `
      SELECT * FROM auth_otps
      WHERE LOWER(email) = $1 AND onboarding_token = $2 AND verified = true AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `,
      [normalizedEmail, onboardingToken],
    );

    if (!tokenRecord.rowCount) {
      return res.status(400).json({
        error:
          "Verification session invalid or expired. Please verify your email again.",
      });
    }

    // Save profile photo if provided
    let savedPhotoUrl = "";
    if (profilePhoto?.dataUrl) {
      const match = String(profilePhoto.dataUrl).match(
        /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i,
      );
      if (!match)
        throw new Error("Profile photo must be PNG, JPG, JPEG, or WEBP.");
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 5 * 1024 * 1024)
        throw new Error("Profile photo must be 5 MB or smaller.");
      await fs.mkdir(uploadsDir, { recursive: true });
      const ext =
        match[1].toLowerCase().replace("image/", "") === "jpeg"
          ? "jpg"
          : match[1].toLowerCase().replace("image/", "");
      const filename = `${crypto.randomUUID()}.${ext}`;
      await fs.writeFile(path.join(uploadsDir, filename), buffer);
      savedPhotoUrl = `/uploads/${filename}`;
    }

    // Database transaction to create the complete user entity
    const newUser = await tx(async (client) => {
      // Check if email already registered
      const emailCheck = await client.query(
        "SELECT 1 FROM users WHERE LOWER(email) = $1",
        [normalizedEmail],
      );
      if (emailCheck.rowCount > 0)
        throw Object.assign(
          new Error("An account with this email already exists."),
          { status: 409 },
        );

      const username = await generateUniqueUsername(
        client,
        cleanName,
        numBirthDay,
        numBirthMonth,
      );
      const friendCode = await generateUniqueFriendCode(client);
      const passwordHash = hashPassword(passwordValue);

      // 1. Insert into users
      const userRes = await client.query(
        `
        INSERT INTO users (username, display_name, email, password_hash, status)
        VALUES ($1, $2, $3, $4, 'ACTIVE')
        RETURNING id, username, display_name, email, created_at
      `,
        [username, cleanName, normalizedEmail, passwordHash],
      );
      const user = userRes.rows[0];

      // 2. Insert into user_profiles
      // NEW USER STARTS CLEAN: Level 1, 0 XP, 0 Coins!
      await client.query(
        `
        INSERT INTO user_profiles (
          user_id, title, level, xp, coins, friend_code,
          coach_avatar, coach_personality, birth_date, birth_year,
          birth_month, birth_day, age, gender, contact_number, profile_image_url
        ) VALUES (
          $1, 'Novice Adventurer', 1, 0, 0, $2,
          $3, 'Sage', $4::date, $5,
          $6, $7, $8, $9, $10, $11
        )
      `,
        [
          user.id,
          friendCode,
          cleanGender,
          birthDate || null,
          numBirthYear,
          numBirthMonth,
          numBirthDay,
          numAge,
          cleanGender,
          cleanContact,
          savedPhotoUrl || null,
        ],
      );

      // 3. Insert into user_stats with starter values (10 each)
      await client.query(
        `
        INSERT INTO user_stats (
          user_id, intelligence, strength, vitality, discipline, agility, charisma, wealth
        ) VALUES ($1, 10, 10, 10, 10, 10, 10, 10)
      `,
        [user.id],
      );

      // 4. Insert into user_settings
      await client.query(
        `
        INSERT INTO user_settings (
          user_id, theme, sounds, animations, time_format, week_start, difficulty,
          xp_animation, quest_reminders, streak_protection, profile_visible, leaderboard_visible
        ) VALUES ($1, 'dark', true, true, '12h', 'Monday', 'Adaptive', true, true, 'Ask first', true, true)
      `,
        [user.id],
      );

      // 5. Grant Starter Inventory items to new adventurers
      const starterItems = await client.query(`
        SELECT id, code FROM inventory_items
        WHERE code IN ('xp-boost', 'focus-potion', 'streak-shield')
      `);
      for (const item of starterItems.rows) {
        await client.query(
          `
          INSERT INTO user_inventory (user_id, item_id, quantity, source)
          VALUES ($1::uuid, $2::uuid, 1, 'STARTER_PACK')
          ON CONFLICT (user_id, item_id) DO NOTHING
        `,
          [user.id, item.id],
        );
        await client.query(
          `
          INSERT INTO inventory_transactions (user_id, item_id, delta, reason)
          VALUES ($1::uuid, $2::uuid, 1, 'STARTER_PACK')
        `,
          [user.id, item.id],
        );
      }

      // 6. Consume OTP token
      await client.query(
        `
        UPDATE auth_otps SET consumed_at = now() WHERE id = $1
      `,
        [tokenRecord.rows[0].id],
      );

      // 7. Record activity event
      await client.query(
        `
        INSERT INTO activity_events (user_id, kind, text, value, visibility)
        VALUES ($1, 'Account', 'Awakened your LIFE RPG character', '+0 XP', 'PRIVATE')
      `,
        [user.id],
      );

      // 8. Record notification
      await client.query(
        `
        INSERT INTO notifications (user_id, type, message)
        VALUES ($1, 'SYSTEM', 'Welcome to LIFE RPG. Your journey begins today.')
      `,
        [user.id],
      );

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        profilePhoto: savedPhotoUrl,
        level: 1,
        xp: 0,
        coins: 0,
      };
    });

    const token = createToken(newUser);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token + crypto.randomUUID())
      .digest("hex");

    // Save session in auth_sessions
    await query(
      `
      INSERT INTO auth_sessions (user_id, session_token, refresh_token_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '30 days')
      ON CONFLICT (refresh_token_hash) DO NOTHING
    `,
      [newUser.id, token, tokenHash],
    );

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: newUser,
    });
  } catch (err) {
    console.error("Error in create-account:", err);
    return res
      .status(err.status || 400)
      .json({ error: err.message || "Could not create account." });
  }
});

// POST /api/auth/login (accepts email OR username + password)
router.post("/login", async (req, res) => {
  try {
    const identity = String(
      req.body?.identity ||
        req.body?.login ||
        req.body?.username ||
        req.body?.email ||
        "",
    )
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!identity || !password) {
      return res
        .status(400)
        .json({ error: "Username/email and password are required." });
    }

    const userRes = await query(
      `
      SELECT u.id, u.username, u.display_name, u.email, u.password_hash, u.status,
             p.title, p.level, p.xp, p.coins, p.profile_image_url
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE (LOWER(u.email) = $1 OR LOWER(u.username) = $1)
    `,
      [identity],
    );

    if (!userRes.rowCount) {
      return res.status(401).json({
        error: "We could not find an account with that username or email.",
      });
    }

    const user = userRes.rows[0];

    if (user.status !== "ACTIVE") {
      return res
        .status(403)
        .json({ error: "This account has been suspended or deactivated." });
    }

    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = createToken(user);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token + crypto.randomUUID())
      .digest("hex");

    // Record session
    await query(
      `
      INSERT INTO auth_sessions (user_id, session_token, refresh_token_hash, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, now() + interval '30 days')
      ON CONFLICT (refresh_token_hash) DO NOTHING
    `,
      [
        user.id,
        token,
        tokenHash,
        req.ip || null,
        req.header("user-agent") || null,
      ],
    );

    return res.status(200).json({
      message: `Welcome back, ${user.username}.`,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        level: user.level || 1,
        xp: Number(user.xp || 0),
        coins: Number(user.coins || 0),
        profilePhoto: user.profile_image_url || "",
      },
    });
  } catch (err) {
    console.error("Error in login:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : null;

    if (token) {
      const up = await query(
        `
        UPDATE auth_sessions
        SET revoked_at = now()
        WHERE session_token = $1 OR user_id = $2::uuid
      `,
        [token, req.userId],
      );

      if (up.rowCount === 0) {
        await query(
          `
          INSERT INTO auth_sessions (user_id, session_token, revoked_at)
          VALUES ($1::uuid, $2, now())
        `,
          [req.userId, token],
        );
      }
    }

    return res
      .status(200)
      .json({ ok: true, message: "Logged out successfully." });
  } catch (err) {
    console.error("Error in logout:", err);
    return res.status(500).json({ error: "Logout failed." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
      SELECT u.id, u.username, u.display_name, u.email,
             p.title, p.level, p.xp, p.coins, p.friend_code, p.coach_avatar,
             p.coach_personality, p.birth_date, p.age, p.gender, p.contact_number,
             p.profile_image_url, p.streak, p.longest_streak,
             s.intelligence, s.strength, s.vitality, s.discipline, s.agility, s.charisma, s.wealth,
             st.theme, st.sounds, st.animations, st.time_format, st.week_start, st.difficulty,
             st.profile_visible, st.leaderboard_visible
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      JOIN user_stats s ON s.user_id = u.id
      LEFT JOIN user_settings st ON st.user_id = u.id
      WHERE u.id = $1::uuid
    `,
      [req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const row = result.rows[0];
    return res.status(200).json({
      user: {
        id: row.id,
        username: row.username,
        name: row.display_name,
        email: row.email,
        title: row.title,
        level: row.level,
        xp: Number(row.xp),
        coins: Number(row.coins),
        friendCode: row.friend_code,
        coachAvatar: row.coach_avatar,
        coachPersonality: row.coach_personality,
        birthDate: row.birth_date,
        age: row.age,
        gender: row.gender,
        contact: row.contact_number,
        profilePhoto: row.profile_image_url || "",
        streak: row.streak || 0,
        longestStreak: row.longest_streak || 0,
      },
      stats: {
        Intelligence: row.intelligence,
        Strength: row.strength,
        Vitality: row.vitality,
        Discipline: row.discipline,
        Agility: row.agility,
        Charisma: row.charisma,
        Wealth: row.wealth,
      },
      settings: {
        theme: row.theme || "dark",
        sounds: row.sounds !== false,
        animations: row.animations !== false,
        timeFormat: row.time_format || "12h",
        weekStart: row.week_start || "Monday",
        difficulty: row.difficulty || "Adaptive",
        profileVisible: row.profile_visible !== false,
        leaderboardVisible: row.leaderboard_visible !== false,
      },
    });
  } catch (err) {
    console.error("Error in /me:", err);
    return res
      .status(500)
      .json({ error: "Failed to retrieve authenticated user." });
  }
});

// DELETE /api/auth/account (also mounted at /api/account)
router.delete("/account", requireAuth, async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    if (!password) {
      return res.status(400).json({
        error: "Password confirmation is required to delete your account.",
      });
    }

    const userRes = await query(
      `SELECT password_hash FROM users WHERE id = $1::uuid`,
      [req.userId],
    );
    if (!userRes.rowCount) {
      return res.status(404).json({ error: "Account not found." });
    }

    const isValid = verifyPassword(password, userRes.rows[0].password_hash);
    if (!isValid) {
      return res
        .status(401)
        .json({ error: "Incorrect password. Account deletion aborted." });
    }

    // Delete user in atomic transaction; ON DELETE CASCADE cleans all user-owned rows
    await tx(async (client) => {
      // 1. Revoke all sessions
      await client.query(`DELETE FROM auth_sessions WHERE user_id = $1::uuid`, [
        req.userId,
      ]);
      // 2. Delete user entity (cascades to user_profiles, user_stats, user_settings, quests, quest_runtime, user_inventory, etc.)
      await client.query(`DELETE FROM users WHERE id = $1::uuid`, [req.userId]);
    });

    return res.status(200).json({
      ok: true,
      message: "Your LIFE RPG account has been completely deleted.",
    });
  } catch (err) {
    console.error("Error deleting account:", err);
    return res
      .status(500)
      .json({ error: "Failed to delete account. Please try again." });
  }
});

export default router;
