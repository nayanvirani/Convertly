// Single source of truth for the 5 widgets: their keys, plan gating, and
// default settings. Used by:
//   - the admin settings pages (app/routes/app.widgets.$key.tsx)
//   - the public config API (app/routes/api.widgets-config.tsx)
//   - the dashboard (app/routes/app._index.tsx)
//
// Replaces what used to be 5 separate Liquid {% schema %} blocks — settings
// now live in Postgres and are rendered client-side by the single
// convertly.js asset instead of server-rendered Liquid.

export type WidgetKey = "bar" | "timer" | "trust" | "satc" | "popup";

export const WIDGET_KEYS: WidgetKey[] = ["bar", "timer", "trust", "satc", "popup"];

export const WIDGET_META: Record<
  WidgetKey,
  { name: string; desc: string; emoji: string; proOnly: boolean; blockHandle?: string }
> = {
  bar: {
    name: "Announcement Bar",
    desc: "Rotating messages with optional CTA button. Supports sticky mode.",
    emoji: "📢",
    proOnly: false,
    // Requires the block to be placed in the theme editor — enabling here
    // alone does nothing. blockHandle drives the dashboard's deep link.
    blockHandle: "announcement-bar",
  },
  timer: {
    name: "Countdown Timer",
    desc: "Fixed date or evergreen mode. Drives urgency on product pages.",
    emoji: "⏱",
    proOnly: false,
    // Requires the block to be placed in the theme editor — enabling here
    // alone does nothing. blockHandle drives the dashboard's deep link —
    // same idea as Judge.me's placeable blocks (e.g. their "Star Ratings"
    // block).
    blockHandle: "countdown-timer",
  },
  trust: {
    name: "Trust Badges",
    desc: "Up to 6 customizable badges with your own icons.",
    emoji: "🛡️",
    proOnly: false,
    blockHandle: "trust-badges",
  },
  satc: {
    name: "Sticky Add to Cart",
    desc: "Floating bar appears when the main buy button scrolls out of view. Renders automatically on product pages once enabled — no block placement needed.",
    emoji: "🛒",
    proOnly: true,
  },
  popup: {
    name: "Social Proof Popup",
    desc: "Shows real products from your catalog. No fake data. Renders automatically once enabled — no block placement needed.",
    emoji: "💬",
    proOnly: true,
  },
};

export type BarSettings = {
  messages: string[]; // 1-3 items
  rotateSeconds: number;
  ctaText: string;
  ctaLink: string;
  bgColor: string;
  textColor: string;
  fontSize: number;
  position: "top" | "bottom";
  sticky: boolean;
  dismissible: boolean;
};

export type TimerSettings = {
  label: string;
  mode: "fixed" | "evergreen";
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:MM
  evergreenMinutes: number;
  expiredAction: "hide" | "message";
  expiredText: string;
  bgColor: string;
  textColor: string;
};

export type TrustBadge = { text: string; icon: string };
export type TrustSettings = {
  layout: "horizontal" | "vertical" | "scroll";
  mobileLayout: "same" | "horizontal" | "vertical" | "scroll";
  scrollSpeed: number;
  iconSize: number;
  color: string;
  badges: TrustBadge[]; // up to 6
};

export type SatcSettings = {
  btnText: string;
  btnColor: string;
  afterAdd: "stay" | "cart";
};

export type PopupSettings = {
  collection: string;
  eyebrow: string;
  accentColor: string;
  firstDelay: number;
  showSeconds: number;
  gapSeconds: number;
  maxPopups: number;
};

export type WidgetSettingsMap = {
  bar: BarSettings;
  timer: TimerSettings;
  trust: TrustSettings;
  satc: SatcSettings;
  popup: PopupSettings;
};

export const WIDGET_DEFAULTS: WidgetSettingsMap = {
  bar: {
    messages: ["Free shipping on orders over $50 🚚"],
    rotateSeconds: 5,
    ctaText: "",
    ctaLink: "",
    bgColor: "#1a1a2e",
    textColor: "#ffffff",
    fontSize: 14,
    position: "top",
    sticky: false,
    dismissible: true,
  },
  timer: {
    label: "Sale ends in",
    mode: "fixed",
    endDate: "2026-12-31",
    endTime: "23:59",
    evergreenMinutes: 30,
    expiredAction: "hide",
    expiredText: "Offer has ended",
    bgColor: "#fff3f0",
    textColor: "#c1121f",
  },
  trust: {
    layout: "horizontal",
    mobileLayout: "same",
    scrollSpeed: 20,
    iconSize: 20,
    color: "#333333",
    badges: [
      { text: "Secure checkout", icon: "" },
      { text: "Fast delivery", icon: "" },
      { text: "Easy returns", icon: "" },
      { text: "24/7 support", icon: "" },
    ],
  },
  satc: {
    btnText: "Add to cart",
    btnColor: "#111111",
    afterAdd: "stay",
  },
  popup: {
    collection: "all",
    eyebrow: "🔥 Popular right now",
    accentColor: "#c1121f",
    firstDelay: 8,
    showSeconds: 5,
    gapSeconds: 25,
    maxPopups: 4,
  },
};

export function isWidgetKey(value: string): value is WidgetKey {
  return (WIDGET_KEYS as string[]).includes(value);
}

// Where each placeable block's deep link stages the block by default — the
// bar makes sense on the homepage, timer/trust next to a product's buy-now
// form. Purely a starting point; the merchant can drag it anywhere after.
export const BLOCK_DEEP_LINK_TEMPLATE: Partial<Record<WidgetKey, string>> = {
  bar: "index",
  timer: "product",
  trust: "product",
};

// Deep-links straight into the theme editor with the block already staged
// on a sensible default section, so placing it is one click instead of
// hunting through "Add block" — same idea as Judge.me's placeable blocks.
// Only meaningful for widgets with a blockHandle (bar/timer/trust) — those
// three REQUIRE this, turning the widget on in the dashboard alone does
// nothing without the block placed.
export function blockDeepLink(shop: string, apiKey: string, key: WidgetKey): string | null {
  const blockHandle = WIDGET_META[key].blockHandle;
  if (!blockHandle) return null;
  const template = BLOCK_DEEP_LINK_TEMPLATE[key] ?? "product";
  const ref = `${apiKey}/${blockHandle}`;
  return `https://${shop}/admin/themes/current/editor?template=${template}&addAppBlockId=${encodeURIComponent(ref)}&target=mainSection`;
}
