// server/core/workflows/init.js
// Registers core workflow listeners on the central events bus.

import { startInstanceForSubmission } from "./service.js";

export function registerWorkflowEventHandlers(events) {
  if (!events || typeof events.on !== "function") {
    // defensive: avoid crashing boot if bus differs
    return;
  }

  // We expect emit("submission.submitted", payload, meta)
  // Handler tries to support both (payload, meta) and ({payload, meta}) shapes.
  events.on("submission.submitted", async (...args) => {
    try {
      let payload = null;
      let meta = null;

      if (args.length === 1 && args[0] && typeof args[0] === "object" && ("payload" in args[0] || "meta" in args[0])) {
        payload = args[0].payload || args[0].data || args[0];
        meta = args[0].meta || args[0].context || null;
      } else {
        payload = args[0] || null;
        meta = args[1] || null;
      }

      const tenantId = meta?.tenantId || payload?.tenantId;
      const user = meta?.user || payload?.user || null;

      const appId = payload?.appId || "mdx";
      const formSlug = payload?.formSlug;
      const submissionId = payload?.submissionId || payload?._id || null;
      const data = payload?.data || payload?.submissionData || {};

      if (!tenantId || !formSlug || !submissionId) {
        // MVP: if missing, do nothing (don’t crash platform)
        return;
      }

      await startInstanceForSubmission(tenantId, {
        appId,
        formSlug,
        submissionId,
        submissionData: data,
        startedByUser: user,
        source: "submission.submitted"
      });
    } catch (e) {
      // Never crash server on workflow listener failure
      // eslint-disable-next-line no-console
      console.error("[workflows] submission.submitted handler failed:", e?.message || e);
    }
  });
}
