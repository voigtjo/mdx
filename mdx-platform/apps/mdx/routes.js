// apps/mdx/routes.js

import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import ejs from "ejs";
import { mdxToHtmx } from "mdx-htmx-lib";

import {
  listDocs,
  getDoc,
  upsertDoc,
  saveSubmission,
  listSubmissions,
  listGroups,
  getTasksForUser,
  claimTask,
  completeTask,
  listUsers
} from "./model.js";

// App-Gate (B3/B4)
import { requireTenantAppEnabled } from "../../server/core/auth/guards.js";

// ✅ Core Events
import { events } from "../../server/core/events/bus.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsRoot = path.join(__dirname, "views");

// ✅ EJS root für absolute includes wie include("/partials/tenant_nav.ejs")
const uiRoot = path.join(__dirname, "..", "..", "server", "core", "ui");

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function render(reply, viewName, data = {}) {
  const fullPath = path.join(viewsRoot, viewName);

  // Alles, was server/index.js in reply.locals setzt (tenantId, enabledApps, ...)
  const locals = reply?.locals || {};
  const tenantId = locals.tenantId || data?.user?.tenantId || "";
  const enabledApps = locals.enabledApps || [];

  const html = await renderFile(
    fullPath,
    {
      ...locals,
      ...data,
      tenantId,
      enabledApps,
      title: data.title || "MDX Forms",
      currentApp: data.currentApp || "mdx"
    },
    { root: uiRoot }
  );

  reply.type("text/html; charset=utf-8").send(html);
}

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

/**
 * Optionaler Tenant-Schutz:
 * Wenn Route /tenant/:tenantId/... ist, dann muss req.params.tenantId zum Session-Tenant passen.
 */
function requireTenantMatch(req, reply, user) {
  const routeTenant = req.params?.tenantId;
  if (!routeTenant) return true;

  if (!user?.tenantId) {
    reply.code(403).send("Forbidden – kein tenantId in Session");
    return false;
  }

  if (String(routeTenant) !== String(user.tenantId)) {
    reply.code(403).send("Forbidden – Tenant mismatch");
    return false;
  }
  return true;
}

/**
 * baseUrl pro Request auflösen:
 * - Template kommt aus opts.baseUrlTemplate, z.B. "/tenant/:tenantId/app/mdx"
 * - ersetzt :tenantId mit req.params.tenantId
 */
function resolveBaseUrl(req, opts) {
  const tpl = opts?.baseUrlTemplate || "";
  if (!tpl) return "";

  let out = tpl;
  if (out.includes(":tenantId")) {
    const t = req.params?.tenantId ?? "";
    out = out.replace(":tenantId", encodeURIComponent(String(t)));
  }

  // trailing slash entfernen
  return out.replace(/\/+$/g, "");
}

// MDX Wrapper splitten (optional)
function splitMdx(mdx) {
  if (!mdx) return { header: "", body: "" };

  const trimmed = mdx.trim();
  const headerMatch = trimmed.match(/^@form[^\n]*\n([\s\S]*?)\n@endform\s*$/);

  if (!headerMatch) {
    return { header: "", body: trimmed };
  }

  return {
    header: trimmed.substring(0, trimmed.indexOf("\n")),
    body: headerMatch[1] || ""
  };
}

/**
 * ✅ Legacy-Fix: @form action normalisieren
 * Problem: alte Docs enthalten action="/mdx/forms/:slug/submit"
 * Lösung: beim Rendern korrigieren auf tenant-scoped Action.
 */
function normalizeFormAction(mdx, desiredAction) {
  if (!mdx) return mdx;

  // 1) Suche die erste Zeile, die mit "@form" beginnt
  const m = mdx.match(/^@form[^\n]*$/m);
  if (!m) return mdx;

  const formLine = m[0];

  let newFormLine = formLine;

  if (formLine.includes('action="')) {
    // action ersetzen
    newFormLine = formLine.replace(/action="[^"]*"/, `action="${desiredAction}"`);
  } else {
    // action anhängen (sauber mit Leerzeichen)
    newFormLine = `${formLine} action="${desiredAction}"`;
  }

  // 2) Ersetze exakt diese Form-Zeile im MDX
  return mdx.replace(formLine, newFormLine);
}

// ------------------------------------------------------------
// Fastify Plugin: MDX App
// ------------------------------------------------------------
export function registerMdxRoutes(app, opts = {}) {
  // Gate für ALLE MDX-Routen: App muss im Tenant enabled sein
  app.addHook("preHandler", async (req, reply) => {
    const okUser = await requireTenantAppEnabled(req, reply, "mdx");
    if (!okUser) return; // reply wurde bereits gesendet
  });

  // ----------------------------------------------------------
  // Übersicht
  // ----------------------------------------------------------
  app.get("/", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);
    const docs = await listDocs(user.tenantId);

    return render(reply, "index.ejs", {
      title: "MDX Forms",
      currentApp: "mdx",
      user,
      docs,
      baseUrl
    });
  });

  // ----------------------------------------------------------
  // Formular bearbeiten / neu anlegen
  // ----------------------------------------------------------
  app.get("/edit/:slug?", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const slugParam = req.params.slug || "";
    let doc = slugParam ? await getDoc(user.tenantId, slugParam) : null;
    const allGroups = await listGroups(user.tenantId);

    let mdxBody = "";

    if (!doc) {
      doc = {
        slug: slugParam,
        title: "",
        type: "generic",
        groupIds: [],
        uniqueFieldKey: ""
      };

      mdxBody = `@input name="kunde_name"  label="Name"
@input name="kunde_email" label="E-Mail"
@input name="firma"       label="Firma"
@select name="produkt"    label="Produkt" options="A-Standard,B-Plus,C-Premium"
@checkbox name="agb"        label="AGB gelesen und akzeptiert"
@checkbox name="newsletter" label="Newsletter abonnieren?"
@submit label="Anfrage absenden"`;
    } else {
      const { body } = splitMdx(doc.mdx || "");
      mdxBody = body;
    }

    return render(reply, "edit.ejs", {
      title: "MDX Forms",
      currentApp: "mdx",
      user,
      doc,
      allGroups,
      mdxBody,
      baseUrl
    });
  });

  // ----------------------------------------------------------
  // Formular speichern
  // ----------------------------------------------------------
  app.post("/save", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    let { slug, title, type, uniqueFieldKey } = req.body || {};
    const mdxBodyRaw = (req.body.mdxBody ?? req.body.mdx ?? "").toString();

    let groupIds = [];
    if (Array.isArray(req.body.groupIds)) groupIds = req.body.groupIds;
    else if (req.body.groupIds) groupIds = [req.body.groupIds];

    if (!slug || !title || !mdxBodyRaw.trim()) {
      return reply.code(400).send("slug, title und mdxBody sind erforderlich");
    }

    const trimmedBody = mdxBodyRaw.trim();
    const finalType = type || "generic";

    // Business-Key Default je nach Typ
    let keyForHeader = (uniqueFieldKey || "").trim();
    if (!keyForHeader) {
      if (finalType === "user") keyForHeader = "userId";
      else if (finalType === "product") keyForHeader = "productId";
    }

    const keyAttr = keyForHeader ? ` key="${keyForHeader}"` : "";

    // action muss zum Prefix passen
    const action = `${baseUrl}/forms/${slug}/submit`;
    const header = `@form action="${action}"${keyAttr}`;
    const footer = "@endform";

    const mdx = `${header}
${trimmedBody}
${footer}
`;

    await upsertDoc(user.tenantId, {
      slug,
      title,
      mdx,
      type: finalType,
      groupIds,
      uniqueFieldKey: keyForHeader || null
    });

    return reply.redirect(`${baseUrl}/edit/${encodeURIComponent(slug)}`);
  });

  // ----------------------------------------------------------
  // Formular anzeigen (MDX -> HTMX)
  // ----------------------------------------------------------
  app.get("/forms/:slug", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const slug = req.params.slug;
    const doc = await getDoc(user.tenantId, slug);
    if (!doc) return reply.code(404).send("MDX-Dokument nicht gefunden");

    // ✅ Legacy-Fix: action immer tenant-scoped setzen
    const desiredAction = `${baseUrl}/forms/${encodeURIComponent(slug)}/submit`;
    const fixedMdx = normalizeFormAction(doc.mdx || "", desiredAction);

    const formHtml = mdxToHtmx(fixedMdx);

    let users = [];
    if (doc.type === "user") {
      users = await listUsers(user.tenantId);
    }

    return render(reply, "form.ejs", {
      title: "Kundenanfrage Formular",
      currentApp: "mdx",
      user,
      doc,
      formHtml,
      users,
      baseUrl
    });
  });

  // ----------------------------------------------------------
  // Formular-Submit
  // ----------------------------------------------------------
  app.post("/forms/:slug/submit", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const slug = req.params.slug;
    const body = req.body || {};

    await saveSubmission(user.tenantId, slug, body);

    // ✅ Core Event (Audit + Webhook-Queue im Core)
    await events.emit(
      "submission.submitted",
      {
        appId: "mdx",
        formSlug: slug,
        data: body
      },
      {
        tenantId: user.tenantId,
        user,
        source: "apps/mdx"
      }
    );

    reply.type("text/html; charset=utf-8");
    return `
<div class="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg text-sm font-mono">
  <div class="font-semibold mb-2">Formular empfangen (gespeichert):</div>
  <pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>
</div>`;
  });

  // ----------------------------------------------------------
  // Submissions
  // ----------------------------------------------------------
  app.get("/forms/:slug/submissions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const slug = req.params.slug;
    const submissions = await listSubmissions(user.tenantId, slug);

    return render(reply, "submissions.ejs", {
      title: "MDX Forms",
      currentApp: "mdx",
      user,
      slug,
      submissions,
      baseUrl
    });
  });

  // ----------------------------------------------------------
  // Tasks
  // ----------------------------------------------------------
  app.get("/tasks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const { assignedTasks, openTasks } = await getTasksForUser(
      user.tenantId,
      user
    );

    return render(reply, "tasks.ejs", {
      title: "MDX Forms",
      currentApp: "mdx",
      user,
      assignedTasks,
      openTasks,
      baseUrl
    });
  });

  app.post("/tasks/:id/claim", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const { id } = req.params;
    await claimTask(user.tenantId, id, user);
    reply.redirect(`${baseUrl}/tasks`);
  });

  app.post("/tasks/:id/complete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!requireTenantMatch(req, reply, user)) return;

    const baseUrl = resolveBaseUrl(req, opts);

    const { id } = req.params;
    await completeTask(user.tenantId, id, user);
    reply.redirect(`${baseUrl}/tasks`);
  });
}

// Fastify-Plugin Export
export function register(app, opts, done) {
  registerMdxRoutes(app, opts || {});
  if (typeof done === "function") done();
}

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
