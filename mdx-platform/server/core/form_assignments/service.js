// server/core/form_assignments/service.js
// Form -> Groups Assignments (Core)

import { ObjectId } from "mongodb";
import { getFormAssignmentsCollection, getMdxFormsCollection } from "./model.js";

function toObjectIdSafe(id) {
  try {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

export async function listMdxForms(tenantId) {
  const col = await getMdxFormsCollection(tenantId);
  return col
    .find({}, { projection: { slug: 1, title: 1, type: 1 } })
    .sort({ title: 1, slug: 1 })
    .toArray();
}

export async function listFormAssignments(tenantId, { appId = "mdx", formSlug } = {}) {
  const col = await getFormAssignmentsCollection(tenantId);
  const q = { tenantId, appId };
  if (formSlug) q.formSlug = String(formSlug);
  return col.find(q).sort({ createdAt: -1 }).toArray();
}

export async function getAssignedGroupIds(tenantId, { appId = "mdx", formSlug } = {}) {
  if (!tenantId || !formSlug) return [];
  const col = await getFormAssignmentsCollection(tenantId);
  const rows = await col
    .find({ tenantId, appId, formSlug: String(formSlug) }, { projection: { groupId: 1 } })
    .toArray();

  return rows
    .map(r => r.groupId)
    .filter(Boolean)
    .map(g => String(g));
}

export async function setFormAssignments(tenantId, { appId = "mdx", formSlug, groupIds = [] } = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");

  const col = await getFormAssignmentsCollection(tenantId);

  const normalized = Array.isArray(groupIds) ? groupIds : [groupIds];
  const oids = normalized.map(toObjectIdSafe).filter(Boolean);

  await col.deleteMany({ tenantId, appId, formSlug: String(formSlug) });

  const now = new Date();
  if (oids.length === 0) return 0;

  const docs = oids.map(oid => ({
    tenantId,
    appId,
    formSlug: String(formSlug),
    groupId: oid,
    createdAt: now,
    updatedAt: now
  }));

  await col.insertMany(docs);
  return docs.length;
}

/**
 * Helper für Guards:
 * - Wenn KEINE Assignments => offen
 * - Wenn Assignments => User muss in mind. 1 Group sein
 */
export async function isUserAllowedByAssignments(tenantId, user, { appId = "mdx", formSlug } = {}) {
  if (!tenantId || !user || !formSlug) return false;

  const assigned = await getAssignedGroupIds(tenantId, { appId, formSlug });

  // Keine Assignments => offen
  if (!assigned || assigned.length === 0) return true;

  const fromGroupIds =
    Array.isArray(user.groupIds) ? user.groupIds :
    Array.isArray(user.groups) ? user.groups :
    Array.isArray(user.group_ids) ? user.group_ids :
    [];

  // ✅ NEU: groupRoles => groupIds ableiten
  const fromGroupRoles = Array.isArray(user.groupRoles)
    ? user.groupRoles.map(gr => gr?.groupId).filter(Boolean)
    : [];

  const userGroups = [...fromGroupIds, ...fromGroupRoles].map(String).filter(Boolean);
  if (userGroups.length === 0) return false;

  return assigned.some(a => userGroups.includes(String(a)));
}
