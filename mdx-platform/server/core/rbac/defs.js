// server/core/rbac/defs.js

// Formular-Prozess-States (generisch)
export const FORM_STATES = [
  "draft",
  "assigned",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "done",
  "archived"
];

// Aktionen (generisch, pro Prozess/Form nutzbar)
export const FORM_ACTIONS = [
  "form.view",
  "form.create",
  "form.edit",
  "form.save",
  "form.submit",
  "form.comment",

  "submission.view",
  "submission.export",

  "workflow.assign",
  "workflow.reassign",
  "workflow.request_changes",
  "workflow.approve",
  "workflow.reject",
  "workflow.archive",

  "task.view",
  "task.claim",
  "task.assign",
  "task.complete",

  "rbac.manage_roles",
  "rbac.manage_bindings"
];

// Rechte (Capabilities)
export const RIGHTS = [
  // Form
  "form:read",
  "form:write",
  "form:submit",
  "form:comment",

  // Submissions
  "submission:read",
  "submission:export",

  // Workflow
  "workflow:assign",
  "workflow:transition",
  "workflow:approve",
  "workflow:reject",
  "workflow:archive",

  // Tasks
  "task:read",
  "task:claim",
  "task:assign",
  "task:complete",

  // Admin / Security
  "rbac:manage_roles",
  "rbac:manage_bindings"
];

// ✅ Action -> benötigte Rechte (MVP)
export const ACTION_RIGHTS = {
  "form.view": ["form:read"],
  "form.create": ["form:write"],
  "form.edit": ["form:write"],
  "form.save": ["form:write"],
  "form.submit": ["form:submit"],
  "form.comment": ["form:comment"],

  "submission.view": ["submission:read"],
  "submission.export": ["submission:export"],

  "workflow.assign": ["workflow:assign"],
  "workflow.reassign": ["workflow:assign"],
  "workflow.request_changes": ["workflow:transition"],
  "workflow.approve": ["workflow:approve"],
  "workflow.reject": ["workflow:reject"],
  "workflow.archive": ["workflow:archive"],

  "task.view": ["task:read"],
  "task.claim": ["task:claim"],
  "task.assign": ["task:assign"],
  "task.complete": ["task:complete"],

  "rbac.manage_roles": ["rbac:manage_roles"],
  "rbac.manage_bindings": ["rbac:manage_bindings"]
};

// Default Rollen (pro Form)
export const DEFAULT_FORM_ROLES = [
  {
    roleKey: "viewer",
    label: "Viewer",
    rights: ["form:read", "submission:read"],
    allowedActions: ["form.view", "submission.view"]
  },
  {
    roleKey: "editor",
    label: "Editor",
    rights: ["form:read", "form:write", "form:submit", "form:comment", "submission:read"],
    allowedActions: ["form.view", "form.edit", "form.save", "form.submit", "form.comment", "submission.view"]
  },
  {
    roleKey: "reviewer",
    label: "Reviewer",
    rights: ["form:read", "submission:read", "submission:export", "form:comment"],
    allowedActions: ["form.view", "submission.view", "submission.export", "form.comment"]
  },
  {
    roleKey: "approver",
    label: "Approver",
    rights: ["form:read", "submission:read", "workflow:approve", "workflow:reject", "workflow:transition", "form:comment"],
    allowedActions: ["form.view", "submission.view", "workflow.approve", "workflow.reject", "workflow.request_changes", "form.comment"]
  },
  {
    roleKey: "operator",
    label: "Operator",
    rights: ["task:read", "task:claim", "task:complete", "workflow:transition"],
    allowedActions: ["task.view", "task.claim", "task.complete", "workflow.request_changes"]
  },
  {
    roleKey: "security_admin",
    label: "Security Admin",
    rights: ["rbac:manage_roles", "rbac:manage_bindings"],
    allowedActions: ["rbac.manage_roles", "rbac.manage_bindings"]
  }
];
