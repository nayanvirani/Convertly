import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }
  return null;
};

export const meta: MetaFunction = () => [
  { title: "Boostify — 5 Shopify Widgets, One Install" },
  {
    name: "description",
    content:
      "Announcement Bar, Countdown Timer, Trust Badges, Sticky Add to Cart, Social Proof Popup. One free Shopify theme extension replaces five apps.",
  },
];

const APP_STORE_URL = "https://apps.shopify.com/conversion-booster-4";

function Logo() {
  return (
    <img
      src="/logo.png"
      alt="Boostify"
      width={32}
      height={32}
      style={{ borderRadius: 7, display: "block", flexShrink: 0 }}
    />
  );
}

const WIDGETS = [
  {
    key: "bar",
    name: "Announcement Bar",
    plan: "Free",
    desc: "Rotate up to three messages at the top of every page. Pair with a CTA button, make it sticky, let visitors dismiss per session.",
    features: ["3 rotating messages", "Optional CTA button & link", "Sticky-on-scroll mode", "Per-session dismiss memory"],
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  },
  {
    key: "timer",
    name: "Countdown Timer",
    plan: "Free",
    desc: "Fixed end date for a sale, or evergreen mode — each visitor gets a fresh timer stored in their localStorage. Configurable expiry action.",
    features: ["Fixed end-date mode", "Evergreen per-visitor mode", "Hide or show message on expiry", "Drop into any section"],
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 3.5"/><path d="M10 2h4"/></svg>`,
  },
  {
    key: "trust",
    name: "Trust Badges",
    plan: "Free",
    desc: "Four editable badges — Secure Checkout, Fast Delivery, Easy Returns, 24/7 Support — with inline SVG icons. Zero image HTTP requests.",
    features: ["4 customizable badge labels", "Inline SVG, zero HTTP cost", "Color & size controls", "Place inside any section"],
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  },
  {
    key: "satc",
    name: "Sticky Add to Cart",
    plan: "Pro",
    desc: "A floating bar slides in when the main buy button scrolls out of view — the add-to-cart is always one tap away on every device.",
    features: ["IntersectionObserver (no jitter)", "Variant selector with live price", "AJAX cart — no page reload", "Mobile safe-area aware"],
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>`,
  },
  {
    key: "popup",
    name: "Social Proof Popup",
    plan: "Pro",
    desc: "Rotating popups featuring real products from any collection you choose — best-sellers, new arrivals. Honest FOMO, no fabricated data.",
    features: ["Any collection as source", "Configurable timing & max count", "Real product images & names", "Zero backend calls needed"],
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  },
];

const STEPS = [
  {
    title: "Install the app",
    desc: "One click from the Shopify App Store. Works on any theme — no developer account needed.",
  },
  {
    title: "Enable widgets in Theme Editor",
    desc: "Go to Online Store → Themes → Customize. Toggle app embeds on, or drag app blocks into any section you choose.",
  },
  {
    title: "Customize and go live",
    desc: "Messages, colors, timing, targets — every setting lives in Shopify's native theme editor. Preview changes in real time before publishing.",
  },
];

export default function Index() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="site">

        {/* Nav */}
        <header className="nav">
          <a href="/" className="nav__brand">
            <Logo />
            <span className="nav__name">Boostify</span>
          </a>
          <nav className="nav__links" aria-label="Site navigation">
            <a href="#widgets">Widgets</a>
            <a href="#setup">Setup</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <a href={APP_STORE_URL} className="btn btn--accent btn--sm" target="_blank" rel="noopener noreferrer">
            Add to Shopify
          </a>
        </header>

        {/* Hero */}
        <section className="hero">
          <div className="hero__copy">
            <span className="hero__eye">Free Shopify Theme Extension</span>
            <h1 className="hero__h1">
              Five tools.<br />
              One install.<br />
              <em>More sales.</em>
            </h1>
            <p className="hero__body">
              Replace five separate apps with a single theme extension. Widgets
              live inside your theme — no server round-trip on every load, no
              subscription stack to juggle.
            </p>
            <div className="hero__ctas">
              <a href={APP_STORE_URL} className="btn btn--accent btn--lg" target="_blank" rel="noopener noreferrer">
                Add to Shopify — It&apos;s free
              </a>
              <a href="#pricing" className="btn btn--ghost btn--lg">
                View pricing
              </a>
            </div>
          </div>

          {/* Browser mockup — all 5 widgets rendered in situ */}
          <div className="mockup" aria-hidden="true" role="presentation">
            <div className="mk-chrome">
              <span className="mk-dot mk-dot--r" />
              <span className="mk-dot mk-dot--y" />
              <span className="mk-dot mk-dot--g" />
              <span className="mk-url">yourstore.com/products/running-sneakers-pro</span>
            </div>
            <div className="mk-ann">
              🚚&nbsp;&nbsp;Free shipping on all orders over $50&nbsp;&nbsp;·&nbsp;&nbsp;<span>Shop the sale →</span>
            </div>
            <div className="mk-body">
              <div className="mk-img" />
              <div className="mk-product">
                <p className="mk-brand">Your Brand</p>
                <p className="mk-title">Running Sneakers Pro</p>
                <p className="mk-price">$129.00</p>
                <div className="mk-countdown">
                  <span className="mk-cd-lbl">Sale ends in</span>
                  <div className="mk-cd-units">
                    <span><b>02</b><small>h</small></span>
                    <span><b>34</b><small>m</small></span>
                    <span><b>17</b><small>s</small></span>
                  </div>
                </div>
                <div className="mk-trust">
                  <span>🛡 Secure</span>
                  <span>🚚 Fast ship</span>
                  <span>↩ Returns</span>
                </div>
                <button className="mk-atc">Add to cart</button>
              </div>
              {/* Sticky ATC */}
              <div className="mk-satc">
                <span>Running Sneakers Pro · $129</span>
                <button>Add to cart</button>
              </div>
              {/* Social proof popup */}
              <div className="mk-popup">
                <div className="mk-popup-img" />
                <div className="mk-popup-text">
                  <span className="mk-popup-eye">🔥 Popular right now</span>
                  <span className="mk-popup-name">Trail Shorts</span>
                </div>
                <span className="mk-popup-x">×</span>
              </div>
            </div>
          </div>
        </section>

        {/* Widgets */}
        <section className="section" id="widgets">
          <div className="inner">
            <header className="sec-hd">
              <span className="label">What's included</span>
              <h2>Five tools that move the needle</h2>
              <p>Three free forever. Two unlock with Pro.</p>
            </header>
            <div className="wgrid">
              {WIDGETS.map((w) => (
                <article className="wcard" key={w.key}>
                  <div className="wcard__icon" dangerouslySetInnerHTML={{ __html: w.icon }} />
                  <h3 className="wcard__name">
                    {w.name}
                    <span className={`badge ${w.plan === "Free" ? "badge--free" : "badge--pro"}`}>
                      {w.plan}
                    </span>
                  </h3>
                  <p className="wcard__desc">{w.desc}</p>
                  <ul className="wcard__feats">
                    {w.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Setup */}
        <section className="section section--alt" id="setup">
          <div className="inner">
            <header className="sec-hd">
              <span className="label">Setup</span>
              <h2>Live in under two minutes</h2>
              <p>No code. No server to maintain. No third-party scripts.</p>
            </header>
            <div className="steps">
              {STEPS.map((s, i) => (
                <div className="step" key={s.title}>
                  <div className="step__n" aria-hidden="true">{i + 1}</div>
                  <div className="step__text">
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="section" id="pricing">
          <div className="inner">
            <header className="sec-hd">
              <span className="label">Pricing</span>
              <h2>Start free, grow into Pro</h2>
            </header>
            <div className="pgrid">
              <div className="pcard">
                <div className="pcard__tier">Free</div>
                <div className="pcard__price">$0<span> / month</span></div>
                <p className="pcard__tag">The essentials, always free</p>
                <ul className="pcard__list">
                  {["Announcement Bar", "Countdown Timer", "Trust Badges"].map((f) => (
                    <li key={f} className="pi pi--y"><span aria-hidden="true">✓</span>{f}</li>
                  ))}
                  {["Sticky Add to Cart", "Social Proof Popup", "Remove branding", "Priority support"].map((f) => (
                    <li key={f} className="pi pi--n"><span aria-hidden="true">—</span>{f}</li>
                  ))}
                </ul>
                <a href={APP_STORE_URL} className="btn btn--outline pcard__cta" target="_blank" rel="noopener noreferrer">
                  Get started free
                </a>
              </div>

              <div className="pcard pcard--pro">
                <div className="pcard__chip">7-day free trial</div>
                <div className="pcard__tier">Pro</div>
                <div className="pcard__price">$9.99<span> / month</span></div>
                <p className="pcard__tag">Everything. Cancel any time.</p>
                <ul className="pcard__list">
                  {[
                    "Everything in Free",
                    "Sticky Add to Cart",
                    "Social Proof Popup",
                    "No “Powered by” branding",
                    "Priority email support",
                    "All future widgets",
                  ].map((f) => (
                    <li key={f} className="pi pi--y"><span aria-hidden="true">✓</span>{f}</li>
                  ))}
                </ul>
                <a href={APP_STORE_URL} className="btn btn--accent pcard__cta" target="_blank" rel="noopener noreferrer">
                  Start free trial
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer__inner">
            <a href="/" className="nav__brand">
              <Logo />
              <span className="nav__name">Boostify</span>
            </a>
            <p className="footer__line">
              Built for Shopify merchants who want more sales without more apps.
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}

const CSS = `
/* ── Tokens ── */
:root {
  --bg:        #F5F3EF;
  --surface:   #FFFFFF;
  --surface2:  #EFECEA;
  --text:      #18150F;
  --muted:     #7B7367;
  --accent:    #1B8FEA;
  --accent-bg: #EBF5FF;
  --border:    #E3DDD5;
  --green:     #1A7048;
  --green-bg:  #EBF5EF;
  --blue:      #2D4DB8;
  --blue-bg:   #EEF1FB;
  --f-serif:   ui-serif, Georgia, "Times New Roman", serif;
  --f-sans:    ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mw:        1120px;
  --r:         12px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:        #110F0D;
    --surface:   #1C1916;
    --surface2:  #211E1A;
    --text:      #F0EBE5;
    --muted:     #9A8F83;
    --accent:    #3BAAFF;
    --accent-bg: #0B2A42;
    --border:    #2E2824;
    --green:     #4ABA7A;
    --green-bg:  #0D2318;
    --blue:      #849BF0;
    --blue-bg:   #111D40;
  }
}
:root[data-theme="dark"] {
  --bg:#110F0D;--surface:#1C1916;--surface2:#211E1A;--text:#F0EBE5;
  --muted:#9A8F83;--accent:#3BAAFF;--accent-bg:#0B2A42;--border:#2E2824;
  --green:#4ABA7A;--green-bg:#0D2318;--blue:#849BF0;--blue-bg:#111D40;
}
:root[data-theme="light"] {
  --bg:#F5F3EF;--surface:#FFFFFF;--surface2:#EFECEA;--text:#18150F;
  --muted:#7B7367;--accent:#1B8FEA;--accent-bg:#EBF5FF;--border:#E3DDD5;
  --green:#1A7048;--green-bg:#EBF5EF;--blue:#2D4DB8;--blue-bg:#EEF1FB;
}

/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:var(--f-sans);background:var(--bg);color:var(--text);
  font-size:16px;line-height:1.65;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
}
a{color:inherit;text-decoration:none}
ul{list-style:none}
button{font-family:inherit;cursor:pointer;border:none;background:none}

/* ── Buttons ── */
.btn {
  display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  padding:.7rem 1.4rem;border-radius:8px;font-family:var(--f-sans);
  font-size:.9rem;font-weight:600;letter-spacing:.01em;
  text-decoration:none;transition:opacity .15s,transform .12s;
  cursor:pointer;border:2px solid transparent;white-space:nowrap;
}
.btn:hover{opacity:.87}
.btn:active{transform:scale(.98)}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.btn--sm{padding:.45rem 1rem;font-size:.83rem}
.btn--disabled{opacity:.55;cursor:not-allowed;pointer-events:none}
.btn--lg{padding:.85rem 1.8rem;font-size:1rem}
.btn--accent{background:var(--accent);color:#fff}
.btn--ghost{background:transparent;color:var(--text);border-color:var(--border)}
.btn--ghost:hover{background:var(--surface)}
.btn--outline{background:transparent;color:var(--accent);border-color:var(--accent)}
.btn--outline:hover{background:var(--accent-bg)}

/* ── Nav ── */
.nav{
  position:sticky;top:0;z-index:100;
  display:flex;align-items:center;gap:1.5rem;
  padding:1rem 2rem;
  background:var(--bg);border-bottom:1px solid var(--border);
  backdrop-filter:blur(8px);
}
.nav__brand{
  display:flex;align-items:center;gap:.6rem;
  font-weight:700;font-size:1rem;letter-spacing:-.01em;
  color:var(--text);flex-shrink:0;
}
.nav__name{font-size:.95rem}
.nav__links{
  display:flex;align-items:center;gap:1.75rem;margin-left:auto;
}
.nav__links a{font-size:.875rem;font-weight:500;color:var(--muted);transition:color .15s}
.nav__links a:hover{color:var(--text)}
.nav > .btn{margin-left:1rem;flex-shrink:0}
.nav__coming-soon{
  margin-left:1rem;flex-shrink:0;
  font-size:.8rem;font-weight:600;letter-spacing:.03em;
  padding:.45rem 1rem;border-radius:8px;
  background:var(--surface2);color:var(--muted);
  border:1px dashed var(--border);
}

/* ── Hero ── */
.hero{
  display:grid;grid-template-columns:1fr 1fr;
  gap:3rem;align-items:center;
  max-width:var(--mw);margin:0 auto;
  padding:5rem 2rem;
}
.hero__eye{
  display:inline-block;font-size:.75rem;font-weight:700;
  letter-spacing:.09em;text-transform:uppercase;
  color:var(--accent);margin-bottom:1.25rem;
}
.hero__h1{
  font-family:var(--f-serif);
  font-size:clamp(2.4rem,4.5vw,3.75rem);
  font-weight:700;line-height:1.08;
  letter-spacing:-.025em;text-wrap:balance;
  margin-bottom:1.5rem;
}
.hero__h1 em{font-style:italic;color:var(--accent)}
.hero__body{
  font-size:1.05rem;line-height:1.72;color:var(--muted);
  max-width:44ch;margin-bottom:2rem;
}
.hero__ctas{display:flex;gap:.75rem;flex-wrap:wrap}

/* ── Browser Mockup ── */
.mockup{
  border-radius:var(--r);overflow:hidden;
  border:1px solid var(--border);
  box-shadow:0 24px 64px -16px rgba(0,0,0,.18),0 4px 16px -4px rgba(0,0,0,.08);
  background:#fff;font-size:.7rem;
  /* always show as light storefront regardless of user theme */
  color:#18150F;
}
.mk-chrome{
  display:flex;align-items:center;gap:.4rem;
  padding:.5rem .75rem;
  background:#F0EDEA;border-bottom:1px solid #DDD9D3;
}
.mk-dot{
  width:10px;height:10px;border-radius:50%;flex-shrink:0;
}
.mk-dot--r{background:#F87171}
.mk-dot--y{background:#FBBF24}
.mk-dot--g{background:#34D399}
.mk-url{
  flex:1;text-align:center;font-size:.62rem;color:#888;
  background:#E8E4DF;border-radius:4px;padding:.18rem .5rem;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.mk-ann{
  background:#1a1a2e;color:#fff;
  text-align:center;padding:.4rem .75rem;font-size:.65rem;
}
.mk-ann span{color:#a8d8ea}
.mk-body{
  display:grid;grid-template-columns:5fr 7fr;
  padding:.75rem .75rem 2.5rem;position:relative;gap:0;
}
.mk-img{
  background:linear-gradient(135deg,#E8E4DE 0%,#D0CBC2 100%);
  border-radius:6px;min-height:145px;margin-right:.75rem;
}
.mk-product{display:flex;flex-direction:column;gap:.3rem}
.mk-brand{font-size:.58rem;color:#888;text-transform:uppercase;letter-spacing:.06em}
.mk-title{font-family:var(--f-serif);font-size:.85rem;font-weight:700;line-height:1.2;color:#18150F}
.mk-price{font-size:.85rem;font-weight:700;color:#18150F}
.mk-countdown{
  background:#fff3f0;border-radius:4px;
  padding:.3rem .45rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;
}
.mk-cd-lbl{font-size:.6rem;color:#c1121f;font-weight:500}
.mk-cd-units{display:flex;gap:.25rem}
.mk-cd-units span{font-size:.72rem;font-weight:700;color:#c1121f}
.mk-cd-units b{font-variant-numeric:tabular-nums}
.mk-cd-units small{font-size:.55rem;font-weight:500;margin-left:1px}
.mk-trust{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.1rem}
.mk-trust span{font-size:.6rem;color:#7B7367}
.mk-atc{
  margin-top:.35rem;background:#18150F;color:#fff;
  border-radius:5px;padding:.32rem .6rem;
  font-size:.68rem;font-weight:600;cursor:default;width:100%;
}
.mk-satc{
  position:absolute;bottom:0;left:0;right:0;
  background:#fff;border-top:1px solid #E3DDD5;
  padding:.4rem .75rem;display:flex;
  align-items:center;justify-content:space-between;gap:.5rem;
}
.mk-satc span:first-child{font-size:.6rem;color:#7B7367}
.mk-satc button{
  background:#1B8FEA;color:#fff;border-radius:4px;
  padding:.22rem .6rem;font-size:.63rem;font-weight:600;cursor:default;
}
.mk-popup{
  position:absolute;bottom:2.6rem;left:.5rem;
  background:#fff;border:1px solid #E3DDD5;border-radius:8px;
  box-shadow:0 6px 20px rgba(0,0,0,.13);
  padding:.4rem .5rem;display:flex;align-items:center;
  gap:.4rem;max-width:145px;
}
.mk-popup-img{
  width:30px;height:30px;border-radius:4px;
  background:linear-gradient(135deg,#ddd 0%,#ccc 100%);flex-shrink:0;
}
.mk-popup-text{display:flex;flex-direction:column;gap:1px;min-width:0}
.mk-popup-eye{font-size:.55rem;color:#c1121f;font-weight:600}
.mk-popup-name{font-size:.65rem;font-weight:600;color:#18150F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mk-popup-x{font-size:.85rem;color:#aaa;cursor:default;flex-shrink:0}

/* ── Sections ── */
.section{padding:5rem 2rem}
.section--alt{background:var(--surface2)}
.inner{max-width:var(--mw);margin:0 auto}

.sec-hd{text-align:center;margin-bottom:3.5rem}
.sec-hd h2{
  font-family:var(--f-serif);
  font-size:clamp(1.75rem,3.5vw,2.5rem);
  font-weight:700;letter-spacing:-.02em;
  line-height:1.15;text-wrap:balance;
  margin:.5rem 0 .75rem;
}
.sec-hd p{font-size:1rem;color:var(--muted);max-width:50ch;margin:0 auto}

.label{
  display:inline-block;font-size:.72rem;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:var(--accent);
}

/* ── Badges ── */
.badge{
  display:inline-block;padding:.15rem .55rem;border-radius:20px;
  font-size:.7rem;font-weight:700;letter-spacing:.03em;
  vertical-align:middle;margin-left:.5rem;
}
.badge--free{background:var(--green-bg);color:var(--green)}
.badge--pro{background:var(--blue-bg);color:var(--blue)}

/* ── Widget Grid ── */
.wgrid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
  gap:1.25rem;
}
.wcard{
  background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r);padding:1.5rem;
  display:flex;flex-direction:column;gap:.75rem;
  transition:box-shadow .2s,border-color .2s;
}
.wcard:hover{
  box-shadow:0 8px 30px -8px rgba(0,0,0,.1);
  border-color:var(--accent);
}
.wcard__icon{
  width:40px;height:40px;display:flex;
  align-items:center;justify-content:center;
  background:var(--accent-bg);border-radius:10px;
  color:var(--accent);padding:8px;flex-shrink:0;
}
.wcard__icon svg{width:100%;height:100%}
.wcard__name{
  font-size:1rem;font-weight:700;color:var(--text);
  letter-spacing:-.01em;display:flex;align-items:center;flex-wrap:wrap;gap:.25rem;
}
.wcard__desc{font-size:.875rem;color:var(--muted);line-height:1.65}
.wcard__feats{display:flex;flex-direction:column;gap:.3rem;margin-top:.1rem}
.wcard__feats li{
  font-size:.8rem;color:var(--muted);
  padding-left:1rem;position:relative;
}
.wcard__feats li::before{
  content:"·";position:absolute;left:0;
  color:var(--accent);font-weight:700;
}

/* ── Steps ── */
.steps{
  display:flex;flex-direction:column;gap:2.25rem;
  max-width:620px;margin:0 auto;
}
.step{display:flex;gap:1.5rem;align-items:flex-start}
.step__n{
  width:38px;height:38px;border-radius:50%;
  background:var(--accent);color:#fff;
  font-size:.9rem;font-weight:800;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.step__text h3{
  font-family:var(--f-serif);font-size:1.15rem;font-weight:700;
  letter-spacing:-.01em;margin-bottom:.35rem;color:var(--text);
}
.step__text p{font-size:.925rem;color:var(--muted);line-height:1.65}

/* ── Pricing ── */
.pgrid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:1.5rem;max-width:800px;margin:0 auto;
}
.pcard{
  background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r);padding:2rem;
  display:flex;flex-direction:column;gap:1rem;
  position:relative;
}
.pcard--pro{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.pcard__chip{
  background:var(--accent);color:#fff;
  font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  padding:.22rem .65rem;border-radius:20px;width:fit-content;
}
.pcard__tier{font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.pcard__price{
  font-family:var(--f-serif);font-size:2.25rem;
  font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--text);
}
.pcard__price span{font-size:1rem;font-weight:400;color:var(--muted);font-family:var(--f-sans);letter-spacing:0}
.pcard__tag{font-size:.875rem;color:var(--muted)}
.pcard__list{display:flex;flex-direction:column;gap:.65rem;flex:1}
.pi{display:flex;align-items:center;gap:.65rem;font-size:.875rem}
.pi span{
  width:18px;height:18px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:.65rem;font-weight:700;flex-shrink:0;
}
.pi--y span{background:var(--green-bg);color:var(--green)}
.pi--n{color:var(--muted)}
.pi--n span{background:var(--surface2);color:var(--muted)}
.pcard__cta{width:100%;justify-content:center;margin-top:.5rem}

/* ── Footer ── */
.footer{border-top:1px solid var(--border);padding:2.5rem 2rem}
.footer__inner{
  max-width:var(--mw);margin:0 auto;
  display:flex;align-items:center;gap:2rem;flex-wrap:wrap;
}
.footer__line{font-size:.875rem;color:var(--muted);margin-left:auto}

/* ── Responsive ── */
@media (max-width:900px){
  .hero{grid-template-columns:1fr;padding:3.5rem 1.5rem;gap:2.5rem}
  .mockup{max-height:360px;overflow:hidden}
  .pgrid{grid-template-columns:1fr}
}
@media (max-width:640px){
  .nav{padding:.875rem 1.25rem}
  .nav__links{display:none}
  .nav__name{display:none}
  .section{padding:3.5rem 1.25rem}
  .wgrid{grid-template-columns:1fr}
  .hero__ctas{flex-direction:column}
  .hero__ctas .btn{width:100%;text-align:center}
  .footer__line{margin-left:0}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none !important;animation:none !important}
  html{scroll-behavior:auto}
}
`;
