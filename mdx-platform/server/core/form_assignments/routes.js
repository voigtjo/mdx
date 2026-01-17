// server/core/form_assignments/routes.js
// UI: Form Assignments (Form -> Groups)

import { listGroups } from "../groups/service.js";
import { listMdxForms, getAssignedGroupIds, setFormAssignments } from "./service.js";

function requireUser(req, reply) {
  if (!req.session?.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

function hasRole(user, name) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;
  return roles.includes(name);
}

function isTenantAdmin(user) {
  return hasRole(user, "admin") || hasRole(user, "tenant_admin") || hasRole(user, "superadmin");
}

function tenantMatchOr403(req, reply, user) {
  const tenantId = req.params.tenantId;
  if (!tenantId) return reply.code(400).send("tenantId fehlt");
  if (String(tenantId) !== String(user.tenantId)) return reply.code(403).send("tenant mismatch");
  return tenantId;
}

export function register(app) {
  // UI: /tenant/:tenantId/forms/assignments?formSlug=...
  app.get("/tenant/:tenantId/forms/assignments", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const forms = await listMdxForms(tenantId);
    const groups = await listGroups(tenantId);

    const formSlug = (req.query?.formSlug ?? "").toString().trim();
    const selectedSlug = formSlug || (forms[0]?.slug ? String(forms[0].slug) : "");

    const assignedGroupIds = selectedSlug
      ? await getAssignedGroupIds(tenantId, { appId: "mdx", formSlug: selectedSlug })
      : [];

    return reply.view("forms/assignments.ejs", {
      title: "Form Assignments",
      activeSection: "tenant",
      currentApp: null,
      user,
      tenantId,
      forms,
      groups,
      selectedSlug,
      assignedGroupIds,
      saved: false
    });
  });

  // POST: setzen
  app.post("/tenant/:tenantId/forms/assignments/set", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const formSlug = (req.body?.formSlug ?? "").toString().trim();
    if (!formSlug) return reply.code(400).send("formSlug fehlt");

    let groupIds = [];
    if (Array.isArray(req.body.groupIds)) groupIds = req.body.groupIds;
    else if (req.body.groupIds) groupIds = [req.body.groupIds];

    await setFormAssignments(tenantId, { appId: "mdx", formSlug, groupIds });

    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/forms/assignments?formSlug=${encodeURIComponent(formSlug)}&saved=1`);
  });
}
