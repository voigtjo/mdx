// server/core/users/routes.js

import { getUsersForTenant, createUserForTenant } from "./model.js";

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

function isAdmin(user) {
  if (!user) return false;
  const roles = user.roles || [];
  if (!Array.isArray(roles)) return false;

  return roles.some(r => {
    if (typeof r === "string") {
      return r === "admin" || r === "tenant_admin" || r === "superadmin";
    }
    if (typeof r === "object" && r !== null) {
      return (
        r.role === "admin" ||
        r.role === "tenant_admin" ||
        r.role === "superadmin" ||
        r.name === "admin" ||
        r.name === "tenant_admin" ||
        r.name === "superadmin"
      );
    }
    return false;
  });
}

function requireAdmin(req, reply) {
  const user = requireUser(req, reply);
  if (!user) return null;

  if (!isAdmin(user)) {
    reply.code(403);
    return reply.send("Forbidden – Adminrechte erforderlich");
  }

  return user;
}

function resolveTenantId(req, adminUser) {
  return req.params?.tenantId || adminUser?.tenantId || null;
}

export function registerUserRoutes(app) {
  // -------------------------------------------------------
  // Tenant-scoped: GET /tenant/:tenantId/users
  // -------------------------------------------------------
  app.get("/tenant/:tenantId/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const tenantId = resolveTenantId(req, admin);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const users = await getUsersForTenant(tenantId);

    return reply.view("users/index.ejs", {
      title: "Users",
      activeSection: "tenant",
      currentApp: null,

      user: admin,
      tenantId,
      users,
      createdUser: null
    });

  });

  // -------------------------------------------------------
  // Tenant-scoped: POST /tenant/:tenantId/users
  // -------------------------------------------------------
  app.post("/tenant/:tenantId/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const tenantId = resolveTenantId(req, admin);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const { email, password, roles, mustChangePassword } = req.body || {};

    const createdUser = await createUserForTenant(tenantId, {
      email,
      password,
      roles,
      mustChangePassword: mustChangePassword === "on"
    });

    const users = await getUsersForTenant(tenantId);

    return reply.view("users/index.ejs", {
      title: "Users",
      activeSection: "tenant",
      currentApp: null,

      user: admin,
      tenantId,
      users,
      createdUser
    });

  });

  // -------------------------------------------------------
  // Legacy: /users -> redirect auf tenant scoped
  // -------------------------------------------------------
  app.get("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    if (!admin.tenantId) {
      // fallback: alte Ansicht
      const users = await getUsersForTenant(admin.tenantId);
      return reply.view("users/index.ejs", {
        user: admin,
        tenantId: admin.tenantId || "",
        users,
        createdUser: null
      });
    }

    return reply.redirect(`/tenant/${encodeURIComponent(admin.tenantId)}/users`);
  });

  app.post("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    if (!admin.tenantId) return reply.code(400).send("tenantId fehlt in Session");

    // 307: Method + body bleiben erhalten
    return reply.redirect(307, `/tenant/${encodeURIComponent(admin.tenantId)}/users`);
  });
}

/**
 * Wrapper, damit server/index.js
 * `import { register as registerUserRoutes }` verwenden kann
 */
export function register(app) {
  return registerUserRoutes(app);
}
