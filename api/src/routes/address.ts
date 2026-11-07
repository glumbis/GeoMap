import { Hono } from "hono";
import { buildProfile } from "../profile.ts";

// GET /api/address/:id/profile -> the address profile (docs/PROFILE.md). Id format: docs/PROFILE.md -> "Address id".
export default new Hono().get("/:id/profile", async (c) => c.json(await buildProfile(c.req.param("id"))));
