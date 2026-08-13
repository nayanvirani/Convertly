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
import { WIDGET_KEYS, WIDGET_META } from "../widgets";

// One single app embed now covers every widget — settings live in this
// dashboard (Postgres), not in per-widget theme-editor schema panels. The
// merchant only ever needs to enable the embed once; everything else is
// "Configure" → toggle on → done.
const EMBED_HANDLE = "convertly";

function embedDeepLink(shop: string, apiKey: string): string {
  const ref = `${apiKey}/${EMBED_HANDLE}`;
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(ref)}`;
}

// ─── Loader ───────────────────────────────────────────────────────────────────
// Plan status is read straight from Postgres — it's kept current by the
// APP_SUBSCRIPTIONS_UPDATE webhook (see app/routes/webhooks.tsx) and by the
// billing page's redirect handling, not by polling the Admin API on every
// dashboard visit. That polling used to happen here on every single page
// load; now it only happens where it actually matters (right after the
// merchant picks a plan on Shopify's pricing page).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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
                Step 1: enable Convertly in your theme (once). Step 2: turn on widgets below.
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
                    <Button url={allowed ? `/app/widgets/${key}` : "/app/billing"} fullWidth>
                      {allowed ? "Configure" : "Upgrade to unlock"}
                    </Button>
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
                    One theme step, ever
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
