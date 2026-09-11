import { pool, getShopPlan, clearShopPlan, deleteWidgetSettings } from "./db.server";

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
  // Monthly/annual, and when the current period renews — null when the
  // shop is Free, or when the live billing call didn't succeed.
  billingInterval: "monthly" | "annual" | null;
  currentPeriodEnd: string | null;
  // Whether the live store-details call (name/owner/email) failed — this no
  // longer has anything to do with Plan. Plan comes from our own database
  // (shop_plans, kept current by the APP_SUBSCRIPTIONS_UPDATE webhook), so
  // it's always known and never shows "API Error" just because a live
  // Admin API call happened to fail or the token was mid-refresh.
  storeInfoError: boolean;
  // True when a live call came back with a status that specifically means
  // "this token is no longer valid" (401/403/404) rather than a generic
  // failure (timeout, 5xx, network blip) — a strong signal the merchant
  // uninstalled the app and our cleanup webhook never ran (e.g. the app
  // happened to be down for the few seconds Shopify tried to deliver it).
  // Distinct from storeInfoError, which also trips on merely transient
  // failures that say nothing about install status.
  likelyUninstalled: boolean;
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

// Manual equivalent of what the APP_UNINSTALLED/SHOP_REDACT webhooks are
// supposed to do — for the rare case one of them never ran (a delivery
// that failed while the app happened to be down, say) and left a shop
// marked installed/Active/Pro in this dashboard indefinitely. Only ever
// called from an admin-panel action on a row the dashboard has already
// flagged likelyUninstalled from a live 401/403/404, and only after the
// admin explicitly clicks the button for that specific shop.
export async function purgeUninstalledShop(shop: string): Promise<void> {
  await Promise.all([
    pool().query(`DELETE FROM "shopify_sessions" WHERE "shop" = $1`, [shop]),
    clearShopPlan(shop),
    deleteWidgetSettings(shop),
  ]);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), ms));
  return Promise.race([promise, timeout]);
}

// ─── Token refresh ───────────────────────────────────────────────────────────

type RefreshResult =
  | { ok: true; accessToken: string; expires: number; refreshToken: string; refreshTokenExpires: number }
  | { ok: false; error: string; status?: number };

async function refreshAccessToken(shop: string, refreshToken: string): Promise<RefreshResult> {
  const apiKey    = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) return { ok: false, error: "Missing API credentials" };

  try {
    // NOT /admin/oauth/token — that's the token-exchange endpoint (used by
    // exchangeToExpiringToken() above for the initial grant). Refreshing an
    // already-issued expiring token via grant_type=refresh_token is a
    // different, separate endpoint. Hitting the wrong one here was silently
    // failing every refresh attempt (404/403) for every installed shop.
    const res = await withTimeout(
      fetch(`https://${shop}/admin/oauth/access_token`, {
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
    if (!res || !res.ok) return { ok: false, error: `HTTP ${res?.status ?? "timeout"}`, status: res?.status };
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
): Promise<
  | { ok: true; storeName: string; ownerName: string; ownerEmail: string }
  | { ok: false; status?: number }
> {
  try {
    const res = await withTimeout(
      fetch(`https://${shop}/admin/api/2025-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      }),
      6000
    );
    if (!res || !res.ok) return { ok: false, status: res?.status };
    const data: any = await res.json();
    return {
      ok: true,
      storeName: data.shop?.name ?? shop,
      ownerName: data.shop?.shop_owner ?? "",
      ownerEmail: data.shop?.email ?? "",
    };
  } catch {
    return { ok: false };
  }
}

// Best-effort bonus enrichment ONLY — a nicer plan name (e.g. the real
// subscription name instead of just "Pro") and trial-vs-paid distinction,
// when the live call happens to succeed. Never the source of truth for
// isPro: that's always getShopPlan() (our DB, kept current by the
// APP_SUBSCRIPTIONS_UPDATE webhook), so a failed/slow/mid-refresh API call
// here never produces "API Error" or a wrong Free/Pro status.
type BillingDetails = {
  planName: string;
  trialActive: boolean;
  // "annual" only when Shopify's own AppRecurringPricing interval says so
  // for the line item actually billing (i.e. not a $0 trial line) — never
  // guessed from the plan name, so this can't drift if a plan gets renamed.
  billingInterval: "monthly" | "annual" | null;
  currentPeriodEnd: string | null;
};

async function fetchBillingDetails(
  shop: string,
  accessToken: string
): Promise<BillingDetails | null> {
  try {
    const query = `{
      currentAppInstallation {
        activeSubscriptions {
          name
          status
          trialDays
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                __typename
                ... on AppRecurringPricing { interval }
              }
            }
          }
        }
      }
    }`;
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
    if (!active) return null;

    const recurringLineItem = (active.lineItems ?? []).find(
      (li: any) => li.plan?.pricingDetails?.__typename === "AppRecurringPricing"
    );
    const interval = recurringLineItem?.plan?.pricingDetails?.interval as string | undefined;

    return {
      planName: active.name ?? "Pro",
      trialActive: active.status === "ACTIVE" && (active.trialDays ?? 0) > 0,
      billingInterval: interval === "ANNUAL" ? "annual" : interval === "EVERY_30_DAYS" ? "monthly" : null,
      currentPeriodEnd: active.currentPeriodEnd ?? null,
    };
  } catch {
    return null;
  }
}

// A status in this set specifically means "this token no longer works" —
// as opposed to a timeout, a 5xx, or a network blip, none of which say
// anything about whether the shop is still installed.
function isRevokedStatus(status: number | undefined): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404;
}

export async function getEnrichedShops(): Promise<EnrichedShop[]> {
  const shops = await getShops();

  return Promise.all(
    shops.map(async (shop) => {
      // Source of truth for Plan, always — our DB, kept current by the
      // APP_SUBSCRIPTIONS_UPDATE webhook. Never a live API call, so it's
      // never affected by an expired/mid-refresh token or a flaky request.
      const dbPlan = await getShopPlan(shop.shop);
      const isPro = dbPlan === "pro";

      if (!shop.accessToken) {
        return {
          ...shop,
          storeName: null,
          ownerName: null,
          ownerEmail: null,
          isPro,
          planName: isPro ? "Pro" : "Free",
          trialActive: false,
          billingInterval: null,
          currentPeriodEnd: null,
          storeInfoError: false,
          likelyUninstalled: false,
        };
      }

      // Auto-refresh the access token if it has expired.
      let accessToken = shop.accessToken;
      let revoked = false;
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
          if (isRevokedStatus(refreshed.status)) revoked = true;
        }
      }

      // Live calls now only enrich display (store/owner name, trial badge,
      // billing interval) — their failure never affects Plan there. It DOES
      // feed likelyUninstalled below, since a 401/403/404 here is the same
      // "token no longer valid" signal as one from the refresh above.
      const [info, billingDetails] = await Promise.all([
        fetchShopInfo(shop.shop, accessToken),
        fetchBillingDetails(shop.shop, accessToken),
      ]);
      if (!info.ok && isRevokedStatus(info.status)) revoked = true;

      return {
        ...shop,
        storeName: info.ok ? info.storeName : null,
        ownerName: info.ok ? info.ownerName : null,
        ownerEmail: info.ok ? info.ownerEmail : null,
        isPro,
        planName: billingDetails?.planName ?? (isPro ? "Pro" : "Free"),
        trialActive: isPro && (billingDetails?.trialActive ?? false),
        billingInterval: isPro ? billingDetails?.billingInterval ?? null : null,
        currentPeriodEnd: isPro ? billingDetails?.currentPeriodEnd ?? null : null,
        storeInfoError: !info.ok,
        likelyUninstalled: revoked,
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
  const header = "Shop Domain,Store Name,Owner Name,Owner Email,Plan,Billing Interval,Next Billing,Install Status,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires * 1000).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    const quote = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const installStatus = s.likelyUninstalled ? "Likely uninstalled" : s.accessToken ? "Installed" : "No token";
    return [
      s.shop, quote(s.storeName), quote(s.ownerName), quote(s.ownerEmail),
      s.isPro ? "Pro" : "Free",
      s.billingInterval ?? "", s.currentPeriodEnd ?? "",
      installStatus,
      s.id, scopes, expires, hasToken,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}
