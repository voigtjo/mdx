// mongo
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.MONGO_URL;
const platformDbName = process.env.PLATFORM_DB || "platform_v2";

if (!url) {
  throw new Error("MONGO_URL is not defined in .env");
}

const client = new MongoClient(url);
let platformDbCache = null;
const tenantDbCache = new Map();

async function getClient() {
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

// MVP: Tenant "demo" -> DB "tenant_demo"
export async function getTenantDb(tenantId = "demo") {
  if (tenantDbCache.has(tenantId)) {
    return tenantDbCache.get(tenantId);
  }

  const cli = await getClient();
  const dbName = `tenant_${tenantId}`;
  const db = cli.db(dbName);
  tenantDbCache.set(tenantId, db);
  return db;
}
