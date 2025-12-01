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
  listSubmissions
} from "./model.js";

// ---------------------------------------------------------
// EJS: renderFile als Promise
// ---------------------------------------------------------
const renderFile = promisify(ejs.renderFile);

// Absoluter Pfad zu apps/mdx/views
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsRoot = path.join(__dirname, "views");

// Helper um View als HTML zu rendern und zu senden
async function render(reply, viewName, data) {
  const fullPath = path.join(viewsRoot, viewName);
  const html = await renderFile(fullPath, data);
  reply.type("text/html; charset=utf-8").send(html);
}

// ---------------------------------------------------------
// Helper: Login-Pflicht
// ---------------------------------------------------------
function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

// ---------------------------------------------------------
// Routen-Registrierung
// ---------------------------------------------------------

export function registerMdxRoutes(app) {
  //
  // Übersicht: Liste aller MDX-Formulare
  //
  app.get("/mdx", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const docs = await listDocs(user.tenantId);

    return render(reply, "index.ejs", {
      user,
      docs
    });
  });

  //
  // Formular: neues / bestehendes MDX-Dokument bearbeiten
  //
  app.get("/mdx/edit/:slug?", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug || "";
    let doc = slug ? await getDoc(user.tenantId, slug) : null;

    // Wenn noch nichts existiert: Beispiel vorbelegen
    if (!doc) {
      const exampleSlug = slug || "example";
      doc = {
        slug,
        title: "",
        mdx: `@form action="/mdx/forms/${exampleSlug}/submit"
@input name="kunde_name"  label="Name"
@input name="kunde_email" label="E-Mail"
@input name="firma"       label="Firma"
@select name="produkt"    label="Produkt" options="A-Standard,B-Plus,C-Premium"
@checkbox name="agb"        label="AGB gelesen und akzeptiert"
@checkbox name="newsletter" label="Newsletter abonnieren?"
@submit label="Anfrage absenden"
@endform`
      };
    }

    return render(reply, "edit.ejs", {
      user,
      doc
    });
  });

  //
  // MDX-Formular speichern
  //
  app.post("/mdx/save", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { slug, title, mdx } = req.body || {};

    console.log("[MDX] Save form", { slug, title });

    if (!slug || !title || !mdx) {
      return reply.code(400).send("slug, title und mdx sind erforderlich");
    }

    await upsertDoc(user.tenantId, { slug, title, mdx });
    return reply.redirect(`/mdx/edit/${encodeURIComponent(slug)}`);
  });

  //
  // MDX → HTMX: Formularseite anzeigen
  //
  app.get("/mdx/forms/:slug", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug;
    const doc = await getDoc(user.tenantId, slug);
    if (!doc) {
      return reply.code(404).send("MDX-Dokument nicht gefunden");
    }

    const formHtml = mdxToHtmx(doc.mdx);

    return render(reply, "form.ejs", {
      user,
      doc,
      formHtml
    });
  });

  //
  // Formular-Submit: speichern + JSON-Dump anzeigen
  //
  app.post("/mdx/forms/:slug/submit", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const slug = req.params.slug;
    const body = req.body || {};

    await saveSubmission(user.tenantId, slug, body);

    reply.type("text/html; charset=utf-8");
    return `
<div class="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg text-sm font-mono">
  <div class="font-semibold mb-2">Formular empfangen (gespeichert):</div>
  <pre>${JSON.stringify(body, null, 2)}</pre>
</div>`;
  });

  //
  // Submissions-Ansicht (alle Einsendungen zu einem Formular)
  //
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
}

// Fallback-Export, falls irgendwo noch "register" verwendet wird
export function register(app) {
  return registerMdxRoutes(app);
}
