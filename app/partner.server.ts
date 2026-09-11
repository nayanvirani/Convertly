// Real payment history via Shopify's Partner API — a different credential
// from the per-shop Admin API token used everywhere else in this app.
// PARTNER_API_TOKEN + PARTNER_ORG_ID are organization-level (Partner
// Dashboard → Settings → Partner API clients), not merchant-level, so
// this is the only place in the app that can see actual charge history
// from before today: the per-shop token only ever sees a shop's current
// subscription snapshot, never past transactions.
//
// Used by the admin dashboard's Revenue page (and the Total Payments stat
// on the main dashboard) — nothing merchant-facing depends on this.

export type AppTransaction = {
  id: string;
  createdAt: string; // ISO
  grossAmount: number;
  netAmount: number;
  shopifyFee: number;
  currency: string;
  billingInterval: string | null; // "EVERY_30_DAYS" | "ANNUAL" | null
  shopName: string | null;
  shopDomain: string | null;
};

const PARTNER_API_VERSION = "2025-10";

async function fetchAllTransactions(): Promise<AppTransaction[]> {
  const token = process.env.PARTNER_API_TOKEN;
  const orgId = process.env.PARTNER_ORG_ID;
  if (!token || !orgId) return [];

  const all: AppTransaction[] = [];
  let after: string | null = null;

  // 100, not the connection's 250 max — the nested shop/pricing fields
  // push a 250-per-page query over Shopify's query-complexity ceiling
  // (confirmed live: 250 came back "complexity 4254 exceeds max 2500").
  // Loop until pageInfo says there's nothing left. This app's transaction
  // volume is small enough that a full walk on every (cached, see below)
  // refresh is cheap — revisit with a date-bounded query if that changes.
  for (;;) {
    const query = `
      query($after: String) {
        transactions(first: 100, after: $after, types: [APP_SUBSCRIPTION_SALE]) {
          edges {
            cursor
            node {
              id
              createdAt
              ... on AppSubscriptionSale {
                grossAmount { amount currencyCode }
                netAmount { amount currencyCode }
                shopifyFee { amount currencyCode }
                billingInterval
                shop { name myshopifyDomain }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`;
    const res = await fetch(`https://partners.shopify.com/${orgId}/api/${PARTNER_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables: { after } }),
    });
    if (!res.ok) {
      console.error("[partner] transactions HTTP", res.status);
      break;
    }
    const data: any = await res.json();
    if (data.errors) {
      console.error("[partner] transactions GraphQL errors:", JSON.stringify(data.errors));
      break;
    }
    const edges: any[] = data?.data?.transactions?.edges ?? [];
    for (const e of edges) {
      const n = e.node;
      all.push({
        id: n.id,
        createdAt: n.createdAt,
        grossAmount: Number(n.grossAmount?.amount ?? 0),
        netAmount: Number(n.netAmount?.amount ?? 0),
        shopifyFee: Number(n.shopifyFee?.amount ?? 0),
        currency: n.grossAmount?.currencyCode ?? "USD",
        billingInterval: n.billingInterval ?? null,
        shopName: n.shop?.name ?? null,
        shopDomain: n.shop?.myshopifyDomain ?? null,
      });
    }
    const hasNextPage = data?.data?.transactions?.pageInfo?.hasNextPage ?? false;
    after = edges.length ? edges[edges.length - 1].cursor : null;
    if (!hasNextPage || !after) break;
  }

  return all;
}

// A few minutes of caching so viewing the dashboard repeatedly (or the
// stat card + the Revenue page on the same load) doesn't re-walk the
// entire transaction history every time.
let cache: { at: number; data: AppTransaction[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function getAppTransactions(): Promise<AppTransaction[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const data = await fetchAllTransactions();
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[partner] getAppTransactions error:", err);
    return cache?.data ?? [];
  }
}

export function isPartnerApiConfigured(): boolean {
  return !!(process.env.PARTNER_API_TOKEN && process.env.PARTNER_ORG_ID);
}

export type MonthlyRevenue = {
  month: string; // "2026-09"
  count: number;
  gross: number;
  net: number;
  currency: string;
};

export function groupByMonth(txs: AppTransaction[]): MonthlyRevenue[] {
  const map = new Map<string, MonthlyRevenue>();
  for (const t of txs) {
    const month = t.createdAt.slice(0, 7); // YYYY-MM, ISO dates sort as strings
    const existing = map.get(month) ?? { month, count: 0, gross: 0, net: 0, currency: t.currency };
    existing.count += 1;
    existing.gross += t.grossAmount;
    existing.net += t.netAmount;
    map.set(month, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
}
