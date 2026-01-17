// server/core/rbac/model.js

import { getTenantDb } from "../db/mongo.js";

export const FORM_ROLES_COLLECTION = "core_form_roles";
export const ROLE_BINDINGS_COLLECTION = "core_role_bindings";

export async function getFormRolesCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(FORM_ROLES_COLLECTION);
}

export async function getRoleBindingsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(ROLE_BINDINGS_COLLECTION);
}
