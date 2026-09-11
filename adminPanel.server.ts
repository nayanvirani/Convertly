// The hidden admin dashboard, rendered entirely server-side as plain HTML —
// deliberately NOT a Remix route. Remix ships its route manifest (route
// ids, paths) to the client on every page load for client-side navigation;
// if this were a Remix route, "routes/admin" etc. would be visible in the
// public JS bundle even behind the secret-URL gate, telling any curious
// merchant that a hidden admin panel exists. Plain Express handlers leave
// zero trace in anything shipped to the browser.
//
// No client JS, no hydration, no framework — native <form method="post">
// submits and full page loads. That's fine for a low-traffic internal tool
// and it sidesteps an entire class of routing bugs.

import type { Request, Response } from "express";
import {
  clearPermanentSessions,
  getEnrichedShops,
  migrateOfflineTokens,
  enrichedShopsToCSV,
  purgeUninstalledShop,
  type EnrichedShop,
  type MigrationResult,
} from "./app/admin.server";
import { pool } from "./app/db.server";
import {
  listAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  verifyAdminCredentials,
  createSessionToken,
  SESSION_MAX_AGE_SEC,
} from "./app/adminAuth.server";
import {
  getAppTransactions,
  groupByMonth,
  isPartnerApiConfigured,
} from "./app/partner.server";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function layout(opts: { title: string; badge: string; adminPath: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(opts.title)} — Convertly</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #F5F3EF;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #18150F;
  }
  header {
    background: #0F1C3F; padding: 0 32px; height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 10;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-title { font-size: 15px; font-weight: 700; color: #fff; }
  .badge {
    background: rgba(27,143,234,0.25); color: #4DBDFF;
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; letter-spacing: 0.05em;
  }
  header a, header button {
    font-size: 13px; font-weight: 700; border-radius: 8px; padding: 7px 16px;
    text-decoration: none; cursor: pointer; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.08); color: #fff; font-family: inherit;
  }
  header .export { background: #22D47E; color: #0B1730; border: none; }
  main { max-width: 1280px; margin: 0 auto; padding: 32px 24px; }
  .narrow { max-width: 720px; }
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat-card { background: #fff; border: 1px solid #E3DDD5; border-radius: 12px; padding: 18px 20px; }
  .stat-hint { font-size: 11px; color: #AAA49C; margin-top: 6px; }
  .stat-label {
    font-size: 11px; font-weight: 700; color: #7B7367;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .stat-value { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; margin-top: 4px; }
  .stat-value.text { font-size: 28px; }
  .card { background: #fff; border: 1px solid #E3DDD5; border-radius: 12px; overflow: hidden; }
  .card + .card { margin-top: 20px; }
  .card-header {
    padding: 16px 24px; border-bottom: 1px solid #E3DDD5;
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-title { font-size: 15px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700;
    color: #7B7367; text-transform: uppercase; letter-spacing: 0.06em;
    background: #FAFAF8; border-bottom: 1px solid #E3DDD5; white-space: nowrap;
  }
  td { padding: 11px 14px; border-bottom: 1px solid #F0EDE9; vertical-align: middle; }
  tr:nth-child(even) td { background: #FAFAF8; }
  a.link { color: #1B8FEA; font-weight: 600; text-decoration: none; font-size: 12px; }
  .badge-pill {
    font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px; display: inline-block;
  }
  .badge-green  { background: #EBF5EF; color: #1A7048; }
  .badge-red    { background: #FEE2E2; color: #B91C1C; }
  .badge-purple { background: #EDE9FE; color: #6D28D9; }
  .badge-orange { background: #FEF3C7; color: #B45309; }
  .badge-gray   { background: #F3F4F6; color: #6B7280; }
  .banner {
    border-radius: 10px; padding: 14px 18px; font-size: 14px; margin-bottom: 20px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .banner.warn { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
  .banner.ok   { background: #EBF5EF; color: #1A7048; border: 1px solid #BBF7D0; }
  .banner.err  { background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA; }
  .btn {
    border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: inherit; color: #fff;
  }
  .btn.orange { background: #B45309; }
  .btn.red    { background: #B91C1C; }
  .btn.blue   { background: #1B8FEA; }
  .empty { padding: 48px 24px; text-align: center; color: #7B7367; font-size: 14px; }
  form.inline { display: inline; }
  .form-card { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; max-width: 360px; }
  label.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  input.text {
    border: 1px solid #E3DDD5; border-radius: 8px; padding: 9px 12px; font-size: 14px; font-family: inherit;
  }
  .you-badge {
    margin-left: 8px; background: #EDE9FE; color: #6D28D9;
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
  }
  .hint { font-size: 12px; color: #7B7367; margin: 8px 0 0; }
</style>
</head>
<body>
<header>
  <div class="header-left">
    <span class="header-title">Convertly</span>
    <span class="badge">${esc(opts.badge)}</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px;">
    <a href="${esc(opts.adminPath)}">Dashboard</a>
    <a href="${esc(opts.adminPath)}/revenue">Revenue</a>
    <a href="${esc(opts.adminPath)}/users">Admin users</a>
    <a class="export" href="${esc(opts.adminPath)}/export">↓ Export CSV</a>
    <form class="inline" method="post" action="${esc(opts.adminPath)}/logout">
      <button type="submit">Sign out</button>
    </form>
  </div>
</header>
<main>${opts.body}</main>
</body>
</html>`;
}

function loginLayout(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Sign in — Convertly</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #0F1C3F;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    background: #fff; border-radius: 14px; padding: 36px 32px; width: 100%; max-width: 360px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  }
  .brand { font-size: 17px; font-weight: 800; color: #18150F; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #7B7367; margin-bottom: 24px; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #18150F; }
  input {
    width: 100%; border: 1px solid #E3DDD5; border-radius: 8px; padding: 10px 12px;
    font-size: 14px; font-family: inherit; margin-bottom: 16px;
  }
  button {
    width: 100%; background: #1B8FEA; color: #fff; border: none; border-radius: 8px;
    padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .err {
    background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA; border-radius: 8px;
    padding: 10px 12px; font-size: 13px; margin-bottom: 16px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">Convertly</div>
    <div class="sub">Admin sign in</div>
    ${body}
  </div>
</body>
</html>`;
}

function formatExpires(ts: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d.getTime())) return "—";
  if (d.getFullYear() > 2100) return "No expiry";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Plan always comes from our DB (webhook-driven) now, never a live API
// call, so it's always confidently Pro/Free/Trial — no "API Error" state.
function planBadge(shop: EnrichedShop): string {
  if (shop.isPro && shop.trialActive) return `<span class="badge-pill badge-purple">Trial</span>`;
  if (shop.isPro) return `<span class="badge-pill badge-purple">Pro</span>`;
  return `<span class="badge-pill badge-orange">Free</span>`;
}

function billingCell(shop: EnrichedShop): string {
  if (!shop.isPro) return `<span style="color:#aaa;">—</span>`;
  const interval = shop.billingInterval === "annual" ? "Yearly" : shop.billingInterval === "monthly" ? "Monthly" : null;
  if (!interval) return `<span style="color:#aaa;" title="Live billing call didn't return interval data">Unknown</span>`;
  return esc(interval);
}

// Distinct from the Plan badge above — this is about whether the shop is
// still actually installed, sourced from a live 401/403/404 rather than
// our own (webhook-driven, and therefore blind to a webhook that silently
// never ran) database row. A row can show "Pro" and "Likely uninstalled"
// at the same time — that combination IS the bug this is meant to catch.
function statusBadge(shop: EnrichedShop): string {
  if (shop.likelyUninstalled) return `<span class="badge-pill badge-red">Likely uninstalled</span>`;
  if (!shop.accessToken) return `<span class="badge-pill badge-gray">No token</span>`;
  return `<span class="badge-pill badge-green">Installed</span>`;
}

function migrationBanner(results: MigrationResult[]): string {
  const migrated = results.filter((r) => r.status === "migrated").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const already = results.filter((r) => r.status === "already_expiring").length;
  const success = migrated > 0 || (failed === 0 && already > 0);
  const errRows = results
    .filter((r) => r.status === "failed")
    .map((r) => `<div style="margin-top:4px; font-family:monospace; font-size:11px; word-break:break-all;">${esc(r.shop)}: ${esc(r.error)}</div>`)
    .join("");
  return `<div class="banner ${success ? "ok" : "err"}" style="align-items:flex-start;">
    <div style="flex:1;">
      <strong>Token exchange result.</strong>
      ${migrated > 0 ? `✓ ${migrated} migrated. Monitoring warning clears in ~24h. ` : ""}
      ${already > 0 ? `✓ ${already} already using expiring tokens. ` : ""}
      ${failed > 0 ? `✗ ${failed} failed — Cloudflare blocked the server-to-server call.${errRows}
        <div style="margin-top:10px; font-size:13px;">Use <strong>"Clear &amp; force re-auth"</strong> instead — it deletes the old session so the next app visit issues a new expiring token automatically.</div>` : ""}
    </div>
  </div>`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function renderDashboardBody(adminPath: string, resultBanner: string): Promise<string> {
  let shops: EnrichedShop[] = [];
  let error: string | null = null;
  try {
    shops = await getEnrichedShops();
  } catch (e: any) {
    error = String(e.message ?? e);
  }

  // Total Installs (all-time rows) = Currently Installed + Likely
  // Uninstalled, always — and Currently Installed = Pro + Free, always.
  // Every stat card below is one term in that breakdown, on purpose, so
  // the numbers reconcile at a glance instead of a Total that silently
  // includes shops no other card accounts for.
  const total = shops.length;
  const uninstalledCount = shops.filter((s) => s.likelyUninstalled).length;
  const counted = shops.filter((s) => !s.likelyUninstalled); // "Currently Installed"
  const currentlyInstalled = counted.length;
  const proCount = counted.filter((s) => s.isPro).length;
  const trialCount = counted.filter((s) => s.trialActive).length;
  const freeCount = currentlyInstalled - proCount;
  // Per-shop, using the real billing interval when the live call returned
  // one (annual ≈ $530/12 per month, not $49) — only falls back to
  // assuming $49/mo for a Pro shop where that call didn't succeed this
  // load, so this is no longer a blanket "every Pro shop pays $49"
  // approximation once interval data is actually available.
  const proShops = counted.filter((s) => s.isPro);
  const mrr = proShops.reduce((sum, s) => sum + (s.billingInterval === "annual" ? 530 / 12 : 49), 0);
  const mrrIsExact = proShops.every((s) => s.billingInterval !== null);
  // Soonest upcoming charge across every active Pro subscription — same
  // "next billing" date shown per-row in the table, just surfaced as a
  // single at-a-glance number for whichever shop renews soonest.
  const nextRenewalShop = proShops
    .filter((s) => s.currentPeriodEnd)
    .sort((a, b) => new Date(a.currentPeriodEnd!).getTime() - new Date(b.currentPeriodEnd!).getTime())[0];
  const needsMigrationCount = shops.filter((s) => s.accessToken && !s.refreshToken).length;
  const needsMigration = needsMigrationCount > 0;

  // Real payment count, from Shopify's own Partner API transaction
  // records — not derived from our Pro/Free counts above, which only ever
  // reflect the CURRENT moment (they say nothing about a shop that paid
  // for 3 months and cancelled last week, for instance).
  const partnerConfigured = isPartnerApiConfigured();
  const transactions = partnerConfigured ? await getAppTransactions() : [];
  const totalPayments = transactions.length;

  const rows = shops
    .map(
      (s, i) => `<tr>
      <td>${i + 1}</td>
      <td><span style="font-weight:600; font-size:13px;">${s.storeName ? esc(s.storeName) : `<span style="color:#aaa;">—</span>`}</span></td>
      <td><a class="link" href="https://${esc(s.shop)}/admin" target="_blank" rel="noreferrer">${esc(s.shop)}</a></td>
      <td>${s.ownerName ? esc(s.ownerName) : `<span style="color:#aaa;">—</span>`}</td>
      <td>${s.ownerEmail ? `<a class="link" href="mailto:${esc(s.ownerEmail)}">${esc(s.ownerEmail)}</a>` : `<span style="color:#aaa;">—</span>`}</td>
      <td>${planBadge(s)}</td>
      <td>${billingCell(s)}</td>
      <td style="white-space:nowrap; color:#7B7367; font-size:12px;">${s.isPro ? formatDate(s.currentPeriodEnd) : `<span style="color:#aaa;">—</span>`}</td>
      <td>${statusBadge(s)}</td>
      <td style="white-space:nowrap; color:#7B7367; font-size:12px;">${formatExpires(s.expires)}</td>
      <td>${s.likelyUninstalled ? `
        <form class="inline" method="post" action="${esc(adminPath)}" onsubmit="return confirm('Remove all stored data for ${esc(s.shop)}? This deletes its session, plan, and widget settings — only do this if the shop has genuinely uninstalled.');">
          <input type="hidden" name="intent" value="purge" />
          <input type="hidden" name="shop" value="${esc(s.shop)}" />
          <button class="btn red" type="submit" style="padding:6px 12px; font-size:12px;">Clean up</button>
        </form>` : ""}
      </td>
    </tr>`
    )
    .join("");

  return `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Total Installs (all-time)</div><div class="stat-value" style="color:#1B8FEA;">${total}</div><div class="stat-hint">= Currently Installed + Likely Uninstalled</div></div>
      <div class="stat-card"><div class="stat-label">Currently Installed</div><div class="stat-value" style="color:#1A7048;">${currentlyInstalled}</div><div class="stat-hint">= Pro + Free, below</div></div>
      <div class="stat-card"><div class="stat-label">Likely Uninstalled</div><div class="stat-value" style="color:#B91C1C;">${uninstalledCount}</div><div class="stat-hint">stale data — see Clean up below</div></div>
      <div class="stat-card"><div class="stat-label">Pro Subscribers</div><div class="stat-value" style="color:#7C3AED;">${proCount}</div></div>
      <div class="stat-card"><div class="stat-label">Free Users</div><div class="stat-value" style="color:#B45309;">${freeCount}</div></div>
      <div class="stat-card"><div class="stat-label">On Trial</div><div class="stat-value" style="color:#0E7490;">${trialCount}</div></div>
      <div class="stat-card"><div class="stat-label">MRR${mrrIsExact ? "" : " (approx.)"}</div><div class="stat-value text" style="color:#15803D;">$${mrr.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">Next Renewal</div><div class="stat-value text" style="color:#0F1C3F;">${nextRenewalShop ? formatDate(nextRenewalShop.currentPeriodEnd) : "—"}</div>${nextRenewalShop ? `<div class="stat-hint">${esc(nextRenewalShop.shop)}</div>` : ""}</div>
      <div class="stat-card"><div class="stat-label">Total Payments (all-time)</div><div class="stat-value" style="color:#0E7490;">${partnerConfigured ? totalPayments : "—"}</div><div class="stat-hint">${partnerConfigured ? `<a class="link" href="${esc(adminPath)}/revenue">See monthly breakdown →</a>` : "Partner API not configured"}</div></div>
    </div>

    ${resultBanner}

    ${!resultBanner && uninstalledCount > 0 ? `
    <div class="banner warn">
      <span>⚠️ <strong>${uninstalledCount} shop(s) look uninstalled</strong> but still have stored data (their live token came back 401/403/404) — likely a cleanup webhook that never ran. Use "Clean up" on each flagged row below.</span>
    </div>` : ""}

    ${!resultBanner && needsMigration ? `
    <div class="banner warn">
      <span>⚠️ <strong>Fix overdue:</strong> ${needsMigrationCount} shop(s) use deprecated permanent offline tokens.</span>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <form class="inline" method="post" action="${esc(adminPath)}"><button class="btn orange" type="submit">Try exchange</button></form>
        <form class="inline" method="post" action="${esc(adminPath)}"><input type="hidden" name="intent" value="clear" /><button class="btn red" type="submit">Clear &amp; force re-auth</button></form>
      </div>
    </div>` : ""}

    ${error ? `<div class="banner err"><strong>Database error:</strong> ${esc(error)}</div>` : ""}

    <div class="card">
      <div class="card-header">
        <span class="card-title">Installed Shops (${total})</span>
        <span style="font-size:12px; color:#7B7367;">Data fetched live from Shopify API</span>
      </div>
      ${total === 0
        ? `<div class="empty">${error ? "Could not load shops — check DATABASE_URL in Railway." : "No shops installed yet."}</div>`
        : `<div style="overflow-x:auto;">
        <table>
          <thead><tr>${["#", "Store Name", "Shop Domain", "Owner", "Email", "Plan", "Billing", "Next Billing", "Status", "Session Expires", ""].map((h) => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>
    <p style="font-size:11px; color:#AAA49C; margin-top:16px; text-align:center;">Live data is fetched live from the Shopify Admin API using each shop's stored access token.</p>
  `;
}

export async function renderDashboard(req: Request, res: Response, adminPath: string) {
  const body = await renderDashboardBody(adminPath, "");
  res.status(200).type("html").send(layout({ title: "Admin", badge: "Admin", adminPath, body }));
}

export async function handleDashboardAction(req: Request, res: Response, adminPath: string) {
  const intent = req.body?.intent;
  let banner = "";
  if (intent === "clear") {
    const { cleared } = await clearPermanentSessions();
    banner = `<div class="banner ok"><div><strong>✓ ${cleared} session(s) cleared.</strong> Now ask the merchant to open the app in Shopify admin — Token Exchange will run automatically and issue a new expiring token. The Shopify Monitoring warning should clear within 24 hours.</div></div>`;
  } else if (intent === "purge") {
    const shop = String(req.body?.shop ?? "");
    if (shop) {
      await purgeUninstalledShop(shop);
      banner = `<div class="banner ok"><div><strong>✓ Cleaned up ${esc(shop)}.</strong> Its session, plan, and widget settings have been removed.</div></div>`;
    }
  } else {
    const results = await migrateOfflineTokens();
    banner = migrationBanner(results);
  }
  const body = await renderDashboardBody(adminPath, banner);
  res.status(200).type("html").send(layout({ title: "Admin", badge: "Admin", adminPath, body }));
}

// ─── Revenue ────────────────────────────────────────────────────────────────
// Sourced entirely from the Partner API (see app/partner.server.ts) — real
// transaction records Shopify itself processed, not derived from the
// dashboard's own Pro/Free snapshot above (which only reflects the current
// moment and says nothing about a shop that paid for months and left).

function money(amount: number, currency: string): string {
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}${currency !== "USD" ? " " + currency : ""}`;
}

// Nayan's revenue-share cut — computed off GROSS revenue (the pre-fee
// sticker price), not net.
const NAYAN_SHARE_PCT = 0.15;

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function renderRevenueBody(adminPath: string, selectedMonth: string | null): Promise<string> {
  if (!isPartnerApiConfigured()) {
    return `<div class="banner warn"><span>⚠️ Partner API isn't configured — set <code>PARTNER_API_TOKEN</code> and <code>PARTNER_ORG_ID</code> to see real payment history here.</span></div>`;
  }

  const transactions = await getAppTransactions();
  const months = groupByMonth(transactions);
  const totalCount = transactions.length;
  const totalGross = transactions.reduce((s, t) => s + t.grossAmount, 0);
  const totalNet = transactions.reduce((s, t) => s + t.netAmount, 0);
  const currency = transactions[0]?.currency ?? "USD";

  const monthOptions = [`<option value="">All time</option>`]
    .concat(months.map((m) => `<option value="${esc(m.month)}" ${m.month === selectedMonth ? "selected" : ""}>${esc(monthLabel(m.month))}</option>`))
    .join("");

  const monthRows = months
    .map(
      (m) => `<tr>
      <td><a class="link" href="${esc(adminPath)}/revenue?month=${esc(m.month)}">${esc(monthLabel(m.month))}</a></td>
      <td>${m.count}</td>
      <td>${money(m.gross, m.currency)}</td>
      <td>${money(m.net, m.currency)}</td>
      <td>${money(m.gross * NAYAN_SHARE_PCT, m.currency)}</td>
    </tr>`
    )
    .join("");

  const detail = selectedMonth
    ? transactions
        .filter((t) => t.createdAt.slice(0, 7) === selectedMonth)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const detailRows = detail
    .map(
      (t) => `<tr>
      <td style="white-space:nowrap; color:#7B7367; font-size:12px;">${formatDateTime(t.createdAt)}</td>
      <td>${t.shopName ? esc(t.shopName) : `<span style="color:#aaa;">—</span>`}</td>
      <td><a class="link" href="https://${esc(t.shopDomain ?? "")}/admin" target="_blank" rel="noreferrer">${esc(t.shopDomain ?? "—")}</a></td>
      <td>${t.billingInterval === "ANNUAL" ? "Yearly" : t.billingInterval === "EVERY_30_DAYS" ? "Monthly" : "—"}</td>
      <td>${money(t.grossAmount, t.currency)}</td>
      <td>${money(t.netAmount, t.currency)}</td>
      <td>${money(t.grossAmount * NAYAN_SHARE_PCT, t.currency)}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card"><div class="stat-label">Total Payments (all-time)</div><div class="stat-value" style="color:#0E7490;">${totalCount}</div></div>
      <div class="stat-card"><div class="stat-label">Gross Revenue (all-time)</div><div class="stat-value text" style="color:#15803D;">${money(totalGross, currency)}</div></div>
      <div class="stat-card"><div class="stat-label">Net Revenue (all-time)</div><div class="stat-value text" style="color:#15803D;">${money(totalNet, currency)}</div><div class="stat-hint">after Shopify's fee</div></div>
      <div class="stat-card"><div class="stat-label">Nayan's Share (15%, all-time)</div><div class="stat-value text" style="color:#7C3AED;">${money(totalGross * NAYAN_SHARE_PCT, currency)}</div><div class="stat-hint">15% of gross revenue</div></div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Monthly breakdown</span>
        <form method="get" action="${esc(adminPath)}/revenue" style="display:flex; align-items:center; gap:8px;">
          <select name="month" onchange="this.form.submit()" style="border:1px solid #E3DDD5; border-radius:8px; padding:7px 10px; font-size:13px; font-family:inherit;">
            ${monthOptions}
          </select>
        </form>
      </div>
      ${months.length === 0
        ? `<div class="empty">No payments recorded yet.</div>`
        : `<div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Month</th><th>Payments</th><th>Gross</th><th>Net</th><th>Nayan's Share (15%)</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>`}
    </div>

    ${selectedMonth ? `
    <div class="card">
      <div class="card-header"><span class="card-title">${esc(monthLabel(selectedMonth))} — ${detail.length} payment(s)</span></div>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Date</th><th>Store</th><th>Shop Domain</th><th>Billing</th><th>Gross</th><th>Net</th><th>Nayan's Share (15%)</th></tr></thead>
          <tbody>${detailRows}</tbody>
        </table>
      </div>
    </div>` : ""}

    <p style="font-size:11px; color:#AAA49C; margin-top:16px; text-align:center;">Sourced from Shopify's Partner API — real transaction records, cached for up to 5 minutes.</p>
  `;
}

export async function renderRevenue(req: Request, res: Response, adminPath: string) {
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : null;
  const body = await renderRevenueBody(adminPath, month);
  res.status(200).type("html").send(layout({ title: "Revenue", badge: "Revenue", adminPath, body }));
}

// ─── Export / debug ─────────────────────────────────────────────────────────

export async function renderExport(_req: Request, res: Response) {
  const shops = await getEnrichedShops();
  const csv = enrichedShopsToCSV(shops);
  const date = new Date().toISOString().split("T")[0];
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="convertly-shops-${date}.csv"`);
  res.send(csv);
}

export async function renderDebug(_req: Request, res: Response) {
  const { rows: sessions } = await pool().query(`
    SELECT "id", "shop", "isOnline", "expires", "scope",
           "accessToken" IS NOT NULL as "hasAccessToken",
           CASE WHEN "accessToken" IS NOT NULL THEN substr("accessToken",1,8) || '...' ELSE NULL END as "tokenPreview",
           "refreshToken" IS NOT NULL as "hasRefreshToken",
           "refreshTokenExpires",
           length("accessToken") as "tokenLen"
    FROM "shopify_sessions"
    ORDER BY "shop", "isOnline"
  `);
  const { rows: columns } = await pool().query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'shopify_sessions'`
  );
  res.json({
    dbInfo: {
      database: process.env.DATABASE_URL ? "postgres (DATABASE_URL set)" : "unset",
      columns: columns.map((c) => c.column_name),
    },
    sessions: sessions.map((s) => ({
      ...s,
      refreshTokenExpires: s.refreshTokenExpires === null ? null : Number(s.refreshTokenExpires),
    })),
    now: Math.floor(Date.now() / 1000),
  });
}

// ─── Admin users management ─────────────────────────────────────────────────

async function renderUsersBody(adminPath: string, me: string | null, message: string): Promise<string> {
  const users = await listAdminUsers();
  const rows = users
    .map(
      (u) => `<tr>
      <td>${esc(u.username)}${u.username === me ? `<span class="you-badge">you</span>` : ""}</td>
      <td style="color:#7B7367; font-size:12px;">${new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td style="text-align:right;">
        <form class="inline" method="post" action="${esc(adminPath)}/users" onsubmit="return confirm('Remove admin account ${esc(u.username)}?');">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="username" value="${esc(u.username)}" />
          <button class="btn red" type="submit" ${users.length <= 1 ? "disabled" : ""} style="padding:6px 12px; font-size:12px;">Remove</button>
        </form>
      </td>
    </tr>`
    )
    .join("");

  return `
    ${message}
    <div class="card">
      <div class="card-header"><span class="card-title">Accounts (${users.length})</span></div>
      <table>
        <thead><tr><th>Username</th><th>Created</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Add or reset an account</span></div>
      <form class="form-card" method="post" action="${esc(adminPath)}/users">
        <input type="hidden" name="intent" value="create" />
        <label class="field">Username<input class="text" name="username" required autocomplete="off" /></label>
        <label class="field">Password <span style="color:#AAA49C; font-weight:400;">(min 8 characters)</span><input class="text" name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
        <button class="btn blue" type="submit" style="align-self:flex-start;">Save account</button>
        <p class="hint">Using an existing username resets that account's password instead of creating a duplicate.</p>
      </form>
    </div>
  `;
}

export async function renderUsers(req: Request, res: Response, adminPath: string, me: string | null) {
  const body = await renderUsersBody(adminPath, me, "");
  res.status(200).type("html").send(layout({ title: "Admin Users", badge: "Admin Users", adminPath, body: `<div class="narrow" style="margin:0 auto;">${body}</div>` }));
}

export async function handleUsersAction(req: Request, res: Response, adminPath: string, me: string | null) {
  const intent = req.body?.intent;
  let message = "";
  try {
    if (intent === "create") {
      const username = String(req.body?.username ?? "");
      const password = String(req.body?.password ?? "");
      await upsertAdminUser(username, password);
      message = `<div class="banner ok">Saved "${esc(username.trim().toLowerCase())}".</div>`;
    } else if (intent === "delete") {
      const username = String(req.body?.username ?? "");
      await deleteAdminUser(username);
      message = `<div class="banner ok">Removed "${esc(username)}".</div>`;
    }
  } catch (e: any) {
    message = `<div class="banner err">${esc(e.message ?? String(e))}</div>`;
  }
  const body = await renderUsersBody(adminPath, me, message);
  res.status(200).type("html").send(layout({ title: "Admin Users", badge: "Admin Users", adminPath, body: `<div class="narrow" style="margin:0 auto;">${body}</div>` }));
}

// ─── Login / logout ─────────────────────────────────────────────────────────
// A real login screen instead of the browser's native HTTP Basic Auth popup.
// Sessions are a signed cookie (see createSessionToken/verifySessionToken in
// adminAuth.server.ts) — no server-side session table.

function sessionCookie(adminPath: string, token: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (token === null) {
    return `admin_session=; HttpOnly${secure}; SameSite=Lax; Path=${adminPath}; Max-Age=0`;
  }
  return `admin_session=${token}; HttpOnly${secure}; SameSite=Lax; Path=${adminPath}; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export function renderLogin(_req: Request, res: Response, adminPath: string, error?: string) {
  const body = `
    ${error ? `<div class="err">${esc(error)}</div>` : ""}
    <form method="post" action="${esc(adminPath)}/login">
      <label for="username">Username</label>
      <input id="username" type="text" name="username" autocomplete="username" required autofocus />
      <label for="password">Password</label>
      <input id="password" type="password" name="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
  `;
  res.status(error ? 401 : 200).type("html").send(loginLayout(body));
}

export async function handleLogin(req: Request, res: Response, adminPath: string) {
  const username = String(req.body?.username ?? "");
  const password = String(req.body?.password ?? "");
  const ok = await verifyAdminCredentials(username, password);
  if (!ok) {
    renderLogin(req, res, adminPath, "Incorrect username or password.");
    return;
  }
  const token = createSessionToken(username.trim().toLowerCase());
  res.setHeader("Set-Cookie", sessionCookie(adminPath, token));
  res.redirect(adminPath);
}

export function handleLogout(_req: Request, res: Response, adminPath: string) {
  res.setHeader("Set-Cookie", sessionCookie(adminPath, null));
  res.redirect(`${adminPath}/login`);
}
