import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";

const LATEST_API_VERSION = ApiVersion.July26;
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

// Plan handle as defined in the Shopify Partner Dashboard.
// Used for billing.check() on dev stores (activeSubscriptions excludes test subscriptions).
export const PLANS = {
  PRO: "PRO",
} as const;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Set it to a Postgres connection string " +
      "(e.g. the one Railway's Postgres plugin provides)."
  );
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  // No merchant-granted scopes are required — see the comment in
  // shopify.app.toml's [access_scopes] for why. This still works correctly
  // if SCOPES is unset, empty, or a real comma-separated list.
  scopes: process.env.SCOPES?.split(",").filter(Boolean) ?? [],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // Stores OAuth sessions (access tokens, refresh tokens, scopes) in the
  // "shopify_sessions" table of the Postgres database at DATABASE_URL.
  sessionStorage: new PostgreSQLSessionStorage(process.env.DATABASE_URL),
  distribution: AppDistribution.AppStore,
  // Billing config enables billing.check() so we can verify plan status.
  // billing.request() is still handled by Shopify Managed Pricing (Partner Dashboard).
  // The amount/interval here are metadata only — Shopify ignores them for managed
  // pricing, so this must match whatever price is actually configured in the
  // Partner/Dev Dashboard's Managed Pricing setup — changing it here alone
  // does NOT change what merchants are charged.
  billing: {
    [PLANS.PRO]: {
      lineItems: [
        {
          amount: 49,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  // Webhook subscriptions (app_subscriptions/update, app/scopes_update,
  // app/uninstalled, plus the mandatory GDPR compliance topics) are declared
  // in shopify.app.toml, not here — that's Shopify's recommended approach
  // for shopify-app-remix apps: `shopify app deploy` registers them
  // automatically, so there's no afterAuth hook needed to call
  // registerWebhooks at runtime, and no risk of the two mechanisms drifting
  // out of sync with each other.
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;
