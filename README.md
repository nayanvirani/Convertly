# Convertly — Shopify conversion widget suite

All-in-one conversion widget suite: Announcement Bar, Countdown Timer, Trust Badges, Sticky Add-to-Cart, and Social Proof Popup. Built as a **Theme App Extension**. Every widget is turned on/off and configured from the app's own dashboard (Postgres-backed), not from Shopify theme-editor settings panels — but three of the five additionally require a **placed app block** before they render at all (see below).

## Placement model — two kinds of widgets

- **Require a placed block** (Announcement Bar, Countdown Timer, Trust Badges): enabling the widget in the dashboard is not enough by itself — the merchant must also drag the widget's app block into the theme editor (`blocks/announcement-bar.liquid`, `blocks/countdown-timer.liquid`, `blocks/trust-badges.liquid` — all `target: "section"`). No block placed = nothing renders, on purpose. Same idea as Judge.me's placeable blocks (e.g. their "Star Ratings" block) — exact placement is an explicit merchant choice, never guessed at. The dashboard's "Place block in theme" button deep-links straight into the theme editor with the block staged on a sensible default section.
- **Auto-render once enabled** (Sticky Add to Cart, Social Proof Popup): no block, no theme-editor step — these render themselves via the single app embed (`blocks/convertly.liquid`, `target: "body"`) the moment they're toggled on. There's nowhere more "placed" a floating sticky bar or corner popup could be anyway.

## What's inside

```
extensions/convertly/
├── shopify.extension.toml
├── blocks/
│   ├── convertly.liquid           the app embed — injects config + convertly.js (SATC/popup only)
│   ├── announcement-bar.liquid    placeable block, required for the bar to render
│   ├── countdown-timer.liquid     placeable block, required for the timer to render
│   └── trust-badges.liquid        placeable block, required for badges to render
└── assets/
    ├── cb-core.css                shared styles, all classes prefixed cb-
    └── convertly.js                fetches /api/widgets-config and renders whichever
                                    widgets are enabled, entirely client-side
```

`convertly.js` fetches per-shop widget config (`app/routes/api.widgets-config.tsx`) from this app's own backend and renders each enabled widget's DOM/behavior itself — there's no per-widget Liquid schema. Merchants configure everything (text, colors, which collection, on/off) from **Convertly → Dashboard → Configure** inside the embedded app (`app/routes/app.widgets.$key.tsx`), backed by the `widget_settings` table in Postgres. See `app/widgets.ts` for the full settings shape per widget, and `blockDeepLink()`/`WIDGET_META[key].blockHandle` there for which widgets require a block and where their deep link stages it.

For the bar/timer/trust blocks, `convertly.js` looks for the block's `[data-convertly-widget]` mount point and renders into it — if that mount point isn't on the page (block never placed), the widget renders nothing at all. There is no auto-placement fallback.

## Feature notes

- **Announcement bar** — up to 3 rotating messages, optional CTA button, sticky mode, dismiss button remembered per session.
- **Countdown timer** — fixed end date or evergreen mode (each visitor gets their own timer stored in localStorage — great for urgency). Configurable expiry behavior.
- **Trust badges** — up to 6 editable badges; default checkmark icon, or paste your own icon URL per badge.
- **Sticky add-to-cart** — appears when the main buy button scrolls out of view (IntersectionObserver). Variant selector, live price, AJAX add-to-cart, cart count refresh, mobile safe-area aware.
- **Social proof popup** — shows **real products** from a collection the merchant picks (e.g. best-sellers) with a "Popular right now" label. Honest social proof with zero backend. True "X just bought this" popups need an orders webhook + server — that's your v1.1 paid upsell, not the MVP.

## Run it locally

1. Install prerequisites: Node 18+, and a free [Shopify Partner account](https://partners.shopify.com) with a development store.
2. Create the app shell and drop the extension in:
   ```bash
   shopify app init            # choose "Start with Remix" (or the minimal template)
   # copy the extensions/convertly folder from this project into your app's extensions/
   shopify app dev             # opens a tunnel + installs on your dev store
   ```
3. In the dev store: **Online Store → Themes → Customize → App embeds** — toggle on **Convertly** (needed for Sticky Add to Cart / Social Proof Popup). Then, in the embedded app dashboard, open each widget's **Configure** page to turn it on and set its text/colors/etc. — and for Announcement Bar, Countdown Timer, and Trust Badges, use the **Place block in theme** button (or add the block manually from **Add block → Apps**) or nothing will show up.

## Before submitting to the App Store

- Test on the free themes reviewers use: **Dawn** first, then Sense, Craft, Refresh. Theme conflicts are the #1 source of 1-star reviews.
- Add an app listing: 5+ screenshots (before/after per widget), a 30–60s demo video, and copy that leads with "replace 5 apps with 1".
- Shopify requires the embedded app to load and show *something* — a simple welcome page with setup instructions ("turn widgets on in your theme editor") satisfies review for a theme-extension app.
- Fill in mandatory webhooks (customer data erasure etc.) — the CLI template includes them.

## Roadmap (each release = a marketing announcement)

- **v1.1** — Real-time sales popups via `orders/create` webhook (needs a small server + DB; this is the Pro-plan hook)
- **v1.2** — Free-shipping progress bar mode for the announcement bar (reads cart total from `/cart.js`)
- **v1.3** — Scheduling (start/end dates per widget), geo-targeting
- **v1.4** — Analytics dashboard: views, clicks, add-to-carts per widget

## Pricing suggestion

- **Free** — Announcement bar + trust badges, small "Powered by" link
- **Pro $49/mo or $530/yr** (~10% off annual) — everything, no branding, priority support, 7-day trial
