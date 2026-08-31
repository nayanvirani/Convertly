// Postgres pool for shop-level data that goes beyond what
// @shopify/shopify-app-session-storage-postgresql manages (Shopify sessions
// only, in the "shopify_sessions" table).
//
// Uses the same DATABASE_URL as the session storage so everything lives in
// one Postgres database (e.g. the one Railway's Postgres plugin provides).

import pg from "pg";
import { WIDGET_DEFAULTS, WIDGET_KEYS, type WidgetKey, type WidgetSettingsMap } from "./widgets";

const { Pool } = pg;

// Singleton pool — safe to share across requests in a single-process server.
let _pool: pg.Pool | null = null;

export function pool(): pg.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on("error", (err) => {
      // Errors on idle clients shouldn't crash the process.
      console.error("[db] unexpected pool error:", err);
    });
  }
  return _pool;
}

let _ready: Promise<void> | null = null;

/** Create tables/indexes if they don't exist yet. Safe to call repeatedly. */
export function ready(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const client = pool();
      await client.query(`
        CREATE TABLE IF NOT EXISTS shop_plans (
          shop            TEXT PRIMARY KEY,
          plan_handle     TEXT NOT NULL,
          pro_granted_at  BIGINT,
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Widget analytics events table.
      await client.query(`
        CREATE TABLE IF NOT EXISTS widget_events (
          id         BIGSERIAL PRIMARY KEY,
          shop       TEXT    NOT NULL,
          widget     TEXT    NOT NULL,
          event_type TEXT    NOT NULL,
          date       TEXT    NOT NULL,
          created_at BIGINT  NOT NULL
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS we_shop_date ON widget_events(shop, date DESC)`
      );
      // Admin dashboard login accounts (see adminAuth.server.ts).
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id            BIGSERIAL PRIMARY KEY,
          username      TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Per-shop widget config, rendered client-side by the storefront
      // embed's JS instead of Shopify theme-editor block settings.
      await client.query(`
        CREATE TABLE IF NOT EXISTS widget_settings (
          shop        TEXT NOT NULL,
          widget      TEXT NOT NULL,
          enabled     BOOLEAN NOT NULL DEFAULT false,
          settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (shop, widget)
        )
      `);
    })();
  }
  return _ready;
}

/**
 * Whether this shop currently has the app installed — checked against the
 * "shopify_sessions" table (populated at OAuth time, for every install,
 * regardless of billing status), NOT shop_plans. shop_plans only gets a row
 * once a subscription event happens (webhook) or the merchant visits the
 * billing page — a shop that just installed and hasn't touched billing yet
 * would incorrectly look "not installed" if we checked shop_plans instead.
 */
export async function isShopInstalled(shop: string): Promise<boolean> {
  await ready();
  try {
    const { rows } = await pool().query(
      `SELECT 1 FROM "shopify_sessions" WHERE "shop" = $1 LIMIT 1`,
      [shop]
    );
    return rows.length > 0;
  } catch (err) {
    console.error("[db] isShopInstalled error:", err);
    return false;
  }
}

/** Return the stored plan handle for a shop, or null if unknown. */
export async function getShopPlan(shop: string): Promise<string | null> {
  await ready();
  try {
    const { rows } = await pool().query(
      "SELECT plan_handle FROM shop_plans WHERE shop = $1",
      [shop]
    );
    return rows[0]?.plan_handle ?? null;
  } catch (err) {
    console.error("[db] getShopPlan error:", err);
    return null;
  }
}

/**
 * Return the Unix timestamp (seconds) when Pro was last granted via
 * plan_handle=pro redirect, or null if never.
 */
export async function getProGrantedAt(shop: string): Promise<number | null> {
  await ready();
  try {
    const { rows } = await pool().query(
      "SELECT pro_granted_at FROM shop_plans WHERE shop = $1",
      [shop]
    );
    const value = rows[0]?.pro_granted_at;
    return value === null || value === undefined ? null : Number(value);
  } catch {
    return null;
  }
}

/** Persist (or update) the plan handle for a shop. */
export async function setShopPlan(shop: string, planHandle: string): Promise<void> {
  await ready();
  try {
    await pool().query(
      `INSERT INTO shop_plans (shop, plan_handle, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (shop) DO UPDATE
         SET plan_handle = excluded.plan_handle,
             updated_at  = now()`,
      [shop, planHandle]
    );
  } catch (err) {
    console.error("[db] setShopPlan error:", err);
  }
}

/**
 * Record the time (Unix seconds) when Pro was confirmed via plan_handle=pro.
 * Used to distinguish a freshly-granted Pro subscription from a stale test one.
 */
export async function recordProGrant(shop: string): Promise<void> {
  await ready();
  const now = Math.floor(Date.now() / 1000);
  try {
    await pool().query(
      `INSERT INTO shop_plans (shop, plan_handle, pro_granted_at, updated_at)
       VALUES ($1, 'pro', $2, now())
       ON CONFLICT (shop) DO UPDATE
         SET plan_handle    = 'pro',
             pro_granted_at = $2,
             updated_at     = now()`,
      [shop, now]
    );
  } catch (err) {
    console.error("[db] recordProGrant error:", err);
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/** Record a widget view or click event. Fire-and-forget (never throws). */
export async function trackWidgetEvent(
  shop: string,
  widget: string,
  eventType: string
): Promise<void> {
  await ready();
  const now = Math.floor(Date.now() / 1000);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  try {
    await pool().query(
      `INSERT INTO widget_events (shop, widget, event_type, date, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [shop, widget, eventType, date, now]
    );
  } catch (err) {
    console.error("[db] trackWidgetEvent error:", err);
  }
}

/** Total views + clicks per widget for a shop (all time). */
export async function getWidgetAnalytics(
  shop: string
): Promise<Array<{ widget: string; event_type: string; count: number }>> {
  await ready();
  try {
    const { rows } = await pool().query(
      `SELECT widget, event_type, COUNT(*) AS count
       FROM widget_events
       WHERE shop = $1
       GROUP BY widget, event_type`,
      [shop]
    );
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  } catch (err) {
    console.error("[db] getWidgetAnalytics error:", err);
    return [];
  }
}

/** Daily view + click counts for the last N days (newest first). */
export async function getDailyAnalytics(
  shop: string,
  days = 7
): Promise<Array<{ widget: string; event_type: string; date: string; count: number }>> {
  await ready();
  try {
    const { rows } = await pool().query(
      `SELECT widget, event_type, date, COUNT(*) AS count
       FROM widget_events
       WHERE shop = $1 AND date >= to_char(now() - ($2 || ' days')::interval, 'YYYY-MM-DD')
       GROUP BY widget, event_type, date
       ORDER BY date DESC`,
      [shop, days - 1]
    );
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  } catch (err) {
    console.error("[db] getDailyAnalytics error:", err);
    return [];
  }
}

/** Clear the stored plan (e.g. on uninstall). */
export async function clearShopPlan(shop: string): Promise<void> {
  await ready();
  try {
    await pool().query("DELETE FROM shop_plans WHERE shop = $1", [shop]);
  } catch (err) {
    console.error("[db] clearShopPlan error:", err);
  }
}

// ─── Widget settings ────────────────────────────────────────────────────────

export type WidgetRow<K extends WidgetKey = WidgetKey> = {
  enabled: boolean;
  settings: WidgetSettingsMap[K];
};

/** All 5 widgets for a shop, merged with defaults so callers never see gaps. */
export async function listWidgetSettings(shop: string): Promise<{ [K in WidgetKey]: WidgetRow<K> }> {
  await ready();
  const result = Object.fromEntries(
    WIDGET_KEYS.map((k) => [k, { enabled: false, settings: WIDGET_DEFAULTS[k] }])
  ) as { [K in WidgetKey]: WidgetRow<K> };

  try {
    const { rows } = await pool().query(
      "SELECT widget, enabled, settings FROM widget_settings WHERE shop = $1",
      [shop]
    );
    for (const row of rows) {
      const key = row.widget as WidgetKey;
      if (!WIDGET_KEYS.includes(key)) continue;
      result[key] = {
        enabled: row.enabled,
        settings: { ...WIDGET_DEFAULTS[key], ...(row.settings ?? {}) },
      };
    }
  } catch (err) {
    console.error("[db] listWidgetSettings error:", err);
  }
  return result;
}

export async function getWidgetSettings<K extends WidgetKey>(
  shop: string,
  widget: K
): Promise<WidgetRow<K>> {
  await ready();
  try {
    const { rows } = await pool().query(
      "SELECT enabled, settings FROM widget_settings WHERE shop = $1 AND widget = $2",
      [shop, widget]
    );
    const row = rows[0];
    if (!row) return { enabled: false, settings: WIDGET_DEFAULTS[widget] };
    return { enabled: row.enabled, settings: { ...WIDGET_DEFAULTS[widget], ...(row.settings ?? {}) } };
  } catch (err) {
    console.error("[db] getWidgetSettings error:", err);
    return { enabled: false, settings: WIDGET_DEFAULTS[widget] };
  }
}

/**
 * Save a widget's settings fields only — does NOT touch `enabled`. That's
 * deliberately its own separate control now (see setWidgetEnabled below),
 * so saving text/color/etc. fields here can never accidentally flip a
 * widget off (or on) as a side effect.
 */
export async function upsertWidgetSettings<K extends WidgetKey>(
  shop: string,
  widget: K,
  settings: WidgetSettingsMap[K]
): Promise<void> {
  await ready();
  try {
    await pool().query(
      `INSERT INTO widget_settings (shop, widget, enabled, settings, updated_at)
       VALUES ($1, $2, false, $3, now())
       ON CONFLICT (shop, widget) DO UPDATE
         SET settings = excluded.settings,
             updated_at = now()`,
      [shop, widget, JSON.stringify(settings)]
    );
  } catch (err) {
    // Unlike the fire-and-forget cleanup helpers elsewhere in this file,
    // this one has to rethrow — a merchant just clicked Save and needs to
    // actually find out it didn't take (the route action turns this into
    // a clean error banner) instead of silently losing their edits while
    // the UI still says "Settings saved."
    console.error("[db] upsertWidgetSettings error:", err);
    throw err;
  }
}

/**
 * Flip a widget's enabled flag only — used by the dashboard's instant-save
 * toggle, independent of the rest of that widget's settings form. Seeds
 * `settings` with defaults if this is the first time this widget has ever
 * been touched for this shop (no row yet); leaves it untouched otherwise.
 */
export async function setWidgetEnabled<K extends WidgetKey>(
  shop: string,
  widget: K,
  enabled: boolean
): Promise<void> {
  await ready();
  try {
    await pool().query(
      `INSERT INTO widget_settings (shop, widget, enabled, settings, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (shop, widget) DO UPDATE
         SET enabled = excluded.enabled,
             updated_at = now()`,
      [shop, widget, enabled, JSON.stringify(WIDGET_DEFAULTS[widget])]
    );
  } catch (err) {
    // Same reasoning as upsertWidgetSettings above — the toggle's own
    // fetcher already knows how to render a failure banner from a thrown
    // action, but only if the action actually gets a chance to catch this
    // and respond with one instead of the whole request 500ing.
    console.error("[db] setWidgetEnabled error:", err);
    throw err;
  }
}

/** Remove all widget config for a shop (called on uninstall). */
export async function deleteWidgetSettings(shop: string): Promise<void> {
  await ready();
  try {
    await pool().query("DELETE FROM widget_settings WHERE shop = $1", [shop]);
  } catch (err) {
    console.error("[db] deleteWidgetSettings error:", err);
  }
}
