// platform/server/core/roles/routes.js

import { listRoles } from "./model.js";

export async function registerRoleRoutes(app) {

  // Liste der Rollen anzeigen (nur admin/superadmin)
  app.get("/roles", async (req, reply) => {
    if (!req.session.user) return reply.redirect("/login");

    const roles = await listRoles();

    return reply.view("/core/ui/dashboard.ejs", {
      user: req.session.user,
      roles
    });
  });
}
