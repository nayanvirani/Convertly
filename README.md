# Convertly — Shopify conversion widget suite

All-in-one conversion widget suite: Announcement Bar, Countdown Timer, Trust Badges, Sticky Add-to-Cart, and Social Proof Popup. Built as a **Theme App Extension** with a **single app embed** — the merchant enables Convertly in their theme once, and every widget is then turned on/off and configured from the app's own dashboard (Postgres-backed), not from Shopify theme-editor settings panels.

## What's inside

```
extensions/convertly/
├── shopify.extension.toml
├── blocks/
│   └── convertly.liquid           the one app embed — injects config + convertly.js
└── assets/
    ├── cb-core.css                shared styles, all classes prefixed cb-
    └── convertly.js                fetches /api/widgets-config and renders whichever
                                    widgets are enabled, entirely client-side
```

`convertly.js` fetches per-shop widget config (`app/routes/api.widgets-config.tsx`) from this app's own backend and renders each enabled widget's DOM/behavior itself — there's no per-widget Liquid schema anymore. Merchants configure everything (text, colors, which collection, on/off) from **Convertly → Dashboard → Configure** inside the embedded app (`app/routes/app.widgets.$key.tsx`), backed by the `widget_settings` table in Postgres. See `app/widgets.ts` for the full settings shape per widget.

Countdown Timer and Trust Badges (previously drag-and-place app blocks) are now placed via a JS heuristic — next to the buy-now form on product pages by default, with an optional CSS-selector override per widget if a theme's markup doesn't match.

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
3. In the dev store: **Online Store → Themes → Customize → App embeds** — toggle on **Convertly** (once — this covers every widget). Then, in the embedded app dashboard, open each widget's **Configure** page to turn it on and set its text/colors/etc.

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
- **Pro $9.99/mo** — everything, no branding, priority support, 7-day trial
