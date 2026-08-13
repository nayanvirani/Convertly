import { pool } from "./db.server";

export type ShopRow = {
  id: string;
  shop: string;
  isOnline: boolean;
  expires: number | null;
  scope: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  refreshTokenExpires: number | null;
};

export type EnrichedShop = ShopRow & {
  storeName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  isPro: boolean;
  planName: string;
  trialActive: boolean;
  apiError: boolean;
};

export async function getShops(): Promise<ShopRow[]> {
  const { rows } = await pool().query(
    `SELECT "id", "shop", "isOnline", "expires", "scope", "accessToken", "refreshToken", "refreshTokenExpires"
     FROM "shopify_sessions"
     WHERE "isOnline" = false
     ORDER BY "shop" ASC`
  );
  return rows.map((r) => ({
    ...r,
    refreshTokenExpires:
      r.refreshTokenExpires === null ? null : Number(r.refreshTokenExpires),
  })) as ShopRow[];
}

// ─── Token migration (permanent → expiring) ──────────────────────────────────

export type MigrationResult = {
  shop: string;
  status: "migrated" | "already_expiring" | "no_token" | "failed" | "session_cleared";
  error?: string;
};

async function exchangeToExpiringToken(
  shop: string,
  permanentToken: string
): Promise<
  | { ok: true; accessToken: string; expires: number; refreshToken: string; refreshTokenExpires: number }
  | { ok: false; error: string }
> {
  const apiKey    = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey)    return { ok: false, error: "SHOPIFY_API_KEY env var missing" };
  if (!apiSecret) return { ok: false, error: "SHOPIFY_API_SECRET env var missing" };

  const body = new URLSearchParams({
    client_id:             apiKey,
    client_secret:         apiSecret,
    grant_type:            "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token:         permanentToken,
    subject_token_type:    "urn:shopify:params:oauth:token-type:offline-access-token",
    requested_token_type:  "urn:shopify:params:oauth:token-type:offline-access-token",
    expiring:              "1",
  });

  let res: Response | null;
  try {
    res = await withTimeout(
      fetch(`https://${shop}/admin/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
      10000
    );
  } catch (e: any) {
    return { ok: false, error: `Fetch threw: ${e.message}` };
  }

  if (!res) return { ok: false, error: "Request timed out after 10s" };

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  let data: any;
  try { data = JSON.parse(text); } catch {
    return { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}` };
  }

  if (!data.access_token) {
    return { ok: false, error: `No access_token in response: ${JSON.stringify(data).slice(0, 200)}` };
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    ok:                  true,
    accessToken:         data.access_token,
    expires:             now + (data.expires_in ?? 86399),
    refreshToken:        data.refresh_token,
    refreshTokenExpires: now + (data.refresh_token_expires_in ?? 7776000),
  };
}

async function updateSession(
  sessionId: string,
  t: { accessToken: string; expires: number; refreshToken: string; refreshTokenExpires: number }
): Promise<boolean> {
  try {
    await pool().query(
      `UPDATE "shopify_sessions"
       SET "accessToken" = $1, "expires" = $2, "refreshToken" = $3, "refreshTokenExpires" = $4
       WHERE "id" = $5 AND "isOnline" = false`,
      [t.accessToken, t.expires, t.refreshToken, t.refreshTokenExpires, sessionId]
    );
    return true;
  } catch (err) {
    console.error("[admin] updateSession error:", err);
    return false;
  }
}

export async function migrateOfflineTokens(): Promise<MigrationResult[]> {
  const shops = await getShops();
  const results: MigrationResult[] = [];

  for (const shop of shops) {
    if (!shop.accessToken) {
      results.push({ shop: shop.shop, status: "no_token" });
      continue;
    }
    if (shop.refreshToken) {
      results.push({ shop: shop.shop, status: "already_expiring" });
      continue;
    }
    const result = await exchangeToExpiringToken(shop.shop, shop.accessToken);
    if (!result.ok) {
      results.push({ shop: shop.shop, status: "failed", error: result.error });
      continue;
    }
    const dbOk = await updateSession(shop.id, result);
    results.push({ shop: shop.shop, status: dbOk ? "migrated" : "failed", error: dbOk ? undefined : "DB update failed" });
  }

  return results;
}

// Deletes offline sessions that still hold a permanent (non-expiring) token.
// After clearing, the next time the merchant opens the app in Shopify admin
// the Token Exchange flow runs automatically and issues a new expiring token.
export async function clearPermanentSessions(): Promise<{ cleared: number }> {
  const result = await pool().query(
    `DELETE FROM "shopify_sessions"
     WHERE "isOnline" = false AND ("refreshToken" IS NULL OR "refreshToken" = '')`
  );
  return { cleared: result.rowCount ?? 0 };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), ms));
  return Promise.race([promise, timeout]);
}

// ─── Token refresh ───────────────────────────────────────────────────────────

type RefreshResult =
  | { ok: true; accessToken: string; expires: number; refreshToken: string; refreshTokenExpires: number }
  | { ok: false; error: string };

async function refreshAccessToken(shop: string, refreshToken: string): Promise<RefreshResult> {
  const apiKey    = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) return { ok: false, error: "Missing API credentials" };

  try {
    const res = await withTimeout(
      fetch(`https://${shop}/admin/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: apiKey,
          client_secret: apiSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }).toString(),
      }),
      8000
    );
    if (!res || !res.ok) return { ok: false, error: `HTTP ${res?.status ?? "timeout"}` };
    const data: any = await res.json();
    if (!data.access_token) return { ok: false, error: "No access_token in response" };
    const now = Math.floor(Date.now() / 1000);
    return {
      ok: true,
      accessToken:         data.access_token,
      expires:             now + (data.expires_in ?? 86399),
      refreshToken:        data.refresh_token ?? refreshToken,
      refreshTokenExpires: now + (data.refresh_token_expires_in ?? 7776000),
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Shop & billing data ─────────────────────────────────────────────────────

async function fetchShopInfo(
  shop: string,
  accessToken: string
): Promise<{ storeName: string; ownerName: string; ownerEmail: string } | null> {
  try {
    const res = await withTimeout(
      fetch(`https://${shop}/admin/api/2025-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      }),
      6000
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    return {
      storeName: data.shop?.name ?? shop,
      ownerName: data.shop?.shop_owner ?? "",
      ownerEmail: data.shop?.email ?? "",
    };
  } catch {
    return null;
  }
}

async function fetchBillingStatus(
  shop: string,
  accessToken: string
): Promise<{ isPro: boolean; planName: string; trialActive: boolean } | null> {
  try {
    const query = `{ currentAppInstallation { activeSubscriptions { name status trialDays } } }`;
    const res = await withTimeout(
      fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query }),
      }),
      6000
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    const subs: any[] = data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs[0];
    return {
      isPro: subs.length > 0,
      planName: active?.name ?? "Free",
      trialActive: active?.status === "ACTIVE" && (active?.trialDays ?? 0) > 0,
    };
  } catch {
    return null;
  }
}

export async function getEnrichedShops(): Promise<EnrichedShop[]> {
  const shops = await getShops();

  return Promise.all(
    shops.map(async (shop) => {
      if (!shop.accessToken) {
        return {
          ...shop,
          storeName: null,
          ownerName: null,
          ownerEmail: null,
          isPro: false,
          planName: "Free",
          trialActive: false,
          apiError: false,
        };
      }

      // Auto-refresh the access token if it has expired.
      let accessToken = shop.accessToken;
      const now = Math.floor(Date.now() / 1000);
      if (shop.expires && shop.expires < now && shop.refreshToken) {
        console.log(`[admin] token expired for ${shop.shop}, refreshing…`);
        const refreshed = await refreshAccessToken(shop.shop, shop.refreshToken);
        if (refreshed.ok) {
          await updateSession(shop.id, refreshed);
          accessToken = refreshed.accessToken;
          console.log(`[admin] token refreshed for ${shop.shop}`);
        } else {
          console.warn(`[admin] token refresh failed for ${shop.shop}:`, refreshed.error);
        }
      }

      const [info, billing] = await Promise.all([
        fetchShopInfo(shop.shop, accessToken),
        fetchBillingStatus(shop.shop, accessToken),
      ]);

      return {
        ...shop,
        storeName: info?.storeName ?? null,
        ownerName: info?.ownerName ?? null,
        ownerEmail: info?.ownerEmail ?? null,
        isPro: billing?.isPro ?? false,
        planName: billing?.planName ?? "Free",
        trialActive: billing?.trialActive ?? false,
        apiError: info === null && billing === null,
      };
    })
  );
}

export function shopsToCSV(shops: ShopRow[]): string {
  const header = "Shop Domain,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires * 1000).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    return `${s.shop},${s.id},${scopes},${expires},${hasToken}`;
  });
  return [header, ...rows].join("\n");
}

export function enrichedShopsToCSV(shops: EnrichedShop[]): string {
  const header = "Shop Domain,Store Name,Owner Name,Owner Email,Plan,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires * 1000).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    const quote = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    return [
      s.shop, quote(s.storeName), quote(s.ownerName), quote(s.ownerEmail),
      s.isPro ? "Pro" : "Free",
      s.id, scopes, expires, hasToken,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}
