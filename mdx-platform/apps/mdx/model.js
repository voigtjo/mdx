// apps/mdx/model.js

import { getTenantDb } from "../../server/core/db/mongo.js";
import { ObjectId } from "mongodb";

const FORMS_COLLECTION = "mdx_forms";
const SUBMISSIONS_COLLECTION = "mdx_submissions";
const GROUPS_COLLECTION = "mdx_groups";
const USERS_COLLECTION = "users"; // NEU

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

async function getGroupsCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(GROUPS_COLLECTION);
}

// NEU: Users-Collection
async function getUsersCollection(tenantId) {
  const db = await getTenantDb(tenantId);
  return db.collection(USERS_COLLECTION);
}

// ---------------------------------------------------------
// Groups
// ---------------------------------------------------------

export async function listGroups(tenantId) {
  const col = await getGroupsCollection(tenantId);
  return col.find({}).sort({ name: 1 }).toArray();
}

// ---------------------------------------------------------
// Users (für User-Forms / Dropdown)
// ---------------------------------------------------------

export async function listUsers(tenantId) {
  const col = await getUsersCollection(tenantId);
  return col.find({}).sort({ email: 1 }).toArray();
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

export async function upsertDoc(
  tenantId,
  {
    slug,
    title,
    mdx,
    type = "generic",
    groupIds = [],
    uniqueFieldKey = null
  }
) {
  const col = await getFormsCollection(tenantId);
  const now = new Date();

  // groupIds kommen als Strings aus dem Formular -> in ObjectIds umwandeln
  const groupObjectIds = (groupIds || [])
    .filter(Boolean)
    .map(id => new ObjectId(id));

  await col.updateOne(
    { slug },
    {
      $set: {
        slug,
        title,
        mdx,
        type,
        groupIds: groupObjectIds,
        uniqueFieldKey,
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
// Formulareinsendungen (Daten / Tasks)
// ---------------------------------------------------------

// Eine neue Einsendung speichern
export async function saveSubmission(tenantId, slug, data) {
  const formsCol = await getFormsCollection(tenantId);
  const submissionsCol = await getSubmissionsCollection(tenantId);
  const now = new Date();

  const form = await formsCol.findOne({ slug });
  const formId = form?._id || null;
  const groupId =
    form && Array.isArray(form.groupIds) && form.groupIds.length > 0
      ? form.groupIds[0]
      : null;

  await submissionsCol.insertOne({
    slug,
    formId,
    groupId,
    data,
    status: "open",
    assigneeId: null,
    createdAt: now,
    assignedAt: null,
    completedAt: null
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

// ---------------------------------------------------------
// Tasks / Aufgabensicht
// ---------------------------------------------------------

// Hilfsfunktion: konvertiert UserId aus Session in ObjectId
function toObjectId(idOrObj) {
  if (!idOrObj) return null;
  if (idOrObj instanceof ObjectId) return idOrObj;
  try {
    return new ObjectId(idOrObj.toString());
  } catch (e) {
    return null;
  }
}

// Tasks für einen User laden:
// - assignedTasks: assigneeId = userId
// - openTasks: assigneeId = null und groupId in Operator-Groups des Users
export async function getTasksForUser(tenantId, user) {
  const submissionsCol = await getSubmissionsCollection(tenantId);
  const formsCol = await getFormsCollection(tenantId);

  const userId =
    toObjectId(user._id) || toObjectId(user.id) || toObjectId(user.userId);

  // Operator-Gruppen aus dem User-Dokument (falls vorhanden)
  const operatorGroupIds = (user.groupRoles || [])
    .filter(gr => gr.role === "operator" && gr.groupId)
    .map(gr => toObjectId(gr.groupId))
    .filter(Boolean);

  // Formular-Metadaten einmalig laden
  const forms = await formsCol.find({}).toArray();
  const formById = new Map(forms.map(f => [String(f._id), f]));

  // Mir zugewiesene Aufgaben
  const assignedTasks = userId
    ? await submissionsCol
        .find({ assigneeId: userId, status: { $ne: "done" } })
        .sort({ createdAt: 1 })
        .toArray()
    : [];

  // Offene Aufgaben (nur wenn Operator in irgendeiner Gruppe)
  let openTasks = [];
  if (operatorGroupIds.length > 0) {
    openTasks = await submissionsCol
      .find({
        assigneeId: null,
        status: "open",
        groupId: { $in: operatorGroupIds }
      })
      .sort({ createdAt: 1 })
      .toArray();
  }

  // Formularinfos anreichern
  function enrich(task) {
    const form = task.formId
      ? formById.get(String(task.formId))
      : forms.find(f => f.slug === task.slug);

    return {
      ...task,
      formTitle: form?.title || task.slug,
      formSlug: task.slug
    };
  }

  return {
    assignedTasks: assignedTasks.map(enrich),
    openTasks: openTasks.map(enrich)
  };
}

// Aufgabe übernehmen
export async function claimTask(tenantId, submissionId, user) {
  const col = await getSubmissionsCollection(tenantId);
  const userId =
    toObjectId(user._id) || toObjectId(user.id) || toObjectId(user.userId);
  if (!userId) return;

  await col.updateOne(
    { _id: new ObjectId(submissionId) },
    {
      $set: {
        assigneeId: userId,
        status: "in_progress",
        assignedAt: new Date()
      }
    }
  );
}

// Aufgabe als erledigt markieren
export async function completeTask(tenantId, submissionId, user) {
  const col = await getSubmissionsCollection(tenantId);
  const userId =
    toObjectId(user._id) || toObjectId(user.id) || toObjectId(user.userId);
  if (!userId) return;

  await col.updateOne(
    { _id: new ObjectId(submissionId), assigneeId: userId },
    {
      $set: {
        status: "done",
        completedAt: new Date()
      }
    }
  );
}
