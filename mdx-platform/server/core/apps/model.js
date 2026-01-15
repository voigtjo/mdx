// server/core/apps/model.js

import { getTenantDb } from "../db/mongo.js";

const APPS_COLLECTION = "apps";

/**
 * In tenant_<tenantName> DB:
 * Collection "apps"
 * Doc-Beispiel:
 * {
 *   name: "mdx",
 *   label: "MDX Forms",
 *   enabled: true,
 *   createdAt, updatedAt
 * }
 */

async function getAppsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(APPS_COLLECTION);
}

export async function ensureDefaultApps(tenantId) {
  const col = await getAppsCollection(tenantId);
  const count = await col.countDocuments();

  // MVP: Wenn leer, initialisiere mit mdx
  if (count === 0) {
    const now = new Date();
    await col.insertOne({
      name: "mdx",
      label: "MDX Forms",
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
  }
}

export async function listTenantApps(tenantId) {
  const col = await getAppsCollection(tenantId);
  return col.find({}).sort({ name: 1 }).toArray();
}

export async function listEnabledTenantApps(tenantId) {
  const col = await getAppsCollection(tenantId);
  return col.find({ enabled: true }).sort({ name: 1 }).toArray();
}

export async function getTenantApp(tenantId, name) {
  const col = await getAppsCollection(tenantId);
  return col.findOne({ name });
}

export async function setTenantAppEnabled(tenantId, name, enabled) {
  const col = await getAppsCollection(tenantId);
  const now = new Date();

  await col.updateOne(
    { name },
    {
      $set: { enabled: !!enabled, updatedAt: now },
      $setOnInsert: {
        name,
        label: name,
        createdAt: now
      }
    },
    { upsert: true }
  );
}
