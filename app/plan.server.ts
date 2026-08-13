// Shared helpers for writing app-installation metafields that Liquid can
// read without a runtime API call:
//   convertly.plan      — "pro" | "free" (kept for any future Liquid use;
//                         the storefront embed itself gets plan-gating from
//                         /api/widgets-config, not from this metafield)
//   convertly.api_base  — this app's own base URL, so the theme embed never
//                         hardcodes a Railway domain (that domain can change
//                         across deploys/projects — it did once already).

const API_BASE = process.env.SHOPIFY_APP_URL || "";

/**
 * Write the current plan + API base URL to app-installation metafields.
 *
 * Called after every plan determination (billing page, home page).
 * Fire-and-forget on the home page; awaited on the billing page.
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
      mutation SetConvertlyMetafields($ownerId: ID!, $plan: String!, $apiBase: String!) {
        metafieldsSet(metafields: [
          {
            ownerId: $ownerId
            namespace: "convertly"
            key: "plan"
            value: $plan
            type: "single_line_text_field"
          },
          {
            ownerId: $ownerId
            namespace: "convertly"
            key: "api_base"
            value: $apiBase
            type: "single_line_text_field"
          }
        ]) {
          metafields { id key value }
          userErrors { field message }
        }
      }`,
      { variables: { ownerId: appInstallationId, plan: isPro ? "pro" : "free", apiBase: API_BASE } }
    );
    const body = await result.json();
    const errors = body.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      console.error("[plan] metafieldsSet userErrors:", errors);
    } else {
      console.log(`[plan] metafields set: plan="${isPro ? "pro" : "free"}" api_base="${API_BASE}"`);
    }
  } catch (err) {
    console.error("[plan] metafieldsSet mutation failed:", err);
  }
}
