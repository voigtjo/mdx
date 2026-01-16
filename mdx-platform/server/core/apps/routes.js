// server/core/tenant_apps/routes.js

import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import ejs from "ejs";

import {
  ensureDefaultApps,
  listTenantApps,
  setTenantAppEnabled
} from "./model.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsRoot = path.join(__dirname, "views");

// ✅ EJS root für absolute includes wie include("/partials/tenant_nav.ejs")
const uiRoot = path.join(__dirname, "..", "ui");

async function render(reply, viewName, data) {
  const fullPath = path.join(viewsRoot, viewName);

  const locals = reply?.locals || {};

  const tenantId =
    locals.tenantId ||
    data?.tenantId ||
    data?.tenantName ||
    data?.user?.tenantId ||
    "";

  const enabledApps =
    locals.enabledApps ||
    data?.enabledApps ||
    [];

  const html = await renderFile(
    fullPath,
    {
      ...locals,
      ...data,
      tenantId,
      enabledApps,

      // optional konsistent (schadet nicht, hilft Navigation)
      title: data?.title || "Tenant Apps",
      activeSection: data?.activeSection || "tenant",
      currentApp:
        typeof data?.currentApp !== "undefined" ? data.currentApp : null
    },
    { root: uiRoot }
  );

  reply.type("text/html; charset=utf-8").send(html);
}

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

// MVP: Tenant-Admin sind user.roles enthält "admin" oder "superadmin"
function isTenantAdmin(user) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;
  return roles.includes("admin") || roles.includes("superadmin");
}

export function registerTenantAppRoutes(app) {
  /**
   * Tenant Apps Management
   * GET  /tenant/:tenant/apps
   * POST /tenant/:tenant/apps/:app/enable
   * POST /tenant/:tenant/apps/:app/disable
   */
  app.get("/tenant/:tenant/apps", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantName = req.params.tenant;

    // Der eingeloggte User ist tenantId="demo" etc.
    // Wir erlauben nur Zugriff, wenn URL-Tenant == session tenantId (MVP)
    if (tenantName !== user.tenantId) {
      return reply.code(403).send("Forbidden – falscher Tenant-Kontext");
    }

    await ensureDefaultApps(user.tenantId);
    const apps = await listTenantApps(user.tenantId);

    return render(reply, "index.ejs", {
      title: "Tenant Apps",
      activeSection: "tenant",
      currentApp: null,

      user,
      tenantName,
      tenantId: tenantName, // <- für Templates: tenantId verfügbar
      apps,
      canEdit: isTenantAdmin(user)
    });
  });

  app.post("/tenant/:tenant/apps/:app/enable", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantName = req.params.tenant;
    const appName = req.params.app;

    if (tenantName !== user.tenantId) {
      return reply.code(403).send("Forbidden – falscher Tenant-Kontext");
    }
    if (!isTenantAdmin(user)) {
      return reply.code(403).send("Forbidden – Adminrechte erforderlich");
    }

    await setTenantAppEnabled(user.tenantId, appName, true);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantName)}/apps`);
  });

  app.post("/tenant/:tenant/apps/:app/disable", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantName = req.params.tenant;
    const appName = req.params.app;

    if (tenantName !== user.tenantId) {
      return reply.code(403).send("Forbidden – falscher Tenant-Kontext");
    }
    if (!isTenantAdmin(user)) {
      return reply.code(403).send("Forbidden – Adminrechte erforderlich");
    }

    await setTenantAppEnabled(user.tenantId, appName, false);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantName)}/apps`);
  });
}

// Fallback (dein Pattern)
export function register(app) {
  return registerTenantAppRoutes(app);
}
