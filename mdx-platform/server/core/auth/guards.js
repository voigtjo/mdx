// server/core/auth/guards.js

import {
  ensureDefaultApps,
  listEnabledTenantApps
} from "../apps/model.js";

export function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

export function hasAnyRole(user, roles = []) {
  if (!user) return false;
  const list = Array.isArray(user.roles) ? user.roles : [];

  return list.some(r => {
    if (typeof r === "string") return roles.includes(r);
    if (r && typeof r === "object") {
      if (typeof r.role === "string") return roles.includes(r.role);
      if (typeof r.name === "string") return roles.includes(r.name);
    }
    return false;
  });
}

export function isAdmin(user) {
  return hasAnyRole(user, ["superadmin", "admin", "tenant_admin"]);
}

/**
 * Tenant-Gate:
 * - normaler User darf nur seinen tenantId
 * - superadmin darf überall rein (MVP praktisch)
 */
export function requireTenantAccess(req, reply, tenantId) {
  const user = requireUser(req, reply);
  if (!user) return null;

  if (isAdmin(user) && hasAnyRole(user, ["superadmin"])) {
    return user;
  }

  if (!user.tenantId || String(user.tenantId) !== String(tenantId)) {
    reply.code(403).send("Forbidden – falscher Tenant");
    return null;
  }

  return user;
}

export function requireAdmin(req, reply) {
  const user = requireUser(req, reply);
  if (!user) return null;

  if (!isAdmin(user)) {
    reply.code(403).send("Forbidden – Adminrechte erforderlich");
    return null;
  }

  return user;
}

/**
 * App-Gate (B3):
 * - nur wenn App in tenant_<id>.apps enabled ist
 * - rendert Disabled-View
 */
export async function requireTenantAppEnabled(req, reply, appName) {
  const user = requireUser(req, reply);
  if (!user) return null;

  // optional: tenantId aus URL prüfen, falls vorhanden
  const urlTenant = req.params?.tenantId || req.params?.tenant;
  if (urlTenant && String(urlTenant) !== String(user.tenantId)) {
    reply.code(403).send("Forbidden – Tenant mismatch");
    return null;
  }

  await ensureDefaultApps(user.tenantId);

  const enabled = await listEnabledTenantApps(user.tenantId);
  const ok = enabled.some(a => a.name === appName);

  if (!ok) {
    reply.code(403);
    return reply.view("apps/disabled.ejs", {
      user,
      tenantId: user.tenantId,
      appName
    });
  }

  return user;
}
