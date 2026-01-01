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

// MDX-App
import { register as registerMdxRoutes } from "../apps/mdx/routes.js";

// NEU: Dashboard, Users, Tenants
import { register as registerDashboardRoutes } from "./core/dashboard/routes.js";
import { register as registerUserRoutes } from "./core/users/routes.js";
import { register as registerTenantRoutes } from "./core/tenants/routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: true,
  ignoreTrailingSlash: true
});

/**
 * Views – wie in platform
 */
app.register(fastifyView, {
  engine: { ejs },
  root: path.join(__dirname, "core/ui")
});

/**
 * Static – root muss existieren (public/)
 */
app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/public/"
});

/**
 * EIGENER BODY-PARSER
 * - application/x-www-form-urlencoded (normale Forms, HTMX)
 * - application/json (APIs)
 * - alles andere: als String
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
          // Achtung: Mehrfach-Felder würden hier überschrieben,
          // das reicht für den aktuellen Stand aber aus.
          body[key] = value;
        }
        done(null, body);
      } else {
        // z.B. Text / MDX-Rohstring, falls wir später POSTs mit purem Text haben
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
 * - wenn eingeloggt → Dashboard
 * - sonst → Login
 */
app.get("/", async (req, reply) => {
  if (req.session && req.session.user) {
    return reply.redirect("/dashboard");
  }
  return reply.redirect("/login");
});

/**
 * Login & Feature-Routen
 */
registerLoginRoutes(app);          // /login, /logout, etc.
registerMdxRoutes(app);            // /mdx, /mdx/forms/..., /mdx/tasks, ...

// NEU:
registerDashboardRoutes(app);      // /dashboard
registerUserRoutes(app);           // /users, /users/new, /users/:id/edit, /users/save
registerTenantRoutes(app);         // /tenants (Platzhalter)

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
