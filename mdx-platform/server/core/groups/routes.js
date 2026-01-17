// server/core/groups/routes.js

import {
  listGroups,
  createGroup,
  deleteGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember
} from "./service.js";

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
  // UI: Groups overview
  app.get("/tenant/:tenantId/groups", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const groups = await listGroups(tenantId);

    return reply.view("groups/index.ejs", {
      title: "Groups",
      activeSection: "tenant",
      currentApp: null,
      user,
      tenantId,
      groups,
      selectedGroup: null,
      members: [],
      error: null
    });
  });

  // UI: select group (members)
  app.get("/tenant/:tenantId/groups/:groupId", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const groups = await listGroups(tenantId);
    const selectedGroup = groups.find(g => String(g._id) === String(req.params.groupId)) || null;

    const members = selectedGroup ? await listGroupMembers(tenantId, selectedGroup._id) : [];

    return reply.view("groups/index.ejs", {
      title: "Groups",
      activeSection: "tenant",
      currentApp: null,
      user,
      tenantId,
      groups,
      selectedGroup,
      members,
      error: null
    });
  });

  // UI: create group
  app.post("/tenant/:tenantId/groups", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    try {
      await createGroup(tenantId, {
        name: req.body?.name,
        description: req.body?.description
      }, { user });

      return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/groups`);
    } catch (e) {
      const groups = await listGroups(tenantId);
      return reply.view("groups/index.ejs", {
        title: "Groups",
        activeSection: "tenant",
        currentApp: null,
        user,
        tenantId,
        groups,
        selectedGroup: null,
        members: [],
        error: e?.message || "Error"
      });
    }
  });

  // UI: delete group
  app.post("/tenant/:tenantId/groups/:groupId/delete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    await deleteGroup(tenantId, req.params.groupId);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/groups`);
  });

  // UI: add member
  app.post("/tenant/:tenantId/groups/:groupId/members", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    const groupId = req.params.groupId;

    try {
      await addGroupMember(tenantId, groupId, {
        // MVP: nur per email (passt zu deinem Users-Model ohne harte ObjectId-Abhängigkeit)
        email: req.body?.email
      }, { user });

      return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/groups/${encodeURIComponent(groupId)}`);
    } catch (e) {
      // reload with error
      const groups = await listGroups(tenantId);
      const selectedGroup = groups.find(g => String(g._id) === String(groupId)) || null;
      const members = selectedGroup ? await listGroupMembers(tenantId, selectedGroup._id) : [];

      return reply.view("groups/index.ejs", {
        title: "Groups",
        activeSection: "tenant",
        currentApp: null,
        user,
        tenantId,
        groups,
        selectedGroup,
        members,
        error: e?.message || "Error"
      });
    }
  });

  // UI: remove member
  app.post("/tenant/:tenantId/groups/:groupId/members/:memberId/delete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const tenantId = tenantMatchOr403(req, reply, user);
    if (!tenantId) return;

    if (!isTenantAdmin(user)) return reply.code(403).send("Forbidden – Adminrechte erforderlich");

    await removeGroupMember(tenantId, req.params.memberId);
    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/groups/${encodeURIComponent(req.params.groupId)}`);
  });
}
