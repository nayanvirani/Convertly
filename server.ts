import { createRequestHandler } from "@remix-run/express";
import { installGlobals, type ServerBuild } from "@remix-run/node";
import express from "express";
import { verifyAdminCredentials } from "./app/adminAuth.server";
import {
  renderDashboard,
  handleDashboardAction,
  renderExport,
  renderDebug,
  renderUsers,
  handleUsersAction,
} from "./adminPanel.server";

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

  // Each admin has their own username + password, checked against the
  // admin_users table (see adminAuth.server.ts) — manage accounts from the
  // panel itself, or bootstrap the first one with `npm run admin:create-user`.
  adminRouter.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Basic ")) {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      const username = colon >= 0 ? decoded.slice(0, colon) : decoded;
      const password = colon >= 0 ? decoded.slice(colon + 1) : "";
      verifyAdminCredentials(username, password)
        .then((ok) => {
          if (!ok) {
            res.set("WWW-Authenticate", 'Basic realm="Boostify Admin"');
            res.status(401).send("Authentication required.");
            return;
          }
          (req as any).adminUsername = username.trim().toLowerCase();
          next();
        })
        .catch((err) => {
          console.error("[admin] auth check failed:", err);
          res.status(500).send("Auth check failed.");
        });
      return;
    }
    res.set("WWW-Authenticate", 'Basic realm="Boostify Admin"');
    res.status(401).send("Authentication required.");
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

  // Sign-out: POSTs here always return 401 to clear the browser's cached
  // Basic Auth credentials.
  app.post(`${ADMIN_PATH}-logout`, (_req, res) => {
    res.set("WWW-Authenticate", 'Basic realm="Boostify Admin"');
    res.status(401).send("Logged out.");
  });
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
  console.log(`Boostify listening on http://localhost:${port}`);
});
