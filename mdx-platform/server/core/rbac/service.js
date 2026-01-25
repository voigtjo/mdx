// server/core/rbac/service.js
// Form-RBAC: Roles (pro Form) + RoleBindings (Group -> Role)
// Guard: canUserPerformFormAction(tenantId, user, formSlug, action)

import { ObjectId } from "mongodb";
import { getTenantDb } from "../db/mongo.js";

export const FORM_ROLES_COLLECTION = "core_form_roles";
export const ROLE_BINDINGS_COLLECTION = "core_role_bindings";
export const GROUPS_COLLECTION = "core_groups";

// ------------------------------------------------------------
// Defaults (MVP): werden einmalig pro Form angelegt, falls leer
// ------------------------------------------------------------
const DEFAULT_FORM_ROLES = [
  {
    roleKey: "requester",
    label: "Requester",
    rights: ["form:read", "form:submit"],
    allowedActions: ["form.view", "form.submit"]
  },
  {
    roleKey: "editor",
    label: "Editor",
    rights: ["form:read", "form:write", "form:submit", "form:comment", "submission:read"],
    allowedActions: ["form.view", "form.edit", "form.save", "form.submit", "form.comment", "submission.view"]
  },
  {
    roleKey: "reviewer",
    label: "Reviewer",
    rights: ["form:read", "submission:read", "form:comment"],
    allowedActions: ["form.view", "submission.view", "form.comment"]
  },
  {
    roleKey: "approver",
    label: "Approver",
    rights: ["form:read", "submission:read", "workflow:approve", "workflow:reject", "form:comment"],
    allowedActions: ["form.view", "submission.view", "workflow.approve", "workflow.reject", "workflow.request_changes", "form.comment"]
  },
  {
    roleKey: "operator",
    label: "Operator",
    rights: ["task:read", "task:claim", "task:complete", "workflow:transition"],
    allowedActions: ["task.view", "task.claim", "task.complete", "workflow.request_changes"]
  }
];

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function getFormRolesCol(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(FORM_ROLES_COLLECTION);
}

async function getRoleBindingsCol(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(ROLE_BINDINGS_COLLECTION);
}

async function getGroupsCol(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(GROUPS_COLLECTION);
}

function isTenantAdmin(user) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;
  return roles.includes("admin") || roles.includes("tenant_admin") || roles.includes("superadmin");
}

function toObjectIdSafe(id) {
  try {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

function normalizeStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v).split(",").map(x => x.trim()).filter(Boolean);
}

function uniqueStrings(arr) {
  const s = new Set((arr || []).map(x => String(x)).filter(Boolean));
  return Array.from(s);
}

/**
 * Extrahiert Gruppen-IDs robust:
 * - bevorzugt user.groupIds / user.groups / user.group_ids
 * - ergänzt mit IDs aus user.groupRoles[*].groupId
 */
function getUserGroupIds(user) {
  const direct =
    (Array.isArray(user.groupIds) ? user.groupIds :
    Array.isArray(user.groups) ? user.groups :
    Array.isArray(user.group_ids) ? user.group_ids :
    []);

  const fromGroupRoles = Array.isArray(user.groupRoles)
    ? user.groupRoles.map(gr => gr?.groupId).filter(Boolean)
    : [];

  return uniqueStrings([...direct, ...fromGroupRoles]);
}

/**
 * Extrahiert roleKeys aus user.groupRoles (MVP-Fallback)
 */
function getUserRoleKeysFromGroupRoles(user) {
  if (!Array.isArray(user.groupRoles)) return [];
  const keys = user.groupRoles
    .map(gr => String(gr?.role || "").trim())
    .filter(Boolean);
  return uniqueStrings(keys);
}

// ------------------------------------------------------------
// Public API used by UI routes (server/core/rbac/routes.js)
// ------------------------------------------------------------
export async function ensureDefaultFormRoles(tenantId, formSlug) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");

  const col = await getFormRolesCol(tenantId);
  const count = await col.countDocuments({ tenantId, formSlug });

  if (count > 0) return;

  const now = new Date();
  const docs = DEFAULT_FORM_ROLES.map(r => ({
    tenantId,
    formSlug,
    roleKey: r.roleKey,
    label: r.label || r.roleKey,
    rights: normalizeStringArray(r.rights),
    allowedActions: normalizeStringArray(r.allowedActions),
    createdAt: now,
    updatedAt: now
  }));

  if (docs.length > 0) await col.insertMany(docs);
}

export async function listFormRoles(tenantId, formSlug) {
  const col = await getFormRolesCol(tenantId);
  return col
    .find({ tenantId, formSlug })
    .sort({ createdAt: 1, roleKey: 1 })
    .toArray();
}

export async function upsertFormRole(tenantId, formSlug, { roleKey, label, rights, allowedActions } = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!roleKey) throw new Error("roleKey fehlt");

  const col = await getFormRolesCol(tenantId);

  const now = new Date();
  const doc = {
    tenantId,
    formSlug,
    roleKey: String(roleKey).trim(),
    label: (label ? String(label).trim() : String(roleKey).trim()),
    rights: normalizeStringArray(rights),
    allowedActions: normalizeStringArray(allowedActions),
    updatedAt: now
  };

  await col.updateOne(
    { tenantId, formSlug, roleKey: doc.roleKey },
    {
      $set: doc,
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

export async function deleteFormRole(tenantId, formSlug, roleKey) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!roleKey) throw new Error("roleKey fehlt");

  const rolesCol = await getFormRolesCol(tenantId);
  const bindingsCol = await getRoleBindingsCol(tenantId);

  await rolesCol.deleteOne({ tenantId, formSlug, roleKey: String(roleKey) });
  await bindingsCol.deleteMany({ tenantId, formSlug, roleKey: String(roleKey) });
}

/**
 * ✅ listRoleBindings – jetzt mit groupName (UI)
 */
export async function listRoleBindings(tenantId, formSlug) {
  const col = await getRoleBindingsCol(tenantId);
  const groupsCol = await getGroupsCol(tenantId);

  const bindings = await col
    .find({ tenantId, formSlug })
    .sort({ createdAt: -1 })
    .toArray();

  if (!bindings || bindings.length === 0) return [];

  // groupId -> name map
  const groupIds = uniqueStrings(bindings.map(b => String(b.subjectId)).filter(Boolean))
    .map(toObjectIdSafe)
    .filter(Boolean);

  const groups = groupIds.length > 0
    ? await groupsCol.find({ _id: { $in: groupIds } }, { projection: { name: 1 } }).toArray()
    : [];

  const nameById = new Map(groups.map(g => [String(g._id), g.name]));

  return bindings.map(b => ({
    ...b,
    groupName: nameById.get(String(b.subjectId)) || null
  }));
}

/**
 * ✅ FIX: Multi-Bindings erlauben
 * vorher: upsert auf (groupId + formSlug) -> überschreibt alte Rolle
 * jetzt: upsert auf (groupId + formSlug + roleKey) -> mehrere Rollen möglich
 */
export async function bindGroupToRole(tenantId, formSlug, { groupId, roleKey } = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!groupId) throw new Error("groupId fehlt");
  if (!roleKey) throw new Error("roleKey fehlt");

  const col = await getRoleBindingsCol(tenantId);

  const subjectId = toObjectIdSafe(groupId);
  if (!subjectId) throw new Error("groupId ist keine gültige ObjectId");

  const now = new Date();
  const rk = String(roleKey).trim();

  await col.updateOne(
    // ✅ roleKey gehört in den Filter
    { tenantId, formSlug, subjectType: "group", subjectId, roleKey: rk },
    {
      $set: {
        tenantId,
        formSlug,
        subjectType: "group",
        subjectId,
        roleKey: rk,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

export async function unbind(tenantId, bindingId) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!bindingId) throw new Error("bindingId fehlt");

  const col = await getRoleBindingsCol(tenantId);
  const _id = toObjectIdSafe(bindingId);
  if (!_id) throw new Error("bindingId ist keine gültige ObjectId");

  await col.deleteOne({ tenantId, _id });
}

// ------------------------------------------------------------
// Guard used by apps (apps/mdx/routes.js)
// ------------------------------------------------------------
export async function canUserPerformFormAction(tenantId, user, formSlug, action) {
  if (!tenantId || !user || !formSlug || !action) return false;

  // Dev/Bootstrap: Tenant-Admins dürfen alles (damit du bauen kannst)
  if (isTenantAdmin(user)) return true;

  // 1) Gruppen-IDs robust ermitteln (inkl. aus groupRoles abgeleitet)
  const groupIds = getUserGroupIds(user);
  const groupObjectIds = groupIds.map(toObjectIdSafe).filter(Boolean);

  // 2) sauber: core_role_bindings (Group -> Role)
  let roleKeys = [];

  if (groupObjectIds.length > 0) {
    const bindingsCol = await getRoleBindingsCol(tenantId);

    const bindings = await bindingsCol
      .find({
        tenantId,
        formSlug,
        subjectType: "group",
        subjectId: { $in: groupObjectIds }
      })
      .toArray();

    if (bindings && bindings.length > 0) {
      roleKeys = uniqueStrings(bindings.map(b => b.roleKey).filter(Boolean));
    }
  }

  // 3) MVP-Fallback: wenn keine Bindings existieren, nutze user.groupRoles direkt
  if (roleKeys.length === 0) {
    roleKeys = getUserRoleKeysFromGroupRoles(user);
  }

  if (roleKeys.length === 0) return false;

  const rolesCol = await getFormRolesCol(tenantId);

  const roles = await rolesCol
    .find({ tenantId, formSlug, roleKey: { $in: roleKeys } })
    .toArray();

  if (!roles || roles.length === 0) return false;

  // Erlaubnis über allowedActions
  return roles.some(r => {
    const allowed = Array.isArray(r.allowedActions) ? r.allowedActions : [];
    if (allowed.includes("*")) return true;
    return allowed.includes(String(action));
  });
}

// ------------------------------------------------------------
// Optional: Indexes (für später / GitHub Zwischenstand)
// ------------------------------------------------------------
export async function ensureRbacIndexes(tenantId) {
  const rolesCol = await getFormRolesCol(tenantId);
  const bindingsCol = await getRoleBindingsCol(tenantId);

  // Rollen: pro Form + roleKey eindeutig
  await rolesCol.createIndex({ tenantId: 1, formSlug: 1, roleKey: 1 }, { unique: true });

  // Bindings: pro Form + group + roleKey eindeutig (Multi-Roles möglich)
  await bindingsCol.createIndex(
    { tenantId: 1, formSlug: 1, subjectType: 1, subjectId: 1, roleKey: 1 },
    { unique: true }
  );

  await bindingsCol.createIndex({ tenantId: 1, formSlug: 1, createdAt: -1 });
}
