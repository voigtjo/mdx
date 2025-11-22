import bcrypt from "bcryptjs";
import { getTenantDb } from "../db/mongo.js";

/**
 * Tenant-ID (Demo-Version)
 * Später: Subdomain, Domain-Mapping oder Auswahl im Login
 */
const DEFAULT_TENANT = "demo";

export function registerLoginRoutes(app) {

  //
  // GET /login — zeigt Login-Seite
  //
  app.get("/login", async (req, reply) => {
    return reply.view("/core/ui/login.ejs", {
      error: null // Fehler immer definieren!
    });
  });

  //
  // POST /login — prüft Login
  //
  app.post("/login", async (req, reply) => {
    const { email, password } = req.body;

    const db = await getTenantDb(DEFAULT_TENANT);
    const user = await db.collection("users").findOne({ email });

    // Benutzer nicht gefunden
    if (!user) {
      return reply.view("/core/ui/login.ejs", {
        error: "Invalid credentials"
      });
    }

    // Passwort prüfen
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.view("/core/ui/login.ejs", {
        error: "Invalid credentials"
      });
    }

    // Session setzen
    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      roles: user.roles,
      tenantId: DEFAULT_TENANT
    };

    return reply.redirect("/dashboard");
  });

  //
  // GET /logout — Session löschen
  //
  app.get("/logout", async (req, reply) => {
    req.session.destroy();
    reply.redirect("/login");
  });
}
