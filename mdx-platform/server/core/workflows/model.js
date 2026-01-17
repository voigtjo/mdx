// server/core/workflows/model.js
// Core Workflow Engine - Mongo Collections (tenant-scoped)

import { getTenantDb } from "../db/mongo.js";

export const WORKFLOW_DEFS_COLLECTION = "core_workflow_defs";
export const WORKFLOW_INSTANCES_COLLECTION = "core_workflow_instances";

export async function getWorkflowDefsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(WORKFLOW_DEFS_COLLECTION);
}

export async function getWorkflowInstancesCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(WORKFLOW_INSTANCES_COLLECTION);
}
