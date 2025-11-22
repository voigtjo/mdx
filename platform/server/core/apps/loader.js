import fs from "fs";
import path from "path";

export async function loadApps(app) {
  const appsDir = path.resolve("apps");

  if (!fs.existsSync(appsDir)) return;

  const apps = fs.readdirSync(appsDir);

  for (const appName of apps) {
    const manifestPath = path.join(appsDir, appName, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const routesFile = path.join(appsDir, appName, "routes.js");

    if (!fs.existsSync(routesFile)) {
      console.log(`Skipping app ${appName} – missing routes.js`);
      continue;
    }

    console.log("Loading app:", manifest.name);

    const routes = await import(routesFile);

    app.register(routes.default, {
      prefix: `/tenant/:tenantId${manifest.routePrefix}`
    });
  }
}
