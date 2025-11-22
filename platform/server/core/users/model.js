import bcrypt from "bcryptjs";
import { getTenantDb } from "../db/mongo.js";

export async function createUser(tenantId, email, roles = ["user"]) {
  const db = await getTenantDb(tenantId);

  const password = Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    email,
    roles,
    passwordHash,
    createdAt: new Date(),
    mustChangePassword: true
  };

  await db.collection("users").insertOne(user);
  return { ...user, password };
}

export async function listUsers(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection("users").find().toArray();
}
