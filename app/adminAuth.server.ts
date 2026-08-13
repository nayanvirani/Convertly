// Login accounts for the hidden admin dashboard (see server.ts for the
// secret-URL gate in front of this, and ADMIN_PATH in .env.example).
//
// Each admin gets their own username + password instead of one shared
// secret, stored as salted scrypt hashes in Postgres (admin_users table).
// No extra dependency — Node's built-in crypto is enough for this.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
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
