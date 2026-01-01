// server/core/dashboard/routes.js

import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import ejs from "ejs";

import { getTasksForUser } from "../../../apps/mdx/model.js";
import { listDocs } from "../../../apps/mdx/model.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsRoot = path.join(__dirname, "views");

async function render(reply, viewName, data) {
  const fullPath = path.join(viewsRoot, viewName);
  const html = await renderFile(fullPath, data);
  reply.type("text/html").send(html);
}

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

export function registerDashboardRoutes(app) {
  app.get("/dashboard", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const [tasks, forms] = await Promise.all([
      getTasksForUser(user.tenantId, user),
      listDocs(user.tenantId)
    ]);

    const assignedCount = tasks.assignedTasks.length;
    const openCount = tasks.openTasks.length;
    const formCount = forms.length;

    return render(reply, "dashboard.ejs", {
      user,
      assignedCount,
      openCount,
      formCount
    });
  });
}

// Fallback
export function register(app) {
  return registerDashboardRoutes(app);
}
