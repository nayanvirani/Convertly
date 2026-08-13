// Catch-all redirect for Shopify App Pricing's "welcome link" redirects.
//
// When a merchant selects a plan, Shopify redirects to:
//   admin.shopify.com/store/{shop}/apps/conversion-booster-11/billing?plan_handle=pro
//
// Shopify loads our embedded app at /billing (without the /app prefix).
// This route forwards to /app/billing so the normal auth + billing page renders.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  // Preserve plan_handle and any other params
  return redirect(`/app/billing${params ? `?${params}` : ""}`);
};
