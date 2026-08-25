import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { setShopPlan, clearShopPlan, deleteWidgetSettings, pool } from "../db.server";
import { updatePlanMetafield } from "../plan.server";

async function deleteShopSessions(shop: string): Promise<void> {
  try {
    await pool().query(`DELETE FROM "shopify_sessions" WHERE "shop" = $1`, [shop]);
  } catch (err) {
    console.error("[webhook] deleteShopSessions error:", err);
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  // Every topic below is logged at entry — deleteShopSessions/
  // clearShopPlan/deleteWidgetSettings already individually try/catch their
  // own DB errors (so Promise.all below can never reject and this handler
  // can never legitimately return non-200 for its own reasons), but Shopify's
  // dashboard has shown ERR deliveries for this endpoint with zero
  // corresponding output in our own logs — meaning the request may not have
  // reached a running instance at all (a platform-level blip, not a code
  // bug). This log line at least proves whether a delivery attempt landed
  // here, which the previous silence made impossible to tell.
  console.log(`[webhook] received topic=${topic} shop=${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Wipe every shop-scoped table, not just sessions — otherwise
      // shop_plans/widget_settings/widget_events accumulate forever for
      // shops that are no longer installed.
      await Promise.all([
        deleteShopSessions(shop),
        clearShopPlan(shop),
        deleteWidgetSettings(shop),
      ]);
      console.log(`[webhook] APP_UNINSTALLED cleanup done shop=${shop}`);
      break;

    case "APP_SCOPES_UPDATE": {
      // Fires whenever the merchant grants/revokes scopes for this app.
      // We don't currently require any scopes, so there's nothing to react
      // to functionally — this is here so a future scope requirement shows
      // up in logs instead of silently breaking.
      const data = payload as { previous?: string[]; current?: string[] };
      console.log(
        `[webhook] APP_SCOPES_UPDATE shop=${shop} previous=[${(data.previous ?? []).join(",")}] current=[${(data.current ?? []).join(",")}]`
      );
      break;
    }

    case "APP_SUBSCRIPTIONS_UPDATE": {
      // Shopify fires this whenever an app subscription is created, updated,
      // or cancelled. Use it to keep Postgres and the plan metafield in sync
      // even when the plan changes outside the embedded app (e.g. Shopify admin).
      const data = payload as { app_subscription?: { status?: string } };
      const status = data?.app_subscription?.status ?? "";
      const isPro = ["ACTIVE", "TRIALING"].includes(status);

      console.log(`[webhook] APP_SUBSCRIPTIONS_UPDATE shop=${shop} status=${status} isPro=${isPro}`);

      await setShopPlan(shop, isPro ? "pro" : "free");

      // Also update the plan metafield so Liquid theme extensions gate correctly.
      if (admin) {
        try {
          const resp = await admin.graphql(`{ currentAppInstallation { id } }`);
          const d = await resp.json();
          const id = d.data?.currentAppInstallation?.id ?? "";
          if (id) await updatePlanMetafield(admin, id, isPro);
        } catch (err) {
          console.warn("[webhook] metafield update failed (non-critical):", err);
        }
      }
      break;
    }

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // This app stores no customer PII — widget settings live in the merchant's theme.
      break;

    case "SHOP_REDACT":
      // GDPR-mandated erasure, fired ~48h after uninstall — same cleanup as
      // APP_UNINSTALLED, in case that one somehow didn't run.
      await Promise.all([
        deleteShopSessions(shop),
        clearShopPlan(shop),
        deleteWidgetSettings(shop),
      ]);
      console.log(`[webhook] SHOP_REDACT cleanup done shop=${shop}`);
      break;

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};
