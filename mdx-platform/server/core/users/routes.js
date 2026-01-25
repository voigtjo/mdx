// server/core/users/routes.js

import path from "path";
import ejs from "ejs";
import { promisify } from "util";
import { fileURLToPath } from "url";

import {
  getUsersForTenant,
  createUserForTenant,
  listGroupsForTenant,
  addGroupRoleToUser,
  removeGroupRoleFromUser,
  getUserById
} from "./model.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// UI root: server/core/ui
const uiRoot = path.join(__dirname, "..", "ui");

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

function isAdmin(user) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;
  return roles.includes("admin") || roles.includes("tenant_admin") || roles.includes("superadmin");
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

function userAnchor(userId) {
  return `#user-${encodeURIComponent(String(userId))}`;
}

function isHtmx(req) {
  // HTMX setzt "HX-Request: true"
  return String(req.headers["hx-request"] || "").toLowerCase() === "true";
}

async function renderGroupRolesModal(req, reply, { tenantId, admin, userToEdit, groups, roleOptions }) {
  const fullPath = path.join(uiRoot, "users", "_group_roles_modal.ejs");

  const html = await renderFile(
    fullPath,
    {
      // locals für nav/layout sind hier nicht nötig, wir liefern ein Partial
      tenantId,
      user: admin,
      userToEdit,
      groups,
      roleOptions
    },
    { root: uiRoot }
  );

  reply.type("text/html; charset=utf-8").send(html);
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

    const [users, groups] = await Promise.all([
      getUsersForTenant(tenantId),
      listGroupsForTenant(tenantId)
    ]);

    const roleOptions = ["editor", "operator", "approver"]; // MVP (form-übergreifend)

    return reply.view("users/index.ejs", {
      title: "Users",
      activeSection: "tenant",
      currentApp: null,

      user: admin,
      tenantId,
      users,
      groups,
      roleOptions,
      createdUser: null
    });
  });

  // -------------------------------------------------------
  // Tenant-scoped: POST /tenant/:tenantId/users (create user)
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

    const [users, groups] = await Promise.all([
      getUsersForTenant(tenantId),
      listGroupsForTenant(tenantId)
    ]);
    const roleOptions = ["editor", "operator", "approver"];

    return reply.view("users/index.ejs", {
      title: "Users",
      activeSection: "tenant",
      currentApp: null,

      user: admin,
      tenantId,
      users,
      groups,
      roleOptions,
      createdUser
    });
  });

  // -------------------------------------------------------
  // Modal: GET /tenant/:tenantId/users/:userId/group-roles/modal
  // -------------------------------------------------------
  app.get("/tenant/:tenantId/users/:userId/group-roles/modal", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const tenantId = resolveTenantId(req, admin);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const { userId } = req.params;

    const [userToEdit, groups] = await Promise.all([
      getUserById(tenantId, userId),
      listGroupsForTenant(tenantId)
    ]);

    if (!userToEdit) return reply.code(404).send("User nicht gefunden");

    const roleOptions = ["editor", "operator", "approver"];

    return renderGroupRolesModal(req, reply, {
      tenantId,
      admin,
      userToEdit,
      groups,
      roleOptions
    });
  });

  // -------------------------------------------------------
  // Add GroupRole: POST /tenant/:tenantId/users/:userId/group-roles/add
  // -------------------------------------------------------
  app.post("/tenant/:tenantId/users/:userId/group-roles/add", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const tenantId = resolveTenantId(req, admin);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const { userId } = req.params;
    const { groupId, roleKey } = req.body || {};

    await addGroupRoleToUser(tenantId, userId, { groupId, roleKey });

    if (isHtmx(req)) {
      const [userToEdit, groups] = await Promise.all([
        getUserById(tenantId, userId),
        listGroupsForTenant(tenantId)
      ]);
      const roleOptions = ["editor", "operator", "approver"];
      return renderGroupRolesModal(req, reply, { tenantId, admin, userToEdit, groups, roleOptions });
    }

    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/users${userAnchor(userId)}`);
  });

  // -------------------------------------------------------
  // Remove GroupRole: POST /tenant/:tenantId/users/:userId/group-roles/remove
  // -------------------------------------------------------
  app.post("/tenant/:tenantId/users/:userId/group-roles/remove", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const tenantId = resolveTenantId(req, admin);
    if (!tenantId) return reply.code(400).send("tenantId fehlt");

    const { userId } = req.params;
    const { groupId, roleKey } = req.body || {};

    await removeGroupRoleFromUser(tenantId, userId, { groupId, roleKey });

    if (isHtmx(req)) {
      const [userToEdit, groups] = await Promise.all([
        getUserById(tenantId, userId),
        listGroupsForTenant(tenantId)
      ]);
      const roleOptions = ["editor", "operator", "approver"];
      return renderGroupRolesModal(req, reply, { tenantId, admin, userToEdit, groups, roleOptions });
    }

    return reply.redirect(`/tenant/${encodeURIComponent(tenantId)}/users${userAnchor(userId)}`);
  });

  // -------------------------------------------------------
  // Legacy: /users -> redirect auf tenant scoped
  // -------------------------------------------------------
  app.get("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    if (!admin.tenantId) return reply.code(400).send("tenantId fehlt in Session");
    return reply.redirect(`/tenant/${encodeURIComponent(admin.tenantId)}/users`);
  });

  app.post("/users", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    if (!admin.tenantId) return reply.code(400).send("tenantId fehlt in Session");
    return reply.redirect(307, `/tenant/${encodeURIComponent(admin.tenantId)}/users`);
  });
}

export function register(app) {
  return registerUserRoutes(app);
}
