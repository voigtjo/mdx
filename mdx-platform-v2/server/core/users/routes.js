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
      return (
        r === "admin" ||
        r === "tenant_admin" ||
        r === "superadmin"
      );
    }
    if (typeof r === "object" && r !== null) {
      return (
        r.role === "admin" ||
        r.role === "tenant_admin" ||
        r.role === "superadmin" ||
        r.name === "admin"
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

export function registerUserRoutes(app) {
  // Übersicht
  app.get("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const users = await getUsersForTenant(admin.tenantId);

    return reply.view("users/index.ejs", {
      user: admin,
      users,
      createdUser: null
    });
  });

  // Neuer User
  app.post("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const { email, password, roles, mustChangePassword } = req.body || {};

    // User anlegen (Passwort optional, wird sonst generiert)
    const createdUser = await createUserForTenant(admin.tenantId, {
      email,
      password,
      roles,
      mustChangePassword: mustChangePassword === "on"
    });

    // Liste neu laden
    const users = await getUsersForTenant(admin.tenantId);

    return reply.view("users/index.ejs", {
      user: admin,
      users,
      createdUser // für Erfolgsmeldung
    });
  });
}

/**
 * Wrapper, damit server/index.js wie bei MDX
 * `import { register as registerUserRoutes }` verwenden kann
 */
export function register(app) {
  return registerUserRoutes(app);
}
