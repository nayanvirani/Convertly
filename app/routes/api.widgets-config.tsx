// Public config endpoint for the storefront embed's JS (boostify.js).
// Replaces per-widget Liquid {% schema %} settings — the merchant configures
// everything in the Boostify admin dashboard, and this endpoint hands the
// storefront script a JSON blob of whatever's enabled for their plan.
//
// Method:  GET
// Query:   ?shop={permanent myshopify.com domain}
//
// Security: same pattern as /api/track — we only serve config for shops
// that have the app installed (present in our DB). No secrets are ever
// returned, so a short public cache is fine.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopPlan, listWidgetSettings } from "../db.server";
import { WIDGET_META, WIDGET_KEYS } from "../widgets";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();

  if (!SHOP_RE.test(shop)) {
    return new Response(JSON.stringify({ error: "invalid shop" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const plan = await getShopPlan(shop);
  if (!plan) {
    // Not an installed shop — don't leak any config.
    return new Response(JSON.stringify({ error: "shop not found" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const isPro = plan === "pro";

  const all = await listWidgetSettings(shop);
  const widgets: Record<string, unknown> = {};
  for (const key of WIDGET_KEYS) {
    const row = all[key];
    const allowed = !WIDGET_META[key].proOnly || isPro;
    if (row.enabled && allowed) {
      widgets[key] = row.settings;
    }
  }

  return new Response(JSON.stringify({ shop, isPro, widgets }), {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      // Short public cache — settings changes show up within a minute,
      // and this is hit on every storefront pageview across every install.
      "Cache-Control": "public, max-age=60",
    },
  });
}
