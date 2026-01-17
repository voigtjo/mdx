// server/core/workflows/service.js
// Core Workflow Engine (MVP)
// - workflow defs per (tenantId, appId, formSlug)
// - instances per submissionId (later: also businessKey etc.)

import { ObjectId } from "mongodb";
import {
  getWorkflowDefsCollection,
  getWorkflowInstancesCollection
} from "./model.js";

// ------------------------------------------------------------
// Defaults (MVP)
// ------------------------------------------------------------
const DEFAULT_WORKFLOW_DEF = {
  key: "default",
  label: "Default Workflow",
  // Optional: field name inside submission.data to store business key in instance
  businessKeyField: null,

  states: [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "in_review", label: "In Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" }
  ],

  actions: [
    { key: "save_draft", label: "Save Draft" },
    { key: "submit", label: "Submit" },
    { key: "request_changes", label: "Request Changes" },
    { key: "approve", label: "Approve" },
    { key: "reject", label: "Reject" }
  ],

  // requiredAction keys should align with RBAC allowedActions later
  transitions: [
    { from: "draft", to: "submitted", actionKey: "submit", requiredAction: "workflow.submit" },
    { from: "submitted", to: "draft", actionKey: "request_changes", requiredAction: "workflow.request_changes" },
    { from: "submitted", to: "approved", actionKey: "approve", requiredAction: "workflow.approve" },
    { from: "submitted", to: "rejected", actionKey: "reject", requiredAction: "workflow.reject" }
  ],

  initialState: "draft",
  submittedState: "submitted"
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function toObjectIdSafe(id) {
  try {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function normalizeString(v) {
  return String(v ?? "").trim();
}

// ------------------------------------------------------------
// Defs
// ------------------------------------------------------------
export async function ensureDefaultWorkflowDef(tenantId, { appId = "mdx", formSlug } = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");

  const defs = await getWorkflowDefsCollection(tenantId);

  const existing = await defs.findOne({ tenantId, appId, formSlug: String(formSlug) });
  if (existing) return existing;

  const now = new Date();
  const doc = {
    tenantId,
    appId,
    formSlug: String(formSlug),

    workflowKey: DEFAULT_WORKFLOW_DEF.key,
    label: DEFAULT_WORKFLOW_DEF.label,
    businessKeyField: DEFAULT_WORKFLOW_DEF.businessKeyField,

    states: DEFAULT_WORKFLOW_DEF.states,
    actions: DEFAULT_WORKFLOW_DEF.actions,
    transitions: DEFAULT_WORKFLOW_DEF.transitions,

    initialState: DEFAULT_WORKFLOW_DEF.initialState,
    submittedState: DEFAULT_WORKFLOW_DEF.submittedState,

    createdAt: now,
    updatedAt: now
  };

  await defs.insertOne(doc);
  return doc;
}

export async function getWorkflowDef(tenantId, { appId = "mdx", formSlug } = {}) {
  if (!tenantId || !formSlug) return null;
  const defs = await getWorkflowDefsCollection(tenantId);
  return defs.findOne({ tenantId, appId, formSlug: String(formSlug) });
}

export async function upsertWorkflowDef(tenantId, { appId = "mdx", formSlug, def } = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!def) throw new Error("def fehlt");

  const defs = await getWorkflowDefsCollection(tenantId);

  const now = new Date();
  const doc = {
    tenantId,
    appId,
    formSlug: String(formSlug),

    workflowKey: normalizeString(def.workflowKey || def.key || "default"),
    label: normalizeString(def.label || "Workflow"),

    businessKeyField: def.businessKeyField ? normalizeString(def.businessKeyField) : null,

    states: Array.isArray(def.states) ? def.states : [],
    actions: Array.isArray(def.actions) ? def.actions : [],
    transitions: Array.isArray(def.transitions) ? def.transitions : [],

    initialState: normalizeString(def.initialState || "draft"),
    submittedState: normalizeString(def.submittedState || "submitted"),

    updatedAt: now
  };

  await defs.updateOne(
    { tenantId, appId, formSlug: String(formSlug) },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return getWorkflowDef(tenantId, { appId, formSlug });
}

// ------------------------------------------------------------
// Instances
// ------------------------------------------------------------
export async function getInstanceBySubmissionId(tenantId, { appId = "mdx", formSlug, submissionId } = {}) {
  if (!tenantId || !formSlug || !submissionId) return null;
  const inst = await getWorkflowInstancesCollection(tenantId);

  // we store submissionId as string for robustness across sources
  return inst.findOne({ tenantId, appId, formSlug: String(formSlug), submissionId: String(submissionId) });
}

/**
 * Start/Upsert on submission event.
 * - If instance exists: return it
 * - Else: create instance with currentState = submittedState and history entry "submit"
 */
export async function startInstanceForSubmission(
  tenantId,
  {
    appId = "mdx",
    formSlug,
    submissionId,
    submissionData = {},
    startedByUser = null,
    source = "core/workflows"
  } = {}
) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!submissionId) throw new Error("submissionId fehlt");

  // Ensure def exists (MVP)
  const def = (await getWorkflowDef(tenantId, { appId, formSlug }))
    || (await ensureDefaultWorkflowDef(tenantId, { appId, formSlug }));

  const instCol = await getWorkflowInstancesCollection(tenantId);

  const existing = await getInstanceBySubmissionId(tenantId, { appId, formSlug, submissionId });
  if (existing) return existing;

  const now = new Date();

  const businessKeyField = def?.businessKeyField ? String(def.businessKeyField) : null;
  const businessKey =
    businessKeyField && submissionData && Object.prototype.hasOwnProperty.call(submissionData, businessKeyField)
      ? submissionData[businessKeyField]
      : null;

  const submittedState = def?.submittedState || "submitted";

  const doc = {
    tenantId,
    appId,
    formSlug: String(formSlug),

    workflowKey: def?.workflowKey || "default",

    submissionId: String(submissionId),
    businessKey: businessKey != null ? String(businessKey) : null,

    currentState: String(submittedState),

    history: [
      {
        at: now,
        actionKey: "submit",
        from: null,
        to: String(submittedState),
        byUserId: startedByUser?._id ? String(startedByUser._id) : null,
        byEmail: startedByUser?.email ? String(startedByUser.email) : null,
        source,
        meta: {}
      }
    ],

    createdAt: now,
    updatedAt: now
  };

  await instCol.insertOne(doc);
  return doc;
}

/**
 * Generic transition (not yet wired into UI).
 * Validates transition exists in def.
 */
export async function transitionInstance(
  tenantId,
  {
    appId = "mdx",
    formSlug,
    submissionId,
    actionKey,
    byUser = null,
    source = "core/workflows",
    meta = {}
  } = {}
) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!formSlug) throw new Error("formSlug fehlt");
  if (!submissionId) throw new Error("submissionId fehlt");
  if (!actionKey) throw new Error("actionKey fehlt");

  const def = await ensureDefaultWorkflowDef(tenantId, { appId, formSlug });

  const instCol = await getWorkflowInstancesCollection(tenantId);
  const inst = await getInstanceBySubmissionId(tenantId, { appId, formSlug, submissionId });
  if (!inst) throw new Error("Workflow instance nicht gefunden");

  const from = String(inst.currentState || "");
  const action = String(actionKey);

  const match = (def.transitions || []).find(t => String(t.from) === from && String(t.actionKey) === action);
  if (!match) {
    const possible = (def.transitions || [])
      .filter(t => String(t.from) === from)
      .map(t => t.actionKey);
    throw new Error(`Keine Transition für state="${from}" action="${action}". Möglich: ${uniq(possible).join(", ")}`);
  }

  const to = String(match.to);

  const now = new Date();
  const historyEntry = {
    at: now,
    actionKey: action,
    from,
    to,
    byUserId: byUser?._id ? String(byUser._id) : null,
    byEmail: byUser?.email ? String(byUser.email) : null,
    source,
    meta: meta && typeof meta === "object" ? meta : {}
  };

  await instCol.updateOne(
    { tenantId, appId, formSlug: String(formSlug), submissionId: String(submissionId) },
    {
      $set: { currentState: to, updatedAt: now },
      $push: { history: historyEntry }
    }
  );

  return getInstanceBySubmissionId(tenantId, { appId, formSlug, submissionId });
}
