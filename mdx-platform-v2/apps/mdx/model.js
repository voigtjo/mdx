// apps/mdx/model.js

import { getTenantDb } from "../../server/core/db/mongo.js";

const FORMS_COLLECTION = "mdx_forms";
const SUBMISSIONS_COLLECTION = "mdx_submissions";

// ---------------------------------------------------------
// Hilfsfunktionen: Collections holen
// ---------------------------------------------------------

async function getFormsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(FORMS_COLLECTION);
}

async function getSubmissionsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(SUBMISSIONS_COLLECTION);
}

// ---------------------------------------------------------
// MDX-Formulare (Definition)
// ---------------------------------------------------------

export async function listDocs(tenantId) {
  const col = await getFormsCollection(tenantId);
  const docs = await col
    .find({})
    .sort({ createdAt: 1 })
    .toArray();

  return docs;
}

export async function getDoc(tenantId, slug) {
  const col = await getFormsCollection(tenantId);
  return col.findOne({ slug });
}

export async function upsertDoc(tenantId, { slug, title, mdx }) {
  const col = await getFormsCollection(tenantId);
  const now = new Date();

  await col.updateOne(
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

// ---------------------------------------------------------
// Formulareinsendungen (Daten)
// ---------------------------------------------------------

// Eine neue Einsendung speichern
export async function saveSubmission(tenantId, slug, data) {
  const col = await getSubmissionsCollection(tenantId);
  const now = new Date();

  // nur zur Kontrolle im Terminal
  console.log("[saveSubmission]", { tenantId, slug, data });

  await col.insertOne({
    slug,         // welches Formular
    data,         // Rohdaten vom Formular
    createdAt: now
  });
}

// Alle Einsendungen zu einem Formular auslesen
export async function listSubmissions(tenantId, slug) {
  const col = await getSubmissionsCollection(tenantId);
  return col
    .find({ slug })
    .sort({ createdAt: -1 })
    .toArray();
}
