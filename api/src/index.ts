import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { readdirSync } from "node:fs";

const app = new Hono();

// Every file in src/routes/ is mounted at /api/<filename>. Add a file, get an endpoint; no need to edit this file.
const routesDir = new URL("./routes/", import.meta.url);
for (const file of readdirSync(routesDir).filter((f) => f.endsWith(".ts"))) {
  const name = file.replace(/\.ts$/, "");
  const mod = await import(new URL(file, routesDir).href);
  app.route(`/api/${name}`, mod.default);
  console.log(`route /api/${name}`);
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

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`API on http://localhost:${port}`));
