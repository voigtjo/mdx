// login
import bcrypt from "bcryptjs";
import { getTenantDb } from "../db/mongo.js";

const DEFAULT_TENANT = "demo";

export function registerLoginRoutes(app) {
  app.get("/login", async (req, reply) => {
    return reply.view("login.ejs", { error: null });
  });

  app.post("/login", async (req, reply) => {
    const { email, password } = req.body;

    const db = await getTenantDb(DEFAULT_TENANT);
    const usersCol = db.collection("users");

    // MVP: Falls kein User vorhanden und admin@example.com versucht wird -> auto anlegen
    let user = await usersCol.findOne({ email });

    if (!user && email === "admin@example.com") {
      const hash = await bcrypt.hash("admin", 10);
      const res = await usersCol.insertOne({
        email: "admin@example.com",
        passwordHash: hash,
        roles: ["superadmin"],
        createdAt: new Date()
      });
      user = await usersCol.findOne({ _id: res.insertedId });
    }

    if (!user) {
      return reply.view("login.ejs", { error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.view("login.ejs", { error: "Invalid credentials" });
    }

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      roles: user.roles,
      tenantId: DEFAULT_TENANT
    };

    return reply.redirect("/mdx");
  });

  app.get("/logout", async (req, reply) => {
    req.session.destroy();
    reply.redirect("/login");
  });
}
