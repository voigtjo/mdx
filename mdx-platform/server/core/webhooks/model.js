// server/core/webhooks/model.js
// Collections + helper

import { getTenantDb } from "../db/mongo.js";

export const WEBHOOKS_COLLECTION = "core_webhooks";
export const WEBHOOK_DELIVERIES_COLLECTION = "core_webhook_deliveries";

export async function getWebhooksCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(WEBHOOKS_COLLECTION);
}

export async function getWebhookDeliveriesCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(WEBHOOK_DELIVERIES_COLLECTION);
}
