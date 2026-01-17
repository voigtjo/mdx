// server/core/groups/model.js

import { getTenantDb } from "../db/mongo.js";

export const GROUPS_COLLECTION = "core_groups";
export const GROUP_MEMBERS_COLLECTION = "core_group_members";

export async function getGroupsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(GROUPS_COLLECTION);
}

export async function getGroupMembersCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(GROUP_MEMBERS_COLLECTION);
}
