// server/core/webhooks/routes.js

import {
  registerWebhook,
  listWebhooks,
  listWebhookDeliveries
} from "./service.js";

function requireUser(req, reply) {
  if (!req.session?.user) {
    reply.code(401).send({ error: "not logged in" });
    return null;
  }
  return req.session.user;
}

function tenantMatchOr403(req, reply, user) {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    reply.code(400).send({ error: "tenantId missing" });
    return false;
  }
  if (String(tenantId) !== String(user.tenantId)) {
    reply.code(403).send({ error: "tenant mismatch" });
    return false;
  }
  return true;
}

// MVP: Tenant-Admin sind user.roles enthält "admin" oder "superadmin"
function isTenantAdmin(user) {
  const roles = user?.roles || [];
  if (!Array.isArray(roles)) return false;
  return roles.includes("admin") || roles.includes("superadmin");
}

function parseEventsField(raw) {
  const v = (raw ?? "").toString().trim();
  if (!v) return undefined;
  if (v === "*") return ["*"];
  // comma-separated
  const parts = v.split(",").map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function register(app) {
  // ----------------------------
  // UI: Webhooks page
  // ----------------------------
  app.get("/tenant/:tenantId/integrations/webhooks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!tenantMatchOr403(req, reply, user)) return;

    const tenantId = req.params.tenantId;

    // Optional: nur Admins
    if (!isTenantAdmin(user)) {
      return reply.code(403).send("Forbidden – Adminrechte erforderlich");
    }

    const hooks = await listWebhooks(tenantId);
    const deliveries = await listWebhookDeliveries(tenantId, { limit: 25 });

    return reply.view("webhooks/index.ejs", {
      title: "Webhooks",
      activeSection: "tenant",
      currentApp: null,

      user,
      tenantId,
      hooks,
      deliveries,
      error: null,
      created: null
    });
  });

  app.post("/tenant/:tenantId/integrations/webhooks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!tenantMatchOr403(req, reply, user)) return;

    const tenantId = req.params.tenantId;

    if (!isTenantAdmin(user)) {
      return reply.code(403).send("Forbidden – Adminrechte erforderlich");
    }

    try {
      const body = req.body || {};
      const name = (body.name ?? "").toString().trim() || undefined;
      const url = (body.url ?? "").toString().trim();
      const secret = (body.secret ?? "").toString().trim() || undefined;
      const events = parseEventsField(body.events);
      const isActive = body.isActive === "on" || body.isActive === true || body.isActive === "true";

      const created = await registerWebhook(tenantId, {
        name,
        url,
        events,
        secret,
        isActive
      });

      const hooks = await listWebhooks(tenantId);
      const deliveries = await listWebhookDeliveries(tenantId, { limit: 25 });

      return reply.view("webhooks/index.ejs", {
        title: "Webhooks",
        activeSection: "tenant",
        currentApp: null,

        user,
        tenantId,
        hooks,
        deliveries,
        error: null,
        created
      });
    } catch (err) {
      const hooks = await listWebhooks(tenantId);
      const deliveries = await listWebhookDeliveries(tenantId, { limit: 25 });

      return reply.view("webhooks/index.ejs", {
        title: "Webhooks",
        activeSection: "tenant",
        currentApp: null,

        user,
        tenantId,
        hooks,
        deliveries,
        error: err?.message || "Unknown error",
        created: null
      });
    }
  });

  // ----------------------------
  // JSON Admin API (bestehend)
  // ----------------------------
  app.get("/tenant/:tenantId/admin/webhooks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!tenantMatchOr403(req, reply, user)) return;

    const tenantId = req.params.tenantId;
    const hooks = await listWebhooks(tenantId);
    return reply.send(hooks);
  });

  app.post("/tenant/:tenantId/admin/webhooks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!tenantMatchOr403(req, reply, user)) return;

    const tenantId = req.params.tenantId;

    const { name, url, events, secret, isActive } = req.body || {};
    const created = await registerWebhook(tenantId, { name, url, events, secret, isActive });
    return reply.code(201).send(created);
  });

  app.get("/tenant/:tenantId/admin/webhooks/deliveries", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!tenantMatchOr403(req, reply, user)) return;

    const tenantId = req.params.tenantId;
    const deliveries = await listWebhookDeliveries(tenantId, { limit: 100 });
    return reply.send(deliveries);
  });
}
