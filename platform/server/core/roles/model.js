// platform/server/core/roles/model.js

/**
 * Rollen werden bewusst einfach gehalten.
 * Sie können später dynamisch ausgebaut werden.
 */

export const defaultRoles = [
  "superadmin",
  "admin",
  "forms.read",
  "forms.write",
  "forms.assign",
  "forms.approve"
];

/**
 * Für spätere Erweiterung: dynamische Rollen aus DB
 */
export async function listRoles() {
  return defaultRoles;
}
