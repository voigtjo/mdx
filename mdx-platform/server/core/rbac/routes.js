// server/core/rbac/routes.js

import { listGroups } from "../groups/service.js";
import {
  ensureDefaultFormRoles,
  listFormRoles,
  upsertFormRole,
  deleteFormRole,
  listRoleBindings,
  bindGroupToRole,
  unbind
} from "./service.js";

import { FORM_ACTIONS, RIGHTS } from "./defs.js";

// ✅ RBAC Startseite braucht Forms
import { listDocs } from "../../../apps/mdx/model.js";

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

function splitCsv(v) {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

export function register(app) {
  // ✅ UI: RBAC Startseite (Liste Forms)
  app.get("/tenant/:tenantId/rbac", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const docs = await listDocs(tenantId);

    return reply.view("rbac/index.ejs", {
      title: "RBAC",
      activeSection: "tenant",
      currentApp: null,
      user,
      tenantId,
      docs
    });
  });

  // UI: RBAC for a form
  app.get("/tenant/:tenantId/rbac/forms/:formSlug", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const formSlug = req.params.formSlug;

    await ensureDefaultFormRoles(tenantId, formSlug);

    const roles = await listFormRoles(tenantId, formSlug);
    const groups = await listGroups(tenantId);
    const bindings = await listRoleBindings(tenantId, formSlug);

    return reply.view("rbac/form_rbac.ejs", {
      title: `RBAC – ${formSlug}`,
      activeSection: "tenant",
      currentApp: null,
      user,
      tenantId,
      formSlug,
      roles,
      groups,
      bindings,
      rightsCatalog: RIGHTS,
      actionsCatalog: FORM_ACTIONS,
      error: null
    });
  });

  // UI: upsert role
  app.post("/tenant/:tenantId/rbac/forms/:formSlug/roles", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const formSlug = req.params.formSlug;

    try {
      await upsertFormRole(tenantId, formSlug, {
        roleKey: req.body?.roleKey,
        label: req.body?.label,
        rights: splitCsv(req.body?.rights),
        allowedActions: splitCsv(req.body?.allowedActions)
      });

      return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/rbac/forms/${encodeURIComponent(formSlug)}`);
    } catch (e) {
      const roles = await listFormRoles(tenantId, formSlug);
      const groups = await listGroups(tenantId);
      const bindings = await listRoleBindings(tenantId, formSlug);

      return reply.view("rbac/form_rbac.ejs", {
        title: `RBAC – ${formSlug}`,
        activeSection: "tenant",
        currentApp: null,
        user,
        tenantId,
        formSlug,
        roles,
        groups,
        bindings,
        rightsCatalog: RIGHTS,
        actionsCatalog: FORM_ACTIONS,
        error: e?.message || "Error"
      });
    }
  });

  // UI: delete role
  app.post("/tenant/:tenantId/rbac/forms/:formSlug/roles/:roleKey/delete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    await deleteFormRole(tenantId, req.params.formSlug, req.params.roleKey);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/rbac/forms/${encodeURIComponent(req.params.formSlug)}`);
  });

  // UI: bind group -> role
  app.post("/tenant/:tenantId/rbac/forms/:formSlug/bindings", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    await bindGroupToRole(tenantId, req.params.formSlug, {
      groupId: req.body?.groupId,
      roleKey: req.body?.roleKey
    });

    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/rbac/forms/${encodeURIComponent(req.params.formSlug)}`);
  });

  // UI: unbind
  app.post("/tenant/:tenantId/rbac/forms/:formSlug/bindings/:bindingId/delete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;
    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    await unbind(tenantId, req.params.bindingId);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/rbac/forms/${encodeURIComponent(req.params.formSlug)}`);
  });
}
