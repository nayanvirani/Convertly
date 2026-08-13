import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getWidgetAnalytics } from "../db.server";

// ─── Widget metadata ──────────────────────────────────────────────────────────
const WIDGET_META: Record<
  string,
  { name: string; emoji: string; hasClicks: boolean }
> = {
  bar:   { name: "Announcement Bar",    emoji: "📢", hasClicks: true  },
  timer: { name: "Countdown Timer",     emoji: "⏱",  hasClicks: false },
  trust: { name: "Trust Badges",        emoji: "🛡️", hasClicks: false },
  satc:  { name: "Sticky Add to Cart",  emoji: "🛒", hasClicks: true  },
  popup: { name: "Social Proof Popup",  emoji: "💬", hasClicks: true  },
};

const ALL_WIDGETS = ["bar", "timer", "trust", "satc", "popup"];

// ─── Loader ───────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rows = await getWidgetAnalytics(session.shop);

  // Pivot into { widget → { view: n, click: n } }
  const stats: Record<string, { views: number; clicks: number }> = {};
  for (const w of ALL_WIDGETS) stats[w] = { views: 0, clicks: 0 };

  for (const row of rows) {
    if (!stats[row.widget]) continue;
    if (row.event_type === "view")  stats[row.widget].views  = row.count;
    if (row.event_type === "click") stats[row.widget].clicks = row.count;
  }

  const totalViews  = ALL_WIDGETS.reduce((s, w) => s + stats[w].views,  0);
  const totalClicks = ALL_WIDGETS.reduce((s, w) => s + stats[w].clicks, 0);

  return json({ stats, totalViews, totalClicks });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function ctrPct(views: number, clicks: number) {
  if (!views || !clicks) return "—";
  return (clicks / views * 100).toFixed(1) + "%";
}

// ─── UI ───────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { stats, totalViews, totalClicks } = useLoaderData<typeof loader>();
  const hasAnyData = totalViews > 0 || totalClicks > 0;

  return (
    <Page
      title="Analytics"
      backAction={{ content: "Dashboard", url: "/app" }}
      titleMetadata={hasAnyData ? undefined : <Badge>No data yet</Badge>}
    >
      <BlockStack gap="500">

        {/* ── Summary row ────────────────────────────────────────────────── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">TOTAL VIEWS</Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {fmtNum(totalViews)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  across all 5 widgets
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">TOTAL CLICKS</Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {fmtNum(totalClicks)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  CTA + cart + popup clicks
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">OVERALL CTR</Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {ctrPct(totalViews, totalClicks)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  clicks ÷ views
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ── Per-widget breakdown ───────────────────────────────────────── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Widget breakdown</Text>

            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 100px 100px",
              gap: "8px",
              borderBottom: "1px solid var(--p-color-border)",
              paddingBottom: "8px",
            }}>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">Widget</Text>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold" alignment="end">Views</Text>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold" alignment="end">Clicks</Text>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold" alignment="end">CTR</Text>
            </div>

            {/* Rows */}
            {ALL_WIDGETS.map((key) => {
              const meta = WIDGET_META[key];
              const { views, clicks } = stats[key];
              return (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 100px 100px",
                    gap: "8px",
                    alignItems: "center",
                    borderBottom: "1px solid var(--p-color-border-subdued)",
                    paddingBottom: "12px",
                  }}
                >
                  {/* Widget name */}
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{ fontSize: "18px" }}>{meta.emoji}</span>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {meta.name}
                    </Text>
                  </InlineStack>

                  {/* Views */}
                  <Text as="p" variant="bodyMd" alignment="end">
                    {fmtNum(views)}
                  </Text>

                  {/* Clicks */}
                  <Text
                    as="p"
                    variant="bodyMd"
                    alignment="end"
                    tone={!meta.hasClicks ? "subdued" : undefined}
                  >
                    {meta.hasClicks ? fmtNum(clicks) : "—"}
                  </Text>

                  {/* CTR */}
                  <Text
                    as="p"
                    variant="bodyMd"
                    alignment="end"
                    tone={
                      meta.hasClicks && views > 0 && clicks > 0
                        ? "success"
                        : "subdued"
                    }
                  >
                    {meta.hasClicks ? ctrPct(views, clicks) : "—"}
                  </Text>
                </div>
              );
            })}

            {/* Empty state */}
            {!hasAnyData && (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  No data yet — data appears here once your widgets are live in
                  your store.
                </Text>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* ── How tracking works ─────────────────────────────────────────── */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">How tracking works</Text>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                <strong>Views</strong> — counted once per visitor per session when
                the widget appears on the page. Refreshing does not double-count.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                <strong>Clicks</strong> — counted when a visitor clicks the
                Announcement Bar CTA, the Sticky Add to Cart button, or a Social
                Proof Popup. Countdown Timer and Trust Badges are display-only
                so they have no click metric.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                <strong>CTR</strong> — click-through rate = clicks ÷ views × 100.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
