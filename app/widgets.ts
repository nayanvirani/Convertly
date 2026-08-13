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
  },
  timer: {
    name: "Countdown Timer",
    desc: "Fixed date or evergreen mode. Drives urgency on product pages.",
    emoji: "⏱",
    proOnly: false,
    // Auto-placed near the buy-now form by default. blockHandle lets the
    // dashboard offer a deep link to place it precisely instead — same
    // idea as Judge.me's placeable blocks (e.g. their "Star Ratings" block).
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
    desc: "Floating bar appears when the main buy button scrolls out of view.",
    emoji: "🛒",
    proOnly: true,
  },
  popup: {
    name: "Social Proof Popup",
    desc: "Shows real products from your catalog. No fake data.",
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
  // Placed on product pages, right after this element by default (empty =
  // built-in default: the buy-now form). Override if your theme's markup
  // doesn't match and the timer lands in the wrong spot — same escape hatch
  // review-widget apps like Judge.me expose for this exact problem.
  anchorSelector: string;
};

export type TrustBadge = { text: string; icon: string };
export type TrustSettings = {
  layout: "horizontal" | "vertical" | "scroll";
  mobileLayout: "same" | "horizontal" | "vertical" | "scroll";
  scrollSpeed: number;
  iconSize: number;
  color: string;
  badges: TrustBadge[]; // up to 6
  // Same placement override as the countdown timer — see its comment.
  anchorSelector: string;
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
    anchorSelector: "",
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
    anchorSelector: "",
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
