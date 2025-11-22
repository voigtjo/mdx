import { createUser, listUsers } from "./model.js";

export async function registerUserRoutes(app) {

  app.get("/users", async (req, reply) => {
    if (!req.session.user) return reply.redirect("/login");

    const users = await listUsers(req.session.user.tenantId);

    return reply.view("/core/users/list.ejs", {
      user: req.session.user,
      users
    });
  });

  app.post("/users", async (req, reply) => {
    if (!req.session.user) return reply.redirect("/login");

    const { email, roles } = req.body;
    const tenantId = req.session.user.tenantId;

    const newUser = await createUser(tenantId, email, roles.split(","));
    return reply.send(`User created. Temporary password: ${newUser.password}`);
  });

}
