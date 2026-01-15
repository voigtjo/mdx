// server/core/tenants/model.js

import { ObjectId } from "mongodb";
import { getPlatformDb } from "../db/mongo.js";

const TENANTS_COLLECTION = "tenants";

async function getTenantsCollection() {
  const db = await getPlatformDb();
  return db.collection(TENANTS_COLLECTION);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id.toString());
  } catch {
    return null;
  }
}

/**
 * Liste aller Platform-Tenants
 * Erwartete Felder (MVP): { id: "demo", name: "Demo Tenant", createdAt }
 */
export async function listTenants() {
  const col = await getTenantsCollection();
  return col.find({}).sort({ createdAt: -1, name: 1 }).toArray();
}

export async function getTenantById(idOrObjectId) {
  const col = await getTenantsCollection();
  const _id = toObjectId(idOrObjectId);
  if (!_id) return null;
  return col.findOne({ _id });
}
