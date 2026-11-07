import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = new Hono();

// Every file in src/routes/ is mounted at /api/<filename>. Add a file, get an endpoint; no need to edit this file.
const routesDir = new URL("./routes/", import.meta.url);
for (const file of readdirSync(routesDir).filter((f) => f.endsWith(".ts"))) {
  const name = file.replace(/\.ts$/, "");
  const mod = await import(new URL(file, routesDir).href);
  app.route(`/api/${name}`, mod.default);
  console.log(`route /api/${name}`);
}

// Production: also serve the built web app (web/dist from `npm run build`), so one process on one port is the whole site.
// Unknown non-API paths get index.html: the web app routes on the URL path (web/src/app/router.ts).
const dist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
if (existsSync(dist)) {
  app.use("*", serveStatic({ root: dist }));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : serveStatic({ root: dist, path: "index.html" })(c, next)));
  console.log(`web app from ${dist}`);
}

// Errors are JSON too (see AGENTS.md).
app.notFound((c) => c.json({ error: "not_found", message: `No route for ${c.req.path}` }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const code = err.status === 503 ? "unavailable" : err.status === 404 ? "not_found" : "bad_request";
    return c.json({ error: code, message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal", message: err.message }, 500);
});

// PORT is what hosting platforms set; API_PORT is ours for local dev.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`API on http://localhost:${port}`));
