// server/core/events/init.js
// Verdrahtet Core Side-Effects an den Event-Bus.
// Wichtig: idempotent (damit nicht doppelt registriert wird)

import { events } from "./bus.js";
import { appendAudit } from "../audit/service.js";
import { enqueueWebhookDeliveries } from "../webhooks/service.js";

let initialized = false;

export function initCoreEventHandlers() {
  if (initialized) return;
  initialized = true;

  // "Catch-all": alles geht ins Audit + Webhook Queue
  events.onAny(async (eventName, payload, ctx) => {
    const tenantId = ctx?.tenantId || ctx?.user?.tenantId;
    if (!tenantId) return;

    // Audit (append-only)
    await appendAudit(tenantId, eventName, payload, ctx);

    // Webhooks (nur queue/log, kein HTTP)
    await enqueueWebhookDeliveries(tenantId, eventName, payload, ctx);
  });
}
