// server/core/audit/service.js
// Append-only Audit Log (tenant-scoped)

import { getTenantDb } from "../db/mongo.js";

const AUDIT_COLLECTION = "core_audit_log";

function safeActor(ctx) {
  const user = ctx?.user || null;

  // Session-User kann _id oder id etc. haben
  const userId = user?._id?.toString?.() || user?.id || user?.userId || null;
  const email = user?.email || null;

  return {
    userId,
    email,
    roles: Array.isArray(user?.roles) ? user.roles : [],
    tenantId: ctx?.tenantId || user?.tenantId || null
  };
}

export async function appendAudit(tenantId, eventName, payload = {}, ctx = {}) {
  if (!tenantId) return;

  const db = await getTenantDb(tenantId);
  const col = db.collection(AUDIT_COLLECTION);

  const now = new Date();

  await col.insertOne({
    tenantId,
    eventName,
    payload,
    actor: safeActor(ctx),
    meta: {
      source: ctx?.source || "unknown",
      requestId: ctx?.requestId || null
    },
    createdAt: now
  });
}

export async function listAudit(tenantId, { limit = 50 } = {}) {
  const db = await getTenantDb(tenantId);
  const col = db.collection(AUDIT_COLLECTION);

  return col
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(200, limit)))
    .toArray();
}
