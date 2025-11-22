// platform/server/core/db/mongo.js

import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const mongoUrl = process.env.MONGO_URL;
const platformDbName = process.env.PLATFORM_DB || "platform";

if (!mongoUrl) {
  throw new Error("❌ MONGO_URL is missing in .env");
}

const client = new MongoClient(mongoUrl);

let platformDbCache = null;
const tenantDbCache = new Map();

export async function getClient() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client;
}

export async function getPlatformDb() {
  if (!platformDbCache) {
    const cli = await getClient();
    platformDbCache = cli.db(platformDbName);
  }
  return platformDbCache;
}

export async function getTenantDb(tenantId) {
  if (tenantDbCache.has(tenantId)) {
    return tenantDbCache.get(tenantId);
  }

  const cli = await getClient();
  const dbName = `tenant_${tenantId}`;

  const db = cli.db(dbName);
  tenantDbCache.set(tenantId, db);

  return db;
}
