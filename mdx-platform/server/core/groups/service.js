// server/core/groups/service.js

import { ObjectId } from "mongodb";
import { getGroupsCollection, getGroupMembersCollection } from "./model.js";

function now() {
  return new Date();
}

function toId(v) {
  try {
    return new ObjectId(String(v));
  } catch {
    return null;
  }
}

export async function listGroups(tenantId) {
  const col = await getGroupsCollection(tenantId);
  return col.find({ tenantId }).sort({ name: 1 }).toArray();
}

export async function createGroup(tenantId, { name, description }, ctx = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  const n = (name ?? "").toString().trim();
  if (!n) throw new Error("name fehlt");

  const col = await getGroupsCollection(tenantId);

  // uniqueness per tenant
  const existing = await col.findOne({ tenantId, name: n });
  if (existing) throw new Error("Gruppe existiert bereits");

  const doc = {
    tenantId,
    name: n,
    description: (description ?? "").toString().trim() || "",
    createdAt: now(),
    createdBy: ctx?.user?.email || ctx?.user?._id || null
  };

  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function deleteGroup(tenantId, groupId) {
  const gid = toId(groupId);
  if (!gid) throw new Error("invalid groupId");

  const groups = await getGroupsCollection(tenantId);
  const members = await getGroupMembersCollection(tenantId);

  await members.deleteMany({ tenantId, groupId: gid });
  await groups.deleteOne({ tenantId, _id: gid });
}

export async function listGroupMembers(tenantId, groupId) {
  const gid = toId(groupId);
  if (!gid) throw new Error("invalid groupId");

  const col = await getGroupMembersCollection(tenantId);
  return col.find({ tenantId, groupId: gid }).sort({ createdAt: -1 }).toArray();
}

export async function addGroupMember(tenantId, groupId, { userId, email }, ctx = {}) {
  const gid = toId(groupId);
  if (!gid) throw new Error("invalid groupId");

  const uid = userId ? toId(userId) : null;
  const em = (email ?? "").toString().trim().toLowerCase();

  if (!uid && !em) throw new Error("userId oder email erforderlich");

  const col = await getGroupMembersCollection(tenantId);

  const exists = await col.findOne({
    tenantId,
    groupId: gid,
    ...(uid ? { userId: uid } : { email: em })
  });
  if (exists) return exists;

  const doc = {
    tenantId,
    groupId: gid,
    userId: uid || null,
    email: uid ? null : em,
    createdAt: now(),
    createdBy: ctx?.user?.email || ctx?.user?._id || null
  };

  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function removeGroupMember(tenantId, memberId) {
  const mid = toId(memberId);
  if (!mid) throw new Error("invalid memberId");

  const col = await getGroupMembersCollection(tenantId);
  await col.deleteOne({ tenantId, _id: mid });
}

/**
 * Für RBAC: alle GroupIds eines Users ermitteln
 * - match über user._id (ObjectId) oder fallback email
 */
export async function getUserGroupIds(tenantId, user) {
  const col = await getGroupMembersCollection(tenantId);
  const email = (user?.email ?? "").toString().trim().toLowerCase();

  let userId = null;
  try {
    userId = user?._id ? new ObjectId(String(user._id)) : null;
  } catch {
    userId = null;
  }

  const q = {
    tenantId,
    $or: [
      ...(userId ? [{ userId }] : []),
      ...(email ? [{ email }] : [])
    ]
  };

  if (!q.$or.length) return [];

  const rows = await col.find(q).toArray();
  return rows.map(r => r.groupId).filter(Boolean);
}
