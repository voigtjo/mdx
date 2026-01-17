// server/core/form_assignments/model.js
// Core Mapping: Form -> Groups (Assignments)

import { getTenantDb } from "../db/mongo.js";

export const FORM_ASSIGNMENTS_COLLECTION = "core_form_assignments";

// Für MVP lesen wir Forms aus der MDX-App Collection (tenant-scoped)
export const MDX_FORMS_COLLECTION = "mdx_forms";

export async function getFormAssignmentsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(FORM_ASSIGNMENTS_COLLECTION);
}

export async function getMdxFormsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(MDX_FORMS_COLLECTION);
}
