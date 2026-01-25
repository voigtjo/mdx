// server/core/auth/login.js

import bcrypt from "bcryptjs";
import { getTenantDb } from "../db/mongo.js";

const DEFAULT_TENANT = "demo";

function uniqueStrings(arr) {
  const s = new Set((arr || []).map(x => String(x)).filter(Boolean));
  return Array.from(s);
}

export function registerLoginRoutes(app) {
  app.get("/login", async (req, reply) => {
    return reply.view("login.ejs", { error: null });
  });

  app.post("/login", async (req, reply) => {
    const { email, password } = req.body;

    const db = await getTenantDb(DEFAULT_TENANT);
    const usersCol = db.collection("users");

    const normalizedEmail = String(email || "").trim().toLowerCase();

    // MVP: Falls kein User vorhanden und admin@example.com versucht wird -> auto anlegen
    let user = await usersCol.findOne({ email: normalizedEmail });

    if (!user && normalizedEmail === "admin@example.com") {
      const hash = await bcrypt.hash("admin", 10);
      const res = await usersCol.insertOne({
        email: "admin@example.com",
        passwordHash: hash,
        roles: ["superadmin"],
        createdAt: new Date(),
        groupRoles: []
      });
      user = await usersCol.findOne({ _id: res.insertedId });
    }

    if (!user) return reply.view("login.ejs", { error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
    if (!ok) return reply.view("login.ejs", { error: "Invalid credentials" });

    const groupRoles = Array.isArray(user.groupRoles) ? user.groupRoles : [];
    const groupIds = uniqueStrings(groupRoles.map(gr => gr?.groupId));

    req.session.user = {
      id: user._id.toString(),
      _id: user._id.toString(), // praktisch für bestehende Codepfade
      email: user.email,
      roles: Array.isArray(user.roles) ? user.roles : [],
      tenantId: DEFAULT_TENANT,

      // neu:
      groupRoles,
      groupIds
    };

    return reply.redirect(`/tenant/${encodeURIComponent(DEFAULT_TENANT)}/dashboard`);
  });

  app.get("/logout", async (req, reply) => {
    req.session.destroy();
    reply.redirect("/login");
  });
}
