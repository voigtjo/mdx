// apps/mdx/routes.js
import { mdxToHtmx } from "mdx-htmx-lib";
import { listDocs, getDoc, upsertDoc } from "./model.js";

/**
 * Pfad zu den Views relativ zum fastify-view-root (server/core/ui)
 * root: server/core/ui
 * views: ../../../apps/mdx/views
 */
const VIEWS_BASE = "../../../apps/mdx/views";

/**
 * Sicherstellen, dass der Benutzer eingeloggt ist.
 */
function requireUser(req, reply) {
  if (!req.session || !req.session.user) {
    reply.redirect("/login");
    return null;
  }
  return req.session.user;
}

/**
 * Haupt-Registrierfunktion für die MDX-App.
 * Wird in server/index.js mit
 *   import { register as registerMdxRoutes } from "../apps/mdx/routes.js";
 * eingebunden.
 */
export function register(app /*, appConfig */) {
  //
  // Übersicht: Liste aller MDX-Formulare
  //
  app.get("/mdx", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const docs = await listDocs(user.tenantId);

    return reply.view(`${VIEWS_BASE}/index.ejs`, {
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

    // Falls noch nichts gespeichert ist → Beispiel vorbelegen
    if (!doc) {
      const exampleSlug = slug || "example";
      doc = {
        slug,
        title: slug ? `Formular ${slug}` : "",
        mdx: `@form action="/mdx/forms/${exampleSlug}/submit"
@input  name="kunde_name"   label="Name"
@input  name="kunde_email"  label="E-Mail"
@input  name="firma"        label="Firma"
@select name="produkt"      label="Produkt" options="A-Standard,B-Premium,C-Enterprise"
@checkbox name="agb"        label="AGB gelesen und akzeptiert"
@checkbox name="newsletter" label="Newsletter abonnieren?"
@submit label="Anfrage absenden"
@endform`
      };
    }

    return reply.view(`${VIEWS_BASE}/edit.ejs`, {
      user,
      doc
    });
  });

  //
  // MDX-Dokument speichern (neu oder update)
  //
  app.post("/mdx/save", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { slug, title, mdx } = req.body || {};

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

    return reply.view(`${VIEWS_BASE}/form.ejs`, {
      user,
      doc,
      formHtml
    });
  });

  //
  // Formular-Submit entgegennehmen
  //
  app.post("/mdx/forms/:slug/submit", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const body = req.body || {};

    reply.type("text/html");
    return `
<div class="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg text-sm font-mono">
  <div class="font-semibold mb-2">Formular empfangen:</div>
  <pre>${JSON.stringify(body, null, 2)}</pre>
</div>`;
  });
}

/**
 * Optionaler Alias – falls wir später einen Loader nutzen,
 * der nach registerMdxApp() sucht.
 */
export function registerMdxApp(app, appConfig) {
  return register(app, appConfig);
}
