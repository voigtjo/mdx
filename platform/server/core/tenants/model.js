import { getPlatformDb } from "../db/mongo.js";

export async function createTenant(name) {
  const db = await getPlatformDb();

  const tenantId = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  const tenant = {
    id: tenantId,
    name,
    createdAt: new Date(),
    appsEnabled: []
  };

  await db.collection("tenants").insertOne(tenant);
  return tenant;
}

export async function listTenants() {
  const db = await getPlatformDb();
  return db.collection("tenants").find().toArray();
}
