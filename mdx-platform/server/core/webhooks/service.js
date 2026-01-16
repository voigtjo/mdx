// server/core/webhooks/service.js
// MVP: nur "queue & log" (keine HTTP Delivery)

import crypto from "crypto";
import {
  getWebhooksCollection,
  getWebhookDeliveriesCollection
} from "./model.js";

function normalizeEvents(events) {
  if (!events) return ["*"];
  if (events === "*") return ["*"];
  if (Array.isArray(events) && events.length > 0) return events;
  if (typeof events === "string" && events.trim()) return [events.trim()];
  return ["*"];
}

function matches(eventName, list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  if (list.includes("*")) return true;
  return list.includes(eventName);
}

export async function registerWebhook(tenantId, {
  name,
  url,
  events,
  secret,
  isActive = true
} = {}) {
  if (!tenantId) throw new Error("tenantId fehlt");
  if (!url) throw new Error("url fehlt");

  const col = await getWebhooksCollection(tenantId);

  const now = new Date();
  const doc = {
    tenantId,
    name: name || url,
    url,
    events: normalizeEvents(events),
    secret: secret || null,
    isActive: !!isActive,
    createdAt: now,
    updatedAt: now
  };

  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listWebhooks(tenantId) {
  const col = await getWebhooksCollection(tenantId);
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

export async function enqueueWebhookDeliveries(tenantId, eventName, payload = {}, ctx = {}) {
  if (!tenantId) return 0;

  const hooksCol = await getWebhooksCollection(tenantId);
  const delCol = await getWebhookDeliveriesCollection(tenantId);

  const hooks = await hooksCol
    .find({ isActive: true })
    .toArray();

  const now = new Date();

  const matching = hooks.filter(h => matches(eventName, h.events));

  if (matching.length === 0) return 0;

  const deliveries = matching.map(h => {
    // optional signature (nur gespeichert, nicht gesendet)
    const body = JSON.stringify({ eventName, payload, tenantId });
    const signature = h.secret
      ? crypto.createHmac("sha256", h.secret).update(body).digest("hex")
      : null;

    return {
      tenantId,
      webhookId: h._id,
      url: h.url,
      eventName,
      payload,

      status: "queued", // queued | sent | failed
      attempts: 0,
      lastError: null,

      meta: {
        source: ctx?.source || "unknown",
        requestId: ctx?.requestId || null,
        signature
      },

      createdAt: now,
      updatedAt: now
    };
  });

  await delCol.insertMany(deliveries);
  return deliveries.length;
}

export async function listWebhookDeliveries(tenantId, { limit = 50 } = {}) {
  const delCol = await getWebhookDeliveriesCollection(tenantId);

  return delCol
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(200, limit)))
    .toArray();
}
