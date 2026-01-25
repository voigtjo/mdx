// server/core/users/model.js

import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { getTenantDb } from "../db/mongo.js";

const USERS_COLLECTION = "users";
const GROUPS_COLLECTION = "core_groups";

// -----------------------------------------
// Helpers
// -----------------------------------------
async function getUsersCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(USERS_COLLECTION);
}

async function getGroupsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(GROUPS_COLLECTION);
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

// kleines Hilfs-Password für MVP
function generateSimplePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function normalizeRoles(roles) {
  if (Array.isArray(roles)) return roles.map(r => String(r).trim()).filter(Boolean);
  if (typeof roles === "string") return roles.split(",").map(r => r.trim()).filter(Boolean);
  return [];
}

function normalizeGroupRoleInput({ groupId, roleKey }) {
  const gid = toObjectId(groupId);
  const rk = String(roleKey || "").trim();
  if (!gid || !rk) return null;
  return { groupId: gid, role: rk };
}

function sameOid(a, b) {
  return String(a) === String(b);
}

// -----------------------------------------
// Public API – Users
// -----------------------------------------
export async function listUsers(tenantId) {
  const col = await getUsersCollection(tenantId);
  return col.find({}).sort({ email: 1 }).toArray();
}

export async function getUserById(tenantId, id) {
  const col = await getUsersCollection(tenantId);
  const _id = toObjectId(id);
  if (!_id) return null;
  return col.findOne({ _id });
}

export async function getUserByEmail(tenantId, email) {
  const col = await getUsersCollection(tenantId);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return col.findOne({ email: e });
}

/**
 * upsertUser
 * - wenn id vorhanden -> Update
 * - sonst -> Insert
 *
 * fields:
 *   { id?, email, password?, roles, mustChangePassword }
 */
export async function upsertUser(
  tenantId,
  { id, email, password, roles = [], mustChangePassword = false }
) {
  const col = await getUsersCollection(tenantId);

  if (!email) throw new Error("email ist erforderlich");

  const cleanRoles = normalizeRoles(roles);
  const now = new Date();
  const passwordUpdate = {};

  if (password && String(password).trim().length > 0) {
    const hash = await bcrypt.hash(String(password).trim(), 10);
    passwordUpdate.passwordHash = hash;
  }

  if (id) {
    const _id = toObjectId(id);
    if (!_id) throw new Error("Ungültige User-ID");

    await col.updateOne(
      { _id },
      {
        $set: {
          email: String(email).trim().toLowerCase(),
          roles: cleanRoles,
          mustChangePassword: !!mustChangePassword,
          updatedAt: now,
          ...passwordUpdate
        }
      }
    );
    return _id;
  }

  if (!passwordUpdate.passwordHash) {
    throw new Error("Für neue Benutzer ist ein Passwort erforderlich (wird gehasht gespeichert).");
  }

  const doc = {
    email: String(email).trim().toLowerCase(),
    roles: cleanRoles,
    mustChangePassword: !!mustChangePassword,
    createdAt: now,
    ...passwordUpdate,

    // MVP: mehrere Gruppenrollen möglich
    groupRoles: []
  };

  const res = await col.insertOne(doc);
  return res.insertedId;
}

// -----------------------------------------
// Public API – Wrapper für aktuelle Routes
// -----------------------------------------
export async function getUsersForTenant(tenantId) {
  return listUsers(tenantId);
}

export async function createUserForTenant(
  tenantId,
  { email, password, roles, mustChangePassword = false }
) {
  if (!email) throw new Error("email ist erforderlich");

  const finalPassword = (password && String(password).trim()) || generateSimplePassword();
  const id = await upsertUser(tenantId, {
    email,
    password: finalPassword,
    roles,
    mustChangePassword
  });

  return {
    id,
    email: String(email).trim().toLowerCase(),
    roles: normalizeRoles(roles),
    password: finalPassword
  };
}

// -----------------------------------------
// Groups (für Dropdown in Users UI)
// -----------------------------------------
export async function listGroupsForTenant(tenantId) {
  const col = await getGroupsCollection(tenantId);
  return col
    .find({ tenantId }, { projection: { name: 1, description: 1, createdAt: 1 } })
    .sort({ name: 1 })
    .toArray();
}

// -----------------------------------------
// GroupRoles am User (additiv!)
// -----------------------------------------

/**
 * Additiv hinzufügen:
 * - fügt (groupId, roleKey) hinzu, wenn nicht vorhanden
 * - überschreibt NICHT andere Rollen
 */
export async function addGroupRoleToUser(tenantId, userId, { groupId, roleKey }) {
  const col = await getUsersCollection(tenantId);
  const _id = toObjectId(userId);
  if (!_id) throw new Error("Ungültige User-ID");

  const normalized = normalizeGroupRoleInput({ groupId, roleKey });
  if (!normalized) throw new Error("groupId/roleKey ungültig");

  const now = new Date();
  const user = await col.findOne({ _id }, { projection: { groupRoles: 1 } });

  const current = Array.isArray(user?.groupRoles) ? user.groupRoles : [];
  const exists = current.some(gr => sameOid(gr.groupId, normalized.groupId) && String(gr.role) === normalized.role);

  if (exists) {
    // trotzdem updatedAt setzen
    await col.updateOne({ _id }, { $set: { updatedAt: now } });
    return;
  }

  await col.updateOne(
    { _id },
    {
      $push: { groupRoles: { groupId: normalized.groupId, role: normalized.role } },
      $set: { updatedAt: now }
    }
  );
}

/**
 * Entfernen einer konkreten Zuordnung (groupId + roleKey)
 */
export async function removeGroupRoleFromUser(tenantId, userId, { groupId, roleKey }) {
  const col = await getUsersCollection(tenantId);
  const _id = toObjectId(userId);
  if (!_id) throw new Error("Ungültige User-ID");

  const normalized = normalizeGroupRoleInput({ groupId, roleKey });
  if (!normalized) throw new Error("groupId/roleKey ungültig");

  const now = new Date();
  await col.updateOne(
    { _id },
    {
      $pull: { groupRoles: { groupId: normalized.groupId, role: normalized.role } },
      $set: { updatedAt: now }
    }
  );
}
