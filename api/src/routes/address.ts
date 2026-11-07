import { Hono } from "hono";
import { buildProfile } from "../profile.ts";
import { buildSummary } from "../summary.ts";

// GET /api/address/:id/profile -> the address profile (docs/PROFILE.md). Id format: docs/PROFILE.md -> "Address id".
// GET /api/address/:id/summary -> AI summary + the fact sentences behind it (PLAN.md -> "AI summary").
export default new Hono()
  .get("/:id/profile", async (c) => c.json(await buildProfile(c.req.param("id"))))
  .get("/:id/summary", async (c) => c.json(await buildSummary(c.req.param("id"))));
