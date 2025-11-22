import { createTenant, listTenants } from "./model.js";

export async function registerTenantRoutes(app) {

  app.get("/tenants", async (req, reply) => {
    if (!req.session.user?.roles.includes("superadmin"))
      return reply.code(403).send("Forbidden");

    const tenants = await listTenants();

    return reply.view("/core/tenants/list.ejs", {
      user: req.session.user,
      tenants
    });
  });

  app.post("/tenants", async (req, reply) => {
    if (!req.session.user?.roles.includes("superadmin"))
      return reply.code(403).send("Forbidden");

    const { name } = req.body;
    const tenant = await createTenant(name);
    return reply.send(`Created tenant: ${tenant.name}`);
  });

}
