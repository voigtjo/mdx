// server/core/users/model.js

import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs"; // npm i bcryptjs
import { getTenantDb } from "../db/mongo.js";

const USERS_COLLECTION = "users";

// -----------------------------------------
// Helpers
// -----------------------------------------
async function getUsersCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(USERS_COLLECTION);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id.toString());
  } catch (e) {
    return null;
  }
}

// kleines Hilfs-Password für MVP
function generateSimplePassword(length = 12) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// -----------------------------------------
// Public API – bestehende Funktionen
// -----------------------------------------

export async function listUsers(tenantId) {
  const col = await getUsersCollection(tenantId);
  return col
    .find({})
    .sort({ email: 1 })
    .toArray();
}

export async function getUserById(tenantId, id) {
  const col = await getUsersCollection(tenantId);
  const _id = toObjectId(id);
  if (!_id) return null;
  return col.findOne({ _id });
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

  if (!email) {
    throw new Error("email ist erforderlich");
  }

  // Rollen immer als Array von Strings
  const cleanRoles = Array.isArray(roles)
    ? roles.map(r => r.toString())
    : roles
    ? [roles.toString()]
    : [];

  const now = new Date();
  const passwordUpdate = {};

  if (password && password.trim().length > 0) {
    const hash = await bcrypt.hash(password.trim(), 10);
    passwordUpdate.passwordHash = hash;
  }

  if (id) {
    const _id = toObjectId(id);
    if (!_id) {
      throw new Error("Ungültige User-ID");
    }

    const update = {
      $set: {
        email: email.trim(),
        roles: cleanRoles,
        mustChangePassword: !!mustChangePassword,
        updatedAt: now,
        ...passwordUpdate
      }
    };

    await col.updateOne({ _id }, update);
    return _id;
  } else {
    if (!passwordUpdate.passwordHash) {
      throw new Error(
        "Für neue Benutzer ist ein Passwort erforderlich (wird gehasht gespeichert)."
      );
    }

    const doc = {
      email: email.trim(),
      roles: cleanRoles,
      mustChangePassword: !!mustChangePassword,
      createdAt: now,
      ...passwordUpdate
    };

    const res = await col.insertOne(doc);
    return res.insertedId;
  }
}

// -----------------------------------------
// Public API – Wrapper für aktuelle Routes
// -----------------------------------------

// Wird von server/core/users/routes.js erwartet
export async function getUsersForTenant(tenantId) {
  // einfach Alias auf deine bestehende Funktion
  return listUsers(tenantId);
}

// Wird von server/core/users/routes.js erwartet
export async function createUserForTenant(
  tenantId,
  { email, password, roles, mustChangePassword = false }
) {
  if (!email) {
    throw new Error("email ist erforderlich");
  }

  // Passwort: entweder übergeben oder automatisch erzeugen (MVP-Style)
  let finalPassword = (password && password.trim()) || generateSimplePassword();

  const id = await upsertUser(tenantId, {
    email,
    password: finalPassword,
    roles,
    mustChangePassword
  });

  // Rückgabe inkl. Klartext-Passwort, falls du es im UI anzeigen willst
  const normalizedRoles = Array.isArray(roles)
    ? roles
    : roles
    ? roles
        .split(",")
        .map(r => r.trim())
        .filter(Boolean)
    : [];

  return {
    id,
    email: email.trim(),
    roles: normalizedRoles,
    password: finalPassword
  };
}
