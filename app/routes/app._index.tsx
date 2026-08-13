import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopPlan, listWidgetSettings } from "../db.server";
import { updateApiBaseMetafield } from "../plan.server";
import { blockDeepLink, WIDGET_KEYS, WIDGET_META } from "../widgets";

// The single app embed still exists (see extensions/convertly/blocks/convertly.liquid)
// but no longer renders anything on its own — Sticky Add to Cart and Social
// Proof Popup are the only widgets that use it, and both auto-render once
// enabled below with no theme-editor step. Everything else (Announcement
// Bar, Countdown Timer, Trust Badges) requires its own block to be placed
// in the theme editor — see blockDeepLink below.
const EMBED_HANDLE = "convertly";

function embedDeepLink(shop: string, apiKey: string): string {
  const ref = `${apiKey}/${EMBED_HANDLE}`;
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(ref)}`;
}

// Announcement Bar, Countdown Timer, and Trust Badges ship as real,
// merchant-placeable app blocks (see extensions/convertly/blocks/) —
// REQUIRED, not optional: turning a widget on in the dashboard alone does
// nothing for these three, the block must be dragged into the theme.
// blockDeepLink() (in ../widgets) builds the one-click theme-editor link.

// ─── Loader ───────────────────────────────────────────────────────────────────
// Plan status is read straight from Postgres — it's kept current by the
// APP_SUBSCRIPTIONS_UPDATE webhook (see app/routes/webhooks.tsx) and by the
// billing page's redirect handling, not by polling the Admin API on every
// dashboard visit. That polling used to happen here on every single page
// load; now it only happens where it actually matters (right after the
// merchant picks a plan on Shopify's pricing page).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Shopify redirects back with ?plan_handle after the merchant picks a plan.
  // Forward to the billing page which verifies and persists the plan change.
  const url = new URL(request.url);
  if (url.searchParams.has("plan_handle")) {
    return redirect(`/app/billing?${url.searchParams.toString()}`);
  }

  const [plan, widgets] = await Promise.all([
    getShopPlan(session.shop),
    listWidgetSettings(session.shop),
  ]);

  // NOT plan polling (that's gone, on purpose, and stays gone) — this is a
  // one-off infrastructure write. The storefront embed reads
  // app.metafields.convertly.api_base to know where to fetch widget config
  // from; a shop that never visits the billing page would otherwise never
  // get it set at all, and the embed would silently do nothing forever with
  // no visible error. Fire-and-forget so it never slows down the page.
  admin.graphql(`{ currentAppInstallation { id } }`)
    .then((res: Response) => res.json())
    .then((body: any) => {
      const id = body?.data?.currentAppInstallation?.id;
      if (id) return updateApiBaseMetafield(admin, id);
    })
    .catch((err: unknown) => console.error("[app._index] api_base metafield check failed:", err));

  return json({
    isPro: plan === "pro",
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    widgets,
  });
};

// ─── Dashboard UI ─────────────────────────────────────────────────────────────
export default function Index() {
  const { isPro, shop, apiKey, widgets } = useLoaderData<typeof loader>();

  const activeCount = WIDGET_KEYS.filter((k) => {
    const allowed = !WIDGET_META[k].proOnly || isPro;
    return allowed && widgets[k].enabled;
  }).length;

  const embedUrl = embedDeepLink(shop, apiKey);

  return (
    <Page
      title="Dashboard"
      titleMetadata={<Badge tone="success">Installed</Badge>}
      primaryAction={
        isPro
          ? { content: "Manage subscription", url: "/app/billing" }
          : { content: "Upgrade to Pro", url: "/app/billing" }
      }
      secondaryActions={[
        { content: "Enable in theme", url: embedUrl, target: "_blank" },
      ]}
    >
      <BlockStack gap="500">

        {/* ── Welcome banner ─────────────────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg, #1a2035 0%, #1b3b6f 100%)",
            borderRadius: "12px",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "32px", lineHeight: 1 }}>🚀</span>
            <div>
              <div
                style={{
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "15px",
                  marginBottom: "4px",
                }}
              >
                Welcome to Convertly
              </div>
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                Turn on widgets below, then place their blocks in your theme editor —
                Sticky Add to Cart &amp; Social Proof Popup need this button only; the
                rest need their own block placed too.
              </div>
            </div>
          </div>
          <Button variant="primary" tone="success" url={embedUrl} target="_blank">
            Enable in theme
          </Button>
        </div>

        {/* ── Your Widgets ───────────────────────────────────────────────── */}
        <BlockStack gap="300">
          <InlineStack align="start" gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Your Widgets
            </Text>
            <Badge tone="success">{`${activeCount} enabled`}</Badge>
          </InlineStack>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "12px",
            }}
          >
            {WIDGET_KEYS.map((key) => {
              const meta = WIDGET_META[key];
              const allowed = !meta.proOnly || isPro;
              const isOn = allowed && widgets[key].enabled;
              return (
                <Card key={key}>
                  <BlockStack gap="300">
                    <InlineStack
                      align="space-between"
                      blockAlign="start"
                      wrap={false}
                    >
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        {/* Icon box */}
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "10px",
                            background: isOn ? "#f0fdf4" : "#f5f3ff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "22px",
                            flexShrink: 0,
                          }}
                        >
                          {meta.emoji}
                        </div>
                        {/* Text */}
                        <BlockStack gap="050">
                          <Text as="h3" variant="bodyMd" fontWeight="semibold">
                            {meta.name}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {meta.desc}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      {/* Status badge */}
                      <div style={{ flexShrink: 0, marginLeft: "8px" }}>
                        {!allowed ? (
                          <Badge tone="attention">Pro</Badge>
                        ) : isOn ? (
                          <Badge tone="success">On</Badge>
                        ) : (
                          <Badge>Off</Badge>
                        )}
                      </div>
                    </InlineStack>
                    {allowed && isOn && meta.blockHandle && (
                      <Text as="p" variant="bodySm" tone="caution">
                        Needs a block placed in your theme to show up — see button below.
                      </Text>
                    )}
                    <Button url={allowed ? `/app/widgets/${key}` : "/app/billing"} fullWidth>
                      {allowed ? "Configure" : "Upgrade to unlock"}
                    </Button>
                    {allowed && meta.blockHandle && (
                      <Button url={blockDeepLink(shop, apiKey, key)!} target="_blank" fullWidth>
                        Place block in theme (required)
                      </Button>
                    )}
                  </BlockStack>
                </Card>
              );
            })}
          </div>
        </BlockStack>

        {/* ── Overview stats ─────────────────────────────────────────────── */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Overview
          </Text>
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    WIDGETS ENABLED
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    {activeCount}
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    out of 5
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    SETUP TIME
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    &lt;2 min
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    One block per widget
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    WIDGET SETTINGS
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    Right here
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    No theme editor needed
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>

      </BlockStack>
    </Page>
  );
}
