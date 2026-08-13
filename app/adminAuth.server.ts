// Login accounts for the hidden admin dashboard (see server.ts for the
// secret-URL gate in front of this, and ADMIN_PATH in .env.example).
//
// Each admin gets their own username + password instead of one shared
// secret, stored as salted scrypt hashes in Postgres (admin_users table).
// No extra dependency — Node's built-in crypto is enough for this.

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool, ready } from "./db.server";

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const suppliedBuffer = scryptSync(password, salt, SCRYPT_KEYLEN);
  if (hashBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(hashBuffer, suppliedBuffer);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Check a username/password pair against the admin_users table. */
export async function verifyAdminCredentials(
  username: string,
  password: string
): Promise<boolean> {
  await ready();
  try {
    const { rows } = await pool().query(
      "SELECT password_hash FROM admin_users WHERE username = $1",
      [normalizeUsername(username)]
    );
    const hash = rows[0]?.password_hash;
    if (!hash) return false;
    return verifyPassword(password, hash);
  } catch (err) {
    console.error("[adminAuth] verifyAdminCredentials error:", err);
    return false;
  }
}

export type AdminUser = { id: string; username: string; created_at: string };

export async function listAdminUsers(): Promise<AdminUser[]> {
  await ready();
  const { rows } = await pool().query(
    "SELECT id, username, created_at FROM admin_users ORDER BY created_at ASC"
  );
  return rows;
}

/** Create a new admin account, or reset the password if it already exists. */
export async function upsertAdminUser(
  username: string,
  password: string
): Promise<void> {
  await ready();
  const uname = normalizeUsername(username);
  if (!uname || password.length < 8) {
    throw new Error("Username required and password must be at least 8 characters.");
  }
  await pool().query(
    `INSERT INTO admin_users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash`,
    [uname, hashPassword(password)]
  );
}

/**
 * Delete an admin account. Refuses to delete the last remaining account so
 * you can never lock yourself out entirely.
 */
export async function deleteAdminUser(username: string): Promise<void> {
  await ready();
  const { rows } = await pool().query("SELECT COUNT(*)::int AS count FROM admin_users");
  if ((rows[0]?.count ?? 0) <= 1) {
    throw new Error("Can't delete the last remaining admin account.");
  }
  await pool().query("DELETE FROM admin_users WHERE username = $1", [
    normalizeUsername(username),
  ]);
}

// ─── Login sessions ─────────────────────────────────────────────────────────
//
// A real login screen (username + password form) instead of the browser's
// native HTTP Basic Auth popup. Sessions are a signed, stateless cookie
// token — no session table needed. The signing key is derived from two
// secrets this app already has (SHOPIFY_API_SECRET + ADMIN_PATH) so it's
// stable across restarts/deploys without a dedicated new env var, and it's
// never the same as either secret on its own.

const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12 hours

function sessionSigningKey(): string {
  return createHash("sha256")
    .update(`${process.env.SHOPIFY_API_SECRET || ""}:${process.env.ADMIN_PATH || ""}:admin-session`)
    .digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSigningKey()).update(payload).digest("hex");
}

/** Issue a signed session token for a username, good for 12 hours. */
export function createSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, e: Date.now() + SESSION_MAX_AGE_SEC * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify a session token, returning the username if valid and not expired. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedBuf = Buffer.from(sign(payload), "hex");
  const gotBuf = Buffer.from(sig, "hex");
  if (expectedBuf.length !== gotBuf.length || !timingSafeEqual(expectedBuf, gotBuf)) {
    return null;
  }

  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof u !== "string" || typeof e !== "number" || Date.now() > e) return null;
    return u;
  } catch {
    return null;
  }
}

export { SESSION_MAX_AGE_SEC };
