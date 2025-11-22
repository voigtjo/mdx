import { mdxToHtmx } from "mdx-htmx-lib";

export function registerRoutes(app, tokenizer, parser, renderer, datasources) {
  
  /**
   * -------------------------------------------------------
   *  HELPERS: body parser für HTMX & normale Forms
   * -------------------------------------------------------
   */
  function parseBody(rawBody) {
    if (!rawBody) return {};

    // Wenn schon ein Objekt (bei JSON)
    if (typeof rawBody === "object") return rawBody;

    // HTMX sendet:  "mdx=....%0A...%0A"
    if (typeof rawBody === "string") {
      const obj = {};
      
      rawBody.split("&").forEach(part => {
        const [key, ...rest] = part.split("=");
        obj[key] = decodeURIComponent(rest.join("="));
      });

      return obj;
    }

    return {};
  }

  /**
   * -------------------------------------------------------
   *  Homepage
   * -------------------------------------------------------
   */
  app.get("/", async (req, reply) => {
    return reply.view("index.html");
  });

  /**
   * -------------------------------------------------------
   *  Render: MDX → HTMX
   * -------------------------------------------------------
   */
  app.post("/render", async (req, reply) => {
    const body = parseBody(req.body);
    const mdx = body.mdx || "";

    const html = mdxToHtmx(mdx);

    reply.type("text/html");
    return html;
  });

  /**
   * -------------------------------------------------------
   *  submit handler
   * -------------------------------------------------------
   */
  app.post("/submit", async (req, reply) => {
    const body = parseBody(req.body);
    console.log("Form data:", body);

    return `<div class="p-4 bg-green-200 rounded">
      Formular empfangen!<br>
      <pre>${JSON.stringify(body, null, 2)}</pre>
    </div>`;
  });

  /**
   * -------------------------------------------------------
   *  dynamic datasources
   * -------------------------------------------------------
   */
  app.get("/api/:name", async (req, reply) => {
    const key = "/api/" + req.params.name;
    return datasources[key] || [];
  });
}
