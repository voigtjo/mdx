import Fastify from "fastify";
import fastifyView from "@fastify/view";
import formbody from "@fastify/formbody";
import ejs from "ejs";
import path from "path";

import { registerSession } from "./core/auth/session.js";
import { registerLoginRoutes } from "./core/auth/login.js";
import { loadApps } from "./core/apps/loader.js";
import { registerUserRoutes } from "./core/users/routes.js";
import { registerTenantRoutes } from "./core/tenants/routes.js";
import { registerRoleRoutes } from "./core/roles/routes.js";
import dotenv from "dotenv";
dotenv.config();

const app = Fastify({ logger: true });

/**
 * Views – EJS
 */
app.register(fastifyView, {
  engine: { ejs },
  root: path.join(process.cwd(), "server")
});

app.register(formbody);

/**
 * Default-Route
 */
app.get("/", async (req, reply) => {
  return reply.redirect("/login");
});

/**
 * Sessions
 */
registerSession(app);

/**
 * Login routes
 */
registerLoginRoutes(app);

/**
 * Dashboard
 */
app.get("/dashboard", async (req, reply) => {
  if (!req.session.user) return reply.redirect("/login");

  return reply.view("/core/ui/dashboard.ejs", { 
    user: req.session.user,
    users: [],     // wichtig: verhindern Fehler, später echte Listen
    tenants: []    // wichtig: verhindern Fehler, später echte Listen
  });
});

/**
 * User Management
 */
app.register(registerUserRoutes);

/**
 * Tenant Management (superadmin)
 */
app.register(registerTenantRoutes);

/**
 * Role Management
 */
registerRoleRoutes(app);

/**
 * Load installed apps (plugins)
 */
await loadApps(app);

/**
 * Start Server
 */
app.listen({ port: 4000 });
console.log("Platform running at http://localhost:4000");
