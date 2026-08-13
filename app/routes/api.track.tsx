// Public analytics tracking endpoint.
// Called by Boostify theme extension widgets on the merchant's storefront.
//
// Method:  POST application/x-www-form-urlencoded  (no CORS preflight)
// Fields:  shop   — permanent myshopify.com domain
//          widget — bar | timer | trust | satc | popup
//          event  — view | click
//
// Security: we verify the shop is installed (present in our DB) before recording.
// No auth token needed — this is aggregate, non-PII analytics data.

import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopPlan, trackWidgetEvent } from "../db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_WIDGETS = new Set(["bar", "timer", "trust", "satc", "popup"]);
const VALID_EVENTS  = new Set(["view", "click"]);

// Handle CORS preflight (though form-encoded requests don't need it)
export async function loader() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function action({ request }: ActionFunctionArgs) {
  // CORS preflight (just in case)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const body = await request.formData();
    const shop   = (body.get("shop")   as string | null)?.trim().toLowerCase() ?? "";
    const widget = (body.get("widget") as string | null)?.trim().toLowerCase() ?? "";
    const event  = (body.get("event")  as string | null)?.trim().toLowerCase() ?? "";

    // Basic validation
    if (!shop || !VALID_WIDGETS.has(widget) || !VALID_EVENTS.has(event)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid params" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Only record events for shops that have our app installed.
    // This prevents random POST spam from unknown shops.
    const plan = await getShopPlan(shop);
    if (!plan) {
      return new Response(JSON.stringify({ ok: false, error: "shop not found" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    await trackWidgetEvent(shop, widget, event);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[api/track] error:", err);
    return new Response(JSON.stringify({ ok: false, error: "server error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
