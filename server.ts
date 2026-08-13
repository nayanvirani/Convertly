import { createRequestHandler } from "@remix-run/express";
import { installGlobals, type ServerBuild } from "@remix-run/node";
import express from "express";
import { verifySessionToken } from "./app/adminAuth.server";
import {
  renderDashboard,
  handleDashboardAction,
  renderExport,
  renderDebug,
  renderUsers,
  handleUsersAction,
  renderLogin,
  handleLogin,
  handleLogout,
} from "./adminPanel.server";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

installGlobals({ nativeFetch: true });

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

const app = express();

// The admin dashboard is never linked from anywhere in the app, and isn't a
// Remix route at all (see adminPanel.server.ts for why) — it only exists at
// a secret URL prefix that only you know, set via ADMIN_PATH
// (e.g. "/x7k9-mgmt-2f8a"). If ADMIN_PATH isn't set, none of these routes
// are registered, so every request just falls through to Remix's normal
// catch-all and 404s exactly like any other unknown URL.
const ADMIN_PATH = process.env.ADMIN_PATH;

if (ADMIN_PATH) {
  const adminRouter = express.Router();
  adminRouter.use(express.urlencoded({ extended: true }));

  // A real login screen instead of the browser's native HTTP Basic Auth
  // popup. These three routes are reachable without a session; everything
  // else below the auth-gate middleware requires a valid one.
  adminRouter.get("/login", (req, res) => renderLogin(req, res, ADMIN_PATH));
  adminRouter.post("/login", (req, res) => handleLogin(req, res, ADMIN_PATH));
  adminRouter.post("/logout", (req, res) => handleLogout(req, res, ADMIN_PATH));

  // Each admin has their own username + password, checked at login against
  // the admin_users table (see adminAuth.server.ts) — manage accounts from
  // the panel itself, or bootstrap the first one with
  // `npm run admin:create-user`. The session cookie is a signed, stateless
  // token (12h) — no session table needed.
  adminRouter.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const username = verifySessionToken(cookies["admin_session"]);
    if (!username) {
      res.redirect(`${ADMIN_PATH}/login`);
      return;
    }
    (req as any).adminUsername = username;
    next();
  });

  adminRouter.get("/", (req, res) => renderDashboard(req, res, ADMIN_PATH));
  adminRouter.post("/", (req, res) => handleDashboardAction(req, res, ADMIN_PATH));
  adminRouter.get("/export", renderExport);
  adminRouter.get("/debug", renderDebug);
  adminRouter.get("/users", (req, res) =>
    renderUsers(req, res, ADMIN_PATH, (req as any).adminUsername ?? null)
  );
  adminRouter.post("/users", (req, res) =>
    handleUsersAction(req, res, ADMIN_PATH, (req as any).adminUsername ?? null)
  );

  app.use(ADMIN_PATH, adminRouter);
} else {
  console.warn("[admin] ADMIN_PATH is not set — hidden admin dashboard is disabled.");
}

app.use(
  viteDevServer ? viteDevServer.middlewares : express.static("build/client")
);

const build = viteDevServer
  ? () =>
      viteDevServer.ssrLoadModule(
        "virtual:remix/server-build"
      ) as Promise<ServerBuild>
  : ((await import("./build/server/index.js")) as unknown as ServerBuild);

app.get("/health", (_req, res) => res.sendStatus(200));
app.all("*", createRequestHandler({ build }));

const port = parseInt(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Convertly listening on http://localhost:${port}`);
});
