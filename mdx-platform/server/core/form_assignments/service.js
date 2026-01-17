// server/core/form_assignments/service.js
// Form -> Groups Assignments (Core)
// Wenn ein Form Assignments hat (>0), dann gilt: nur diese Groups dürfen das Form nutzen.

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
  const oids = normalized
    .map(toObjectIdSafe)
    .filter(Boolean);

  // Strategie: replace-all
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
 * - Wenn es KEINE Assignments gibt, gilt "offen" (nicht blockieren).
 * - Wenn es Assignments gibt, muss User in mind. 1 dieser Groups sein.
 */
export async function isUserAllowedByAssignments(tenantId, user, { appId = "mdx", formSlug } = {}) {
  if (!tenantId || !user || !formSlug) return false;

  const assigned = await getAssignedGroupIds(tenantId, { appId, formSlug });

  // Keine Assignments => offen
  if (!assigned || assigned.length === 0) return true;

  const userGroups =
    (Array.isArray(user.groupIds) ? user.groupIds :
    Array.isArray(user.groups) ? user.groups :
    Array.isArray(user.group_ids) ? user.group_ids :
    []);

  if (!userGroups || userGroups.length === 0) return false;

  const userGroupStrings = userGroups.map(String);
  return assigned.some(a => userGroupStrings.includes(String(a)));
}
