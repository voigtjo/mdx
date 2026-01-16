// server/core/dashboard/routes.js

import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import ejs from "ejs";

import { getTasksForUser, listDocs } from "../../../apps/mdx/model.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Achtung: du hast aktuell server/core/dashboard/views als View-Ordner
const viewsRoot = path.join(__dirname, "views");

// ✅ EJS root für absolute includes wie include("/partials/tenant_nav.ejs")
const uiRoot = path.join(__dirname, "..", "ui");

async function render(reply, viewName, data) {
  const fullPath = path.join(viewsRoot, viewName);

  // alles, was server/index.js im preHandler setzt
  const locals = reply?.locals || {};

  // tenant/apps aus locals, falls vorhanden (wird in index.js preHandler gesetzt)
  const tenantId =
    locals.tenantId ||
    data?.tenantId ||
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
      title: data?.title || "Dashboard",
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

/**
 * TenantId bestimmen:
 * - tenant scoped route: /tenant/:tenantId/dashboard (Prefix in index.js)
 * - fallback: aus Session
 */
function resolveTenantId(req, user) {
  return req.params?.tenantId || user?.tenantId || null;
}

/**
 * ✅ Fastify-Plugin (wird in server/index.js mit prefix "/tenant/:tenantId" registriert)
 * Dadurch wird aus "/dashboard" automatisch "/tenant/:tenantId/dashboard".
 */
export async function registerDashboardRoutes(app) {
  // Tenant-Dashboard (tenant-scoped via Prefix)
  app.get("/dashboard", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = resolveTenantId(req, user);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const [tasks, forms] = await Promise.all([
      getTasksForUser(tenantId, user),
      listDocs(tenantId)
    ]);

    const assignedCount = (tasks?.assignedTasks || []).length;
    const openCount = (tasks?.openTasks || []).length;
    const formCount = (forms || []).length;

    return render(reply, "dashboard.ejs", {
      title: "Dashboard",
      activeSection: "tenant",
      currentApp: null,

      user,
      tenantId,
      assignedCount,
      openCount,
      formCount
    });
  });
}

// Alias wie vorher
export async function register(app) {
  return registerDashboardRoutes(app);
}
