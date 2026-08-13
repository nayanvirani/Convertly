// Shared helpers for writing app-installation metafields that Liquid can
// read without a runtime API call:
//   convertly.plan      — "pro" | "free" (kept for any future Liquid use;
//                         the storefront embed itself gets plan-gating from
//                         /api/widgets-config, not from this metafield)
//   convertly.api_base  — this app's own base URL, so the theme embed never
//                         hardcodes a Railway domain (that domain can change
//                         across deploys/projects — it did once already).
//
// These two are written by DIFFERENT triggers on purpose:
//   - api_base never changes at runtime (it's a static env var) but MUST be
//     reliably set at least once per shop, so it's written unconditionally
//     on every dashboard visit (app._index.tsx) — cheap, idempotent, and
//     NOT the "poll the Admin API for plan status on every load" pattern
//     that was deliberately removed elsewhere. A shop that never visits the
//     billing page (most shops, most of the time) would otherwise never get
//     this metafield set at all, which is exactly what happened here: the
//     storefront embed loaded but silently no-opped forever because
//     data-api was empty, with nothing in the UI to indicate why.
//   - plan is only ever written in response to an actual plan-change event
//     (the billing page's plan_handle redirect, or the APP_SUBSCRIPTIONS_
//     UPDATE webhook) — never polled.

const API_BASE = process.env.SHOPIFY_APP_URL || "";

/**
 * Write ONLY the api_base metafield. Safe and cheap to call on every
 * dashboard load — the value never changes, so this is just making sure
 * it's actually set, not "polling" anything.
 */
export async function updateApiBaseMetafield(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  appInstallationId: string
): Promise<void> {
  if (!appInstallationId || !API_BASE) return;
  try {
    const result = await admin.graphql(
      `#graphql
      mutation SetConvertlyApiBase($ownerId: ID!, $apiBase: String!) {
        metafieldsSet(metafields: [{
          ownerId: $ownerId
          namespace: "convertly"
          key: "api_base"
          value: $apiBase
          type: "single_line_text_field"
        }]) {
          metafields { id key value }
          userErrors { field message }
        }
      }`,
      { variables: { ownerId: appInstallationId, apiBase: API_BASE } }
    );
    const body = await result.json();
    const errors = body.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      console.error("[plan] api_base metafieldsSet userErrors:", errors);
    } else {
      console.log(`[plan] api_base metafield set: "${API_BASE}"`);
    }
  } catch (err) {
    console.error("[plan] api_base metafieldsSet mutation failed:", err);
  }
}

/**
 * Write the plan metafield — only called in direct response to an actual
 * plan-change event (billing page redirect, or the APP_SUBSCRIPTIONS_UPDATE
 * webhook), never on a plain page load.
 */
export async function updatePlanMetafield(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  appInstallationId: string,
  isPro: boolean
): Promise<void> {
  if (!appInstallationId) return;
  try {
    const result = await admin.graphql(
      `#graphql
      mutation SetConvertlyPlan($ownerId: ID!, $plan: String!) {
        metafieldsSet(metafields: [{
          ownerId: $ownerId
          namespace: "convertly"
          key: "plan"
          value: $plan
          type: "single_line_text_field"
        }]) {
          metafields { id key value }
          userErrors { field message }
        }
      }`,
      { variables: { ownerId: appInstallationId, plan: isPro ? "pro" : "free" } }
    );
    const body = await result.json();
    const errors = body.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      console.error("[plan] plan metafieldsSet userErrors:", errors);
    } else {
      console.log(`[plan] plan metafield set: "${isPro ? "pro" : "free"}"`);
    }
  } catch (err) {
    console.error("[plan] plan metafieldsSet mutation failed:", err);
  }
}
