import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopPlan, setShopPlan, recordProGrant } from "../db.server";
import { updatePlanMetafield } from "../plan.server";

// ─── Plan detection — how this works ─────────────────────────────────────────
//
// The Admin API is only called right after Shopify redirects back here with
// ?plan_handle=pro|free (the merchant just picked a plan on the pricing
// page) — that's the one moment worth verifying live, since the
// APP_SUBSCRIPTIONS_UPDATE webhook may not have arrived yet and the
// merchant is actively watching for confirmation. Every other page load
// (including plain visits to this page) reads the plan straight from
// Postgres, which the webhook keeps current — no API polling.
//
// Dev stores have a quirk: when the merchant clicks "Test with this plan →
// Free" on Shopify's pricing page, Shopify does NOT cancel the previous test
// subscription, so activeSubscriptions keeps returning ACTIVE even though
// the pricing page shows Free as current. We self-heal that specifically in
// the plan_handle=pro path below (trusting a fresh grant) — if a dev store's
// test subscription ever gets stuck, re-picking a plan on the pricing page
// fixes it. This is a dev-store testing convenience only; Shopify cancels
// real subscriptions correctly on production stores.

async function fetchPlanFromAPI(admin: any) {
  const res = await admin.graphql(`
    #graphql
    query GetPlan {
      currentAppInstallation {
        id
        activeSubscriptions { id status test }
      }
      shop { plan { partnerDevelopment } }
    }
  `);
  const d = await res.json();
  return {
    installationId: (d.data?.currentAppInstallation?.id ?? "") as string,
    subs: (d.data?.currentAppInstallation?.activeSubscriptions ?? []) as
      Array<{ id: string; status: string; test: boolean }>,
    isDevStore: (d.data?.shop?.plan?.partnerDevelopment ?? false) as boolean,
  };
}

async function cancelSubs(admin: any, subs: Array<{ id: string }>) {
  if (!subs.length) return;
  await Promise.allSettled(
    subs.map((s) =>
      admin.graphql(
        `#graphql
         mutation Cancel($id: ID!) {
           appSubscriptionCancel(id: $id) { userErrors { field message } }
         }`,
        { variables: { id: s.id } }
      )
    )
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url       = new URL(request.url);
  const handle    = (url.searchParams.get("plan_handle") ?? "").toLowerCase();
  const justChanged = handle !== "";

  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE ?? "convertly-17";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  // Regular page load, no plan change in flight — trust Postgres (kept
  // current by the APP_SUBSCRIPTIONS_UPDATE webhook). No Admin API call.
  if (!justChanged) {
    const stored = await getShopPlan(session.shop);
    return json({ isPro: stored === "pro", justChanged: false, pricingUrl });
  }

  try {
    // Merchant was just redirected back from Shopify's pricing page —
    // verify live and persist, since the webhook may not have landed yet.
    const { installationId, subs, isDevStore } = await fetchPlanFromAPI(admin);
    const apiSaysPro = subs.some((s) => ["ACTIVE", "TRIALING"].includes(s.status));

    let isPro: boolean;

    if (handle === "free") {
      // Cancel any active subscription so the API is correct on the next load.
      isPro = false;
      if (subs.length) {
        console.log(`[plan] plan_handle=free — cancelling ${subs.length} sub(s)`);
        await cancelSubs(admin, subs);
      }
    } else {
      // handle === "pro" — trust immediately on dev stores (API can lag
      // right after test-subscription creation); verify via API on
      // production stores (real money on the line).
      isPro = isDevStore ? true : apiSaysPro;
      if (isPro) await recordProGrant(session.shop);
    }

    await setShopPlan(session.shop, isPro ? "pro" : "free");
    await updatePlanMetafield(admin, installationId, isPro);

    console.log(`[plan] ${session.shop} dev=${isDevStore} handle="${handle}" apiSaysPro=${apiSaysPro} → isPro=${isPro}`);

    return json({ isPro, justChanged, pricingUrl });

  } catch (err) {
    console.error("[plan] API call failed — falling back to Postgres:", err);
    const stored = await getShopPlan(session.shop);
    return json({ isPro: stored === "pro", justChanged, pricingUrl });
  }
};

export default function BillingPage() {
  const { isPro, justChanged, pricingUrl } = useLoaderData<typeof loader>();

  const openPricingPage = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shopify = (window as any).shopify;
    if (shopify?.redirectTo) {
      shopify.redirectTo(pricingUrl);
    } else {
      window.open(pricingUrl, "_top");
    }
  };

  return (
    <Page title="Plans" backAction={{ content: "Home", url: "/app" }}>
      {justChanged && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {justChanged && !isPro && (
        <Banner tone="info" title="Switched to Free">
          <p>You&apos;re now on the Free plan. You can upgrade again any time.</p>
        </Banner>
      )}

      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">Free Plan</Text>
                <Text as="p" variant="headingLg" tone="subdued">$0 / month</Text>
              </InlineStack>
              {!isPro && <Badge tone="success">Current plan</Badge>}
              <Divider />
              <List>
                <List.Item>Announcement Bar</List.Item>
                <List.Item>Trust Badges</List.Item>
                <List.Item>Countdown Timer</List.Item>
                <List.Item>&quot;Powered by Convertly&quot; branding</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">Pro Plan</Text>
                <BlockStack gap="0">
                  <Text as="p" variant="headingLg">$49 / month</Text>
                  <Text as="p" variant="bodySm" tone="subdued">or $530/year (save ~10%)</Text>
                </BlockStack>
              </InlineStack>
              {isPro ? (
                <Badge tone="success">Active subscription</Badge>
              ) : (
                <Badge tone="info">7-day free trial included</Badge>
              )}
              <Divider />
              <Text as="p" variant="bodyMd" tone="subdued">Everything in Free, plus:</Text>
              <List>
                <List.Item>Sticky Add to Cart</List.Item>
                <List.Item>Social Proof Popup</List.Item>
                <List.Item>No &quot;Powered by&quot; branding</List.Item>
                <List.Item>Priority email support</List.Item>
                <List.Item>All future widgets</List.Item>
              </List>
              {!isPro ? (
                <Button variant="primary" size="large" onClick={openPricingPage}>
                  Start 7-day free trial
                </Button>
              ) : (
                <Button variant="plain" tone="critical" onClick={openPricingPage}>
                  Manage subscription
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
