// server/index.js

import Fastify from "fastify";
import fastifyView from "@fastify/view";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { registerLoginRoutes } from "./core/auth/login.js";

// MDX-App (als Fastify-Plugin)
import { register as registerMdxRoutes } from "../apps/mdx/routes.js";

// Dashboard, Users, Tenants
import { register as registerDashboardRoutes } from "./core/dashboard/routes.js";
import { register as registerUserRoutes } from "./core/users/routes.js";
import { register as registerTenantRoutes } from "./core/tenants/routes.js";

// Tenant-Apps – liegt bei dir unter server/core/apps
import { register as registerTenantAppRoutes } from "./core/apps/routes.js";
import { ensureDefaultApps, listEnabledTenantApps } from "./core/apps/model.js";

// Core Events
import { initCoreEventHandlers } from "./core/events/init.js";

// ✅ Webhook Admin Routes (JSON)
import { register as registerWebhookRoutes } from "./core/webhooks/routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: true,
  ignoreTrailingSlash: true
});

// ✅ Core Event Handlers (Audit + Webhooks Queue)
initCoreEventHandlers();

/**
 * Views
 */
app.register(fastifyView, {
  engine: { ejs },
  root: path.join(__dirname, "core/ui"),
  layout: "layout.ejs"
});

/**
 * Static
 */
app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/public/"
});

/**
 * EIGENER BODY-PARSER
 */
app.addContentTypeParser("*", (req, payload, done) => {
  let data = "";

  payload.on("data", chunk => {
    data += chunk;
  });

  payload.on("end", () => {
    const ct = req.headers["content-type"] || "";

    try {
      if (ct.includes("application/json")) {
        const body = data ? JSON.parse(data) : {};
        done(null, body);
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(data);
        const body = {};
        for (const [key, value] of params.entries()) {
          body[key] = value;
        }
        done(null, body);
      } else {
        done(null, data);
      }
    } catch (err) {
      done(err, undefined);
    }
  });

  payload.on("error", err => done(err, undefined));
});

/**
 * Cookies & Sessions
 */
app.register(fastifyCookie);
app.register(fastifySession, {
  secret: process.env.SESSION_SECRET,
  saveUninitialized: false,
  cookie: {
    secure: false,
    path: "/"
  }
});

/**
 * Root
 */
app.get("/", async (req, reply) => {
  if (req.session && req.session.user) {
    const t = req.session.user.tenantId;
    return reply.redirect(`/tenant/${encodeURIComponent(t)}/dashboard`);
  }
  return reply.redirect("/login");
});

/**
 * ✅ GLOBALS:
 * - ensured default apps per tenant
 * - reply.locals.enabledApps (für Layout/Nav)
 *
 * WICHTIG: muss VOR allen Feature-Routen/Plugins stehen
 */
app.addHook("preHandler", async (req, reply) => {
  const user = req.session?.user;
  if (!user?.tenantId) return;

  // ✅ wenn tenantId in URL steckt, nimm diese — sonst Session-Tenant
  const t = req.params?.tenantId || user.tenantId;

  await ensureDefaultApps(t);

  reply.locals = reply.locals || {};
  reply.locals.tenantId = t;
  reply.locals.enabledApps = await listEnabledTenantApps(t);
});

/**
 * Login
 */
registerLoginRoutes(app);

/**
 * ✅ Legacy /dashboard -> tenant-scoped Dashboard
 * (damit alte Links weiterhin funktionieren)
 */
app.get("/dashboard", async (req, reply) => {
  if (!req.session?.user) return reply.redirect("/login");
  const t = req.session.user.tenantId;
  return reply.redirect(`/tenant/${encodeURIComponent(t)}/dashboard`);
});

/**
 * Feature-Routen (Core)
 */
registerTenantRoutes(app);        // /tenants (superadmin)
registerTenantAppRoutes(app);     // /tenant/:tenant/apps etc.
registerUserRoutes(app);          // /tenant/:tenantId/users etc.

// ✅ Webhook Admin API (JSON-only)
registerWebhookRoutes(app);

/**
 * ✅ Dashboard MUSS tenant-scoped registriert werden:
 * /tenant/:tenantId/dashboard
 */
app.register(registerDashboardRoutes, { prefix: "/tenant/:tenantId" });

/**
 * MDX unter Tenant-Pfad registrieren:
 *   /tenant/:tenantId/app/mdx/...
 */
app.register(registerMdxRoutes, {
  prefix: "/tenant/:tenantId/app/mdx",
  baseUrlTemplate: "/tenant/:tenantId/app/mdx"
});

/**
 * Legacy Redirects: /mdx/... -> /tenant/<sessionTenant>/app/mdx/...
 */
app.get("/mdx", async (req, reply) => {
  if (!req.session?.user) return reply.redirect("/login");
  const t = req.session.user.tenantId;
  return reply.redirect(`/tenant/${encodeURIComponent(t)}/app/mdx`);
});

app.get("/mdx/*", async (req, reply) => {
  if (!req.session?.user) return reply.redirect("/login");
  const t = req.session.user.tenantId;
  const rest = req.params["*"] || "";
  const target = `/tenant/${encodeURIComponent(t)}/app/mdx/${rest}`;
  return reply.redirect(target.replace(/\/+$/g, ""));
});

/**
 * Start Server
 */
const port = process.env.PORT || 4000;

const start = async () => {
  try {
    await app.listen({ port });
    console.log(`Platform running at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
