import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Boostify" },
];

export default function Privacy() {
  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#18150F", lineHeight: 1.7 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F5F3EF; }
        a { color: #1B8FEA; }
        h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.25rem; }
        h2 { font-size: 1.15rem; font-weight: 700; margin: 2rem 0 0.5rem; color: #18150F; }
        p { margin-bottom: 0.75rem; color: #3B3529; font-size: 0.9375rem; }
        ul { margin: 0.5rem 0 0.75rem 1.25rem; color: #3B3529; font-size: 0.9375rem; }
        li { margin-bottom: 0.25rem; }
        hr { border: none; border-top: 1px solid #E3DDD5; margin: 2rem 0; }
      `}</style>

      {/* Nav */}
      <header style={{ background: "#fff", borderBottom: "1px solid #E3DDD5", padding: "0 2rem" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, height: 56 }}>
          <img src="/logo.png" alt="Boostify" width={28} height={28} style={{ borderRadius: 7 }} />
          <a href="/" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#18150F", textDecoration: "none" }}>
            Boostify
          </a>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 2rem 5rem" }}>
        <p style={{ fontSize: "0.8125rem", color: "#7B7367", marginBottom: "0.5rem" }}>Last updated: July 30, 2025</p>
        <h1>Privacy Policy</h1>
        <p style={{ marginTop: "1rem" }}>
          This Privacy Policy describes how Boostify ("we", "our", or "the app") collects, uses, and protects
          information when you install and use our Shopify app.
        </p>

        <hr />

        <h2>1. Information We Collect</h2>
        <p>When you install Boostify, we collect the following information through the Shopify API:</p>
        <ul>
          <li><strong>Shop domain and store information</strong> — your myshopify.com domain, store name, and timezone.</li>
          <li><strong>Access tokens</strong> — OAuth tokens issued by Shopify that allow the app to interact with your store on your behalf. These are stored securely in our database.</li>
          <li><strong>Product data</strong> — for the Social Proof Popup widget, the app reads product titles and images from your catalog to display real (non-fake) items in popups. No product data is stored by the app.</li>
        </ul>
        <p>We do <strong>not</strong> collect personal information about your customers (shoppers), their names, email addresses, payment details, or purchase history.</p>

        <h2>2. How We Use the Information</h2>
        <ul>
          <li>To authenticate your store and maintain a secure session with the Shopify Admin.</li>
          <li>To render the app dashboard inside the Shopify Admin.</li>
          <li>To power the theme extension widgets (Announcement Bar, Countdown Timer, Trust Badges, Sticky Add to Cart, Social Proof Popup) on your storefront.</li>
          <li>To process billing via Shopify's native billing API.</li>
        </ul>
        <p>We do not sell, rent, or share your data with third parties for marketing purposes.</p>

        <h2>3. Data Storage</h2>
        <p>
          Session data (shop domain and access token) is stored in a PostgreSQL database hosted on Railway
          (<a href="https://railway.app" target="_blank" rel="noreferrer">railway.app</a>), a U.S.-based cloud platform.
          Data is encrypted at rest and in transit via HTTPS/TLS.
        </p>
        <p>
          Storefront widget settings are stored as theme extension settings within your Shopify theme — directly on Shopify's
          infrastructure. We have no copy of those settings.
        </p>

        <h2>4. Data Retention</h2>
        <p>
          Session data is retained for as long as the app is installed on your store. When you uninstall the app,
          the <code>app/uninstalled</code> webhook is triggered and your session record is automatically deleted from our database.
        </p>

        <h2>5. Third-Party Services</h2>
        <ul>
          <li>
            <strong>Shopify</strong> — the app operates within the Shopify platform. Shopify's own
            <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noreferrer"> privacy policy</a> applies to
            data held within Shopify.
          </li>
          <li>
            <strong>Railway</strong> — our hosting provider. See Railway's
            <a href="https://railway.app/legal/privacy" target="_blank" rel="noreferrer"> privacy policy</a>.
          </li>
        </ul>

        <h2>6. GDPR / Merchant Data Requests</h2>
        <p>
          We support Shopify's mandatory GDPR webhooks:
        </p>
        <ul>
          <li><strong>customers/data_request</strong> — we do not store any customer personal data, so there is nothing to return.</li>
          <li><strong>customers/redact</strong> — no customer data is held by us; no action is required.</li>
          <li><strong>shop/redact</strong> — upon receiving this webhook, all shop session data is deleted from our database.</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>
          The app does not set cookies on your storefront visitors' browsers. The embedded admin dashboard may use
          session cookies set by Shopify's App Bridge, which are governed by Shopify's cookie policy.
        </p>

        <h2>8. Security</h2>
        <p>
          All communication between your browser, the Shopify Admin, and our servers uses HTTPS/TLS encryption.
          Access tokens are stored server-side and never exposed to the browser.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted at this URL with an updated
          "Last updated" date. Continued use of the app after changes constitutes acceptance of the updated policy.
        </p>

        <h2>10. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or want to request data deletion, please contact us at:{" "}
          <a href="mailto:viraninayan518@gmail.com">viraninayan518@gmail.com</a>.
        </p>

        <hr />
        <p style={{ fontSize: "0.8125rem", color: "#7B7367" }}>
          © {new Date().getFullYear()} Boostify. All rights reserved.
        </p>
      </main>
    </div>
  );
}
