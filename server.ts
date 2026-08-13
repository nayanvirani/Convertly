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

// Registers a full admin login + dashboard at `basePath`. Called twice below:
// once unconditionally at the standard, visible /admin path, and once (if
// configured) at the secret ADMIN_PATH. Both are completely independent —
// separate session cookies scoped to their own path — but share the same
// login screen, the same admin_users accounts, and the same dashboard code
// in adminPanel.server.ts.
function registerAdminRoutes(basePath: string) {
  const adminRouter = express.Router();
  adminRouter.use(express.urlencoded({ extended: true }));

  // A real login screen instead of the browser's native HTTP Basic Auth
  // popup. These three routes are reachable without a session; everything
  // else below the auth-gate middleware requires a valid one.
  adminRouter.get("/login", (req, res) => renderLogin(req, res, basePath));
  adminRouter.post("/login", (req, res) => handleLogin(req, res, basePath));
  adminRouter.post("/logout", (req, res) => handleLogout(req, res, basePath));

  // Each admin has their own username + password, checked at login against
  // the admin_users table (see adminAuth.server.ts) — manage accounts from
  // the panel itself, or bootstrap the first one with
  // `npm run admin:create-user`. The session cookie is a signed, stateless
  // token (12h) — no session table needed.
  adminRouter.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const username = verifySessionToken(cookies["admin_session"]);
    if (!username) {
      res.redirect(`${basePath}/login`);
      return;
    }
    (req as any).adminUsername = username;
    next();
  });

  adminRouter.get("/", (req, res) => renderDashboard(req, res, basePath));
  adminRouter.post("/", (req, res) => handleDashboardAction(req, res, basePath));
  adminRouter.get("/export", renderExport);
  adminRouter.get("/debug", renderDebug);
  adminRouter.get("/users", (req, res) =>
    renderUsers(req, res, basePath, (req as any).adminUsername ?? null)
  );
  adminRouter.post("/users", (req, res) =>
    handleUsersAction(req, res, basePath, (req as any).adminUsername ?? null)
  );

  app.use(basePath, adminRouter);
}

// Standard, visible admin login — same as any normal app.
registerAdminRoutes("/admin");

// Optional second entry point at a secret URL prefix, e.g. "/x7k9-mgmt-2f8a".
// Independent session from /admin above; same accounts. Unset by default.
const ADMIN_PATH = process.env.ADMIN_PATH;
if (ADMIN_PATH && ADMIN_PATH !== "/admin") {
  registerAdminRoutes(ADMIN_PATH);
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
