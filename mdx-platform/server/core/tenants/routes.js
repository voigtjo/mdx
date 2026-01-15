// server/core/tenants/routes.js

import { listTenants } from "./model.js";

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

function isAdminLike(user) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;

  return roles.some(r => {
    if (typeof r === "string") {
      return ["admin", "tenant_admin", "platform_admin", "superadmin"].includes(r);
    }
    if (typeof r === "object" && r) {
      const v = r.role || r.name;
      return ["admin", "tenant_admin", "platform_admin", "superadmin"].includes(v);
    }
    return false;
  });
}

function requireAdmin(req, reply) {
  const user = requireUser(req, reply);
  if (!user) return null;

  if (!isAdminLike(user)) {
    reply.code(403);
    return reply.send("Forbidden – Adminrechte erforderlich");
  }
  return user;
}

export function registerTenantsRoutes(app) {
  app.get("/tenants", async (req, reply) => {
    const user = requireAdmin(req, reply);
    if (!user) return;

    const tenants = await listTenants();

    return reply.view("tenants.ejs", {
      user,
      tenants
    });
  });
}

/**
 * Wrapper, damit server/index.js analog zu MDX "register" importieren kann.
 */
export function register(app) {
  return registerTenantsRoutes(app);
}
