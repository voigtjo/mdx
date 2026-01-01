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
  listUsers           // NEU
} from "./model.js";

const renderFile = promisify(ejs.renderFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsRoot = path.join(__dirname, "views");

async function render(reply, viewName, data) {
  const fullPath = path.join(viewsRoot, viewName);
  const html = await renderFile(fullPath, data);
  reply.type("text/html").send(html);
}

function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

// kleine Helfer, um MDX in Header + Body zu zerlegen
function splitMdx(mdx) {
  if (!mdx) return { header: "", body: "" };

  const trimmed = mdx.trim();
  const headerMatch = trimmed.match(/^@form[^\n]*\n([\s\S]*?)\n@endform\s*$/);

  if (!headerMatch) {
    // kein klassischer Wrapper – dann alles als Body behandeln
    return { header: "", body: trimmed };
  }

  return {
    header: trimmed.substring(0, trimmed.indexOf("\n")),
    body: headerMatch[1] || ""
  };
}

// -------------------------------------------------------------------
// Routen
// -------------------------------------------------------------------
export function registerMdxRoutes(app) {
  // Übersicht
  app.get("/mdx", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const docs = await listDocs(user.tenantId);

    return render(reply, "index.ejs", {
      user,
      docs
    });
  });

  // KEINE zweite /mdx/-Route mehr – sonst Dublettenfehler

  // -----------------------------------------------------------------
  // Formular bearbeiten / neu anlegen
  // -----------------------------------------------------------------
  app.get("/mdx/edit/:slug?", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slugParam = req.params.slug || "";
    let doc = slugParam ? await getDoc(user.tenantId, slugParam) : null;
    const allGroups = await listGroups(user.tenantId);

    let mdxBody = "";

    if (!doc) {
      // neues Formular
      const exampleSlug = slugParam || "example";
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

      doc._exampleSlug = exampleSlug;
    } else {
      // bestehendes Formular: Body aus doc.mdx herauslösen
      const { body } = splitMdx(doc.mdx || "");
      mdxBody = body;
    }

    return render(reply, "edit.ejs", {
      user,
      doc,
      allGroups,
      mdxBody
    });
  });

  // -----------------------------------------------------------------
  // Formular speichern
  // -----------------------------------------------------------------
  app.post("/mdx/save", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    let { slug, title, type, uniqueFieldKey } = req.body || {};

    // Body kann als "mdxBody" (neu) oder "mdx" (alt) kommen
    const mdxBodyRaw = (req.body.mdxBody ?? req.body.mdx ?? "").toString();

    // groupIds kann als String oder Array kommen
    let groupIds = [];
    if (Array.isArray(req.body.groupIds)) {
      groupIds = req.body.groupIds;
    } else if (req.body.groupIds) {
      groupIds = [req.body.groupIds];
    }

    if (!slug || !title || !mdxBodyRaw.trim()) {
      return reply.code(400).send("slug, title und mdxBody sind erforderlich");
    }

    const trimmedBody = mdxBodyRaw.trim();

    const finalType = type || "generic";

    // Business-Key: aus Formular oder Default je nach Typ
    let keyForHeader = (uniqueFieldKey || "").trim();
    if (!keyForHeader) {
      if (finalType === "user") keyForHeader = "userId";
      else if (finalType === "product") keyForHeader = "productId";
    }

    const keyAttr = keyForHeader ? ` key="${keyForHeader}"` : "";

    const header = `@form action="/mdx/forms/${slug}/submit"${keyAttr}`;
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

    return reply.redirect(`/mdx/edit/${encodeURIComponent(slug)}`);
  });

  // -----------------------------------------------------------------
  // Formular anzeigen (MDX -> HTMX)
  // -----------------------------------------------------------------
  app.get("/mdx/forms/:slug", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug;
    const doc = await getDoc(user.tenantId, slug);
    if (!doc) {
      return reply.code(404).send("MDX-Dokument nicht gefunden");
    }

    const formHtml = mdxToHtmx(doc.mdx);

    // NEU: User-Liste nur für User-Forms laden
    let users = [];
    if (doc.type === "user") {
      users = await listUsers(user.tenantId);
    }

    return render(reply, "form.ejs", {
      user,
      doc,
      formHtml,
      users
    });
  });

  // Formular-Submit: speichern + JSON-Dump anzeigen
  app.post("/mdx/forms/:slug/submit", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug;
    const body = req.body || {};

    await saveSubmission(user.tenantId, slug, body);

    reply.type("text/html");
    return `
<div class="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg text-sm font-mono">
  <div class="font-semibold mb-2">Formular empfangen (gespeichert):</div>
  <pre>${JSON.stringify(body, null, 2)}</pre>
</div>`;
  });

  // -----------------------------------------------------------------
  // Submissions-Ansicht
  // -----------------------------------------------------------------
  app.get("/mdx/forms/:slug/submissions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug;
    const submissions = await listSubmissions(user.tenantId, slug);

    return render(reply, "submissions.ejs", {
      user,
      slug,
      submissions
    });
  });

  // -----------------------------------------------------------------
  // Tasks-Ansicht
  // -----------------------------------------------------------------
  app.get("/mdx/tasks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { assignedTasks, openTasks } = await getTasksForUser(
      user.tenantId,
      user
    );

    return render(reply, "tasks.ejs", {
      user,
      assignedTasks,
      openTasks
    });
  });

  // Aufgabe übernehmen
  app.post("/mdx/tasks/:id/claim", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { id } = req.params;
    await claimTask(user.tenantId, id, user);
    reply.redirect("/mdx/tasks");
  });

  // Aufgabe als erledigt markieren
  app.post("/mdx/tasks/:id/complete", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { id } = req.params;
    await completeTask(user.tenantId, id, user);
    reply.redirect("/mdx/tasks");
  });
}

// Fallback-Export
export function register(app) {
  return registerMdxRoutes(app);
}
