// apps/mdx/model.js
// Robust MDX-App Model (Forms + Submissions/Tasks)
//
// - Uses tenant DB via getTenantDb(tenantId)
// - Submissions store groupIds (array) from Form Assignments (B7)
// - Compatible with legacy groupId (single)
// - saveSubmission returns insertedId for audit/webhook linkage

import { getTenantDb } from "../../server/core/db/mongo.js";
import { ObjectId } from "mongodb";

// ✅ B7: Form -> Groups Assignments
import { getAssignedGroupIds } from "../../server/core/form_assignments/service.js";

const FORMS_COLLECTION = "mdx_forms";
const SUBMISSIONS_COLLECTION = "mdx_submissions";

// ✅ Core groups live here in your platform
const GROUPS_COLLECTION = "core_groups";

const USERS_COLLECTION = "users";

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function toObjectIdSafe(id) {
  try {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

function normalizeString(v) {
  return (v == null) ? "" : String(v);
}

function normalizeSlug(slug) {
  return normalizeString(slug).trim();
}

function normalizeDataObject(data) {
  if (!data || typeof data !== "object") return {};
  // flache Kopie reicht für MVP; falls du nested später willst, bleibt es kompatibel
  return { ...data };
}

function pickUserObjectId(user) {
  return (
    toObjectIdSafe(user?._id) ||
    toObjectIdSafe(user?.id) ||
    toObjectIdSafe(user?.userId)
  );
}

function pickUserGroupIds(user) {
  const raw =
    (Array.isArray(user?.groupIds) ? user.groupIds :
    Array.isArray(user?.groups) ? user.groups :
    Array.isArray(user?.group_ids) ? user.group_ids :
    []);

  return raw
    .map(x => (x instanceof ObjectId ? x : String(x)))
    .map(toObjectIdSafe)
    .filter(Boolean);
}

// ---------------------------------------------------------
// Collections
// ---------------------------------------------------------

async function getCol(tenantId, name) {
  if (!tenantId) throw new Error("tenantId fehlt");
  const db = await getTenantDb(tenantId);
  return db.collection(name);
}

async function getFormsCollection(tenantId) {
  return getCol(tenantId, FORMS_COLLECTION);
}

async function getSubmissionsCollection(tenantId) {
  return getCol(tenantId, SUBMISSIONS_COLLECTION);
}

async function getGroupsCollection(tenantId) {
  return getCol(tenantId, GROUPS_COLLECTION);
}

async function getUsersCollection(tenantId) {
  return getCol(tenantId, USERS_COLLECTION);
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
  // defensiv: sort by name/email, falls nicht vorhanden
  return col.find({}).sort({ email: 1, name: 1 }).toArray();
}

// ---------------------------------------------------------
// MDX-Formulare (Definition)
// ---------------------------------------------------------

export async function listDocs(tenantId) {
  const col = await getFormsCollection(tenantId);
  return col
    .find({}, { projection: { slug: 1, title: 1, type: 1, groupIds: 1, uniqueFieldKey: 1, createdAt: 1 } })
    .sort({ createdAt: 1, slug: 1 })
    .toArray();
}

export async function getDoc(tenantId, slug) {
  const col = await getFormsCollection(tenantId);
  const s = normalizeSlug(slug);
  if (!s) return null;
  return col.findOne({ slug: s });
}

export async function upsertDoc(
  tenantId,
  { slug, title, mdx, type = "generic", groupIds = [], uniqueFieldKey = null } = {}
) {
  const col = await getFormsCollection(tenantId);
  const now = new Date();

  const s = normalizeSlug(slug);
  if (!s) throw new Error("slug fehlt");

  const t = normalizeString(title).trim();
  if (!t) throw new Error("title fehlt");

  const mdxStr = normalizeString(mdx);
  if (!mdxStr.trim()) throw new Error("mdx fehlt");

  // groupIds kommen als Strings aus dem Formular -> in ObjectIds umwandeln (safe)
  const groupObjectIds = (Array.isArray(groupIds) ? groupIds : [groupIds])
    .map(toObjectIdSafe)
    .filter(Boolean);

  // dedupe
  const uniqGroups = [...new Set(groupObjectIds.map(x => String(x)))].map(toObjectIdSafe).filter(Boolean);

  await col.updateOne(
    { slug: s },
    {
      $set: {
        slug: s,
        title: t,
        mdx: mdxStr,
        type: normalizeString(type || "generic"),
        groupIds: uniqGroups,
        uniqueFieldKey: uniqueFieldKey ? normalizeString(uniqueFieldKey).trim() : null,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );

  return true;
}

// ---------------------------------------------------------
// Formulareinsendungen (Daten / Tasks)
// ---------------------------------------------------------

/**
 * Speichert eine neue Einsendung und liefert insertedId zurück.
 * Zusätzlich:
 * - groupIds (Array) aus Form Assignments (B7)
 * - groupId (Legacy) = erstes Element aus groupIds (oder null)
 */
export async function saveSubmission(tenantId, slug, data, opts = {}) {
  const formsCol = await getFormsCollection(tenantId);
  const submissionsCol = await getSubmissionsCollection(tenantId);

  const s = normalizeSlug(slug);
  if (!s) throw new Error("slug fehlt");

  const now = new Date();
  const payload = normalizeDataObject(data);

  const form = await formsCol.findOne({ slug: s });
  const formId = form?._id || null;

  // ✅ B7: Assignments-Gruppen (Form -> Groups)
  // Wenn KEINE Assignments existieren, ist das Formular "offen" (groupIds leer)
  let groupIds = [];
  try {
    const assigned = await getAssignedGroupIds(tenantId, { appId: "mdx", formSlug: s });
    groupIds = (assigned || []).map(toObjectIdSafe).filter(Boolean);
  } catch {
    // wenn assignment-service mal nicht verfügbar ist: fallback unten
    groupIds = [];
  }

  // Fallback: legacy groups on form doc (wenn du die noch pflegst)
  if ((!groupIds || groupIds.length === 0) && form && Array.isArray(form.groupIds) && form.groupIds.length > 0) {
    groupIds = form.groupIds.map(toObjectIdSafe).filter(Boolean);
  }

  const legacyGroupId = (groupIds && groupIds.length > 0) ? groupIds[0] : null;

  const insertDoc = {
    slug: s,
    formId,
    // ✅ neu (multi-group)
    groupIds,
    // ✅ legacy (single)
    groupId: legacyGroupId,

    data: payload,

    status: "open",
    assigneeId: null,

    createdAt: now,
    assignedAt: null,
    completedAt: null
  };

  const res = await submissionsCol.insertOne(insertDoc);
  return res?.insertedId || null;
}

export async function listSubmissions(tenantId, slug) {
  const col = await getSubmissionsCollection(tenantId);
  const s = normalizeSlug(slug);
  if (!s) return [];
  return col.find({ slug: s }).sort({ createdAt: -1 }).toArray();
}

// ---------------------------------------------------------
// Tasks / Aufgabensicht
// ---------------------------------------------------------

/**
 * Tasks für einen User laden:
 * - assignedTasks: assigneeId = userId und status != done
 * - openTasks: assigneeId = null, status=open, und Schnittmenge zwischen:
 *   (submission.groupIds || [submission.groupId]) und user.groupIds
 *
 * (RBAC/Workflow kommt später – das ist das MVP-Verhalten.)
 */
export async function getTasksForUser(tenantId, user) {
  const submissionsCol = await getSubmissionsCollection(tenantId);
  const formsCol = await getFormsCollection(tenantId);

  const userId = pickUserObjectId(user);
  const userGroupIds = pickUserGroupIds(user);

  const forms = await formsCol.find({}).toArray();
  const formById = new Map(forms.map(f => [String(f._id), f]));

  const assignedTasks = userId
    ? await submissionsCol
        .find({ assigneeId: userId, status: { $ne: "done" } })
        .sort({ createdAt: 1 })
        .toArray()
    : [];

  // Offene Tasks nur sinnvoll, wenn User Gruppen hat (oder wir später "global open" wollen)
  let openTasks = [];
  if (userGroupIds.length > 0) {
    openTasks = await submissionsCol
      .find({
        assigneeId: null,
        status: "open",
        $or: [
          // ✅ neuer Weg
          { groupIds: { $in: userGroupIds } },
          // ✅ legacy Weg
          { groupId: { $in: userGroupIds } }
        ]
      })
      .sort({ createdAt: 1 })
      .toArray();
  }

  function enrich(task) {
    const form =
      task.formId ? formById.get(String(task.formId)) : forms.find(f => f.slug === task.slug);

    return {
      ...task,
      id: task._id,
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

  const _id = toObjectIdSafe(submissionId);
  if (!_id) throw new Error("submissionId ist keine gültige ObjectId");

  const userId = pickUserObjectId(user);
  if (!userId) throw new Error("userId fehlt/ungültig");

  await col.updateOne(
    { _id, assigneeId: null, status: "open" },
    {
      $set: {
        assigneeId: userId,
        status: "in_progress",
        assignedAt: new Date()
      }
    }
  );

  return true;
}

// Aufgabe als erledigt markieren
export async function completeTask(tenantId, submissionId, user) {
  const col = await getSubmissionsCollection(tenantId);

  const _id = toObjectIdSafe(submissionId);
  if (!_id) throw new Error("submissionId ist keine gültige ObjectId");

  const userId = pickUserObjectId(user);
  if (!userId) throw new Error("userId fehlt/ungültig");

  await col.updateOne(
    { _id, assigneeId: userId, status: { $in: ["open", "in_progress"] } },
    {
      $set: {
        status: "done",
        completedAt: new Date()
      }
    }
  );

  return true;
}

// ---------------------------------------------------------
// Optional: Index helper (kannst du später beim Tenant-Init aufrufen)
// ---------------------------------------------------------
export async function ensureMdxIndexes(tenantId) {
  const formsCol = await getFormsCollection(tenantId);
  const subCol = await getSubmissionsCollection(tenantId);

  await formsCol.createIndex({ slug: 1 }, { unique: true });
  await formsCol.createIndex({ createdAt: 1 });

  await subCol.createIndex({ slug: 1, createdAt: -1 });
  await subCol.createIndex({ assigneeId: 1, status: 1, createdAt: 1 });
  await subCol.createIndex({ groupId: 1, status: 1, createdAt: 1 });   // legacy
  await subCol.createIndex({ groupIds: 1, status: 1, createdAt: 1 });  // new
}
