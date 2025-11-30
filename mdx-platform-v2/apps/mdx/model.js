// apps/mdx/model.js
import { getTenantDb } from "../../server/core/db/mongo.js";

const COLLECTION = "mdx_forms";

/**
 * Alle MDX-Formulare eines Tenants holen (nur Metadaten)
 */
export async function listDocs(tenantId) {
  const db = await getTenantDb(tenantId);
  return db
    .collection(COLLECTION)
    .find({}, { projection: { slug: 1, title: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Ein Formular anhand des Slugs holen
 */
export async function getDoc(tenantId, slug) {
  const db = await getTenantDb(tenantId);
  return db.collection(COLLECTION).findOne({ slug });
}

/**
 * Formular neu anlegen oder aktualisieren
 */
export async function upsertDoc(tenantId, { slug, title, mdx }) {
  const db = await getTenantDb(tenantId);
  const now = new Date();

  await db.collection(COLLECTION).updateOne(
    { slug },
    {
      $set: {
        slug,
        title,
        mdx,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );
}
