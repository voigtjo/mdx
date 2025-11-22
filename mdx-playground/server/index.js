import Fastify from "fastify";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

import { mdxToHtmx, tokenizer, parser, renderer } from "mdx-htmx-lib";

import { mockDatasources } from "./datasources.js";
import { registerRoutes } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: true
});

/**
 * -------------------------------------------------------
 *  HTMX FIX: akzeptiere alle Content-Types
 *  (HTMX sendet NICHT application/x-www-form-urlencoded)
 * -------------------------------------------------------
 */
app.addContentTypeParser("*", (req, payload, done) => {
  let data = "";

  payload.on("data", chunk => {
    data += chunk;
  });

  payload.on("end", () => {
    done(null, data);
  });

  payload.on("error", err => {
    done(err, undefined);
  });
});

/**
 * -------------------------------------------------------
 *  View Engine (EJS)
 * -------------------------------------------------------
 */
app.register(fastifyView, {
  engine: { ejs },
  root: path.join(__dirname, "../views")
});

/**
 * -------------------------------------------------------
 *  Routes
 * -------------------------------------------------------
 */
registerRoutes(app, tokenizer, parser, renderer, mockDatasources);

/**
 * -------------------------------------------------------
 *  Server Start
 * -------------------------------------------------------
 */
const start = async () => {
  try {
    await app.listen({ port: 3000 });
    console.log("Playground running on http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
